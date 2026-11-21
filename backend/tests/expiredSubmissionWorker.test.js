const test = require("node:test");
const assert = require("node:assert/strict");
const { claimExpiredSubmissions, startExpiredSubmissionWorker } = require("../services/expiredSubmissionWorker");

test("claims only deadline-expired attempts using database time and skip-locked rows", async () => {
  let capturedSql = "";
  let capturedBatchSize;
  const rows = [{ id: "submission-1" }];
  const claimed = await claimExpiredSubmissions(25, async (sql, values) => {
    capturedSql = sql;
    capturedBatchSize = values[0];
    return { rows };
  });

  assert.equal(claimed, rows);
  assert.equal(capturedBatchSize, 25);
  assert.match(capturedSql, /s\.started_at \+ a\.duration_minutes/);
  assert.match(capturedSql, /<= now\(\)/);
  assert.match(capturedSql, /FOR UPDATE OF s SKIP LOCKED/);
  assert.match(capturedSql, /s\.status = 'in-progress'/);
  assert.match(capturedSql, /s\.status = 'evaluating'.*INTERVAL '1 minute'/s);
  assert.match(capturedSql, /evaluation_token = gen_random_uuid\(\)/);
});

test("worker avoids overlapping timer runs and stops cleanly", async () => {
  let activeRuns = 0;
  let maximumActiveRuns = 0;
  let totalRuns = 0;
  const stop = startExpiredSubmissionWorker({
    intervalMs: 5,
    runBatch: async () => {
      activeRuns += 1;
      maximumActiveRuns = Math.max(maximumActiveRuns, activeRuns);
      totalRuns += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRuns -= 1;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 45));
  stop();
  const stoppedAt = totalRuns;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(stoppedAt >= 1);
  assert.equal(totalRuns, stoppedAt);
  assert.equal(maximumActiveRuns, 1);
});

test("worker increases the delay after failed cycles", async () => {
  const starts = [];
  const stop = startExpiredSubmissionWorker({
    intervalMs: 10,
    runBatch: async () => {
      starts.push(Date.now());
      throw new Error("temporary database failure");
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 80));
  stop();

  assert.ok(starts.length >= 2);
  assert.ok(starts[1] - starts[0] >= 15);
});
