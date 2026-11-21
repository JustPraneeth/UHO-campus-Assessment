const { query } = require("../lib/database");
const { finalizeClaimedSubmission } = require("./submissionService");

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 50;

async function claimExpiredSubmissions(batchSize = DEFAULT_BATCH_SIZE, queryFn = query) {
  const { rows } = await queryFn(
    `WITH expired AS (
       SELECT s.id
       FROM submissions s
       JOIN assessments a ON a.id = s.exam_id
       WHERE (
           s.status = 'in-progress'
           OR (s.status = 'evaluating' AND s.updated_at < now() - INTERVAL '1 minute')
         )
         AND ($2::boolean OR NOT EXISTS (
           SELECT 1
           FROM unnest(a.question_ids) AS selected_question(id)
           JOIN questions q ON q.id = selected_question.id
           WHERE q.type <> 'mcq'
         ))
         AND LEAST(
           s.started_at + a.duration_minutes * INTERVAL '1 minute',
           COALESCE(a.end_time, 'infinity'::timestamptz)
         ) <= now()
       ORDER BY s.started_at
       LIMIT $1
       FOR UPDATE OF s SKIP LOCKED
     )
     UPDATE submissions s
     SET status = 'evaluating', evaluation_token = gen_random_uuid(), updated_at = now()
     FROM expired
     WHERE s.id = expired.id AND s.status IN ('in-progress', 'evaluating')
     RETURNING s.*`,
    [batchSize, Boolean(process.env.ONLINECOMPILER_API_KEY?.trim())]
  );
  return rows;
}

async function finalizeExpiredBatch() {
  const submissions = await claimExpiredSubmissions();
  const results = await Promise.allSettled(
    submissions.map((submission) => finalizeClaimedSubmission(submission, true))
  );
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const submission = submissions[index];
    console.error(`[expired-submission] Could not finalize ${submission.id}: ${result.reason.message}`);
    query(
      "UPDATE submissions SET status = 'in-progress', evaluation_token = NULL, updated_at = now() WHERE id = $1 AND status = 'evaluating' AND evaluation_token = $2",
      [submission.id, submission.evaluation_token]
    ).catch((error) => {
      console.error(`[expired-submission] Could not release ${submission.id}: ${error.message}`);
    });
  });
  return results.filter((result) => result.status === "fulfilled").length;
}

function startExpiredSubmissionWorker({
  intervalMs = DEFAULT_INTERVAL_MS,
  runBatch = finalizeExpiredBatch,
} = {}) {
  let running = false;
  let consecutiveFailures = 0;
  let nextAttemptAt = 0;
  const timer = setInterval(async () => {
    if (running || Date.now() < nextAttemptAt) return;
    running = true;
    try {
      await runBatch();
      consecutiveFailures = 0;
      nextAttemptAt = 0;
    } catch (error) {
      consecutiveFailures += 1;
      const retryDelayMs = Math.min(intervalMs * (2 ** consecutiveFailures), 60000);
      nextAttemptAt = Date.now() + retryDelayMs;
      const code = error.code ? `${error.code} ` : "";
      console.error(`[expired-submission] Worker cycle failed: ${code}${error.message}. Retrying in ${retryDelayMs}ms.`);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { claimExpiredSubmissions, finalizeExpiredBatch, startExpiredSubmissionWorker };
