const asyncHandler = require("express-async-handler");
const { query, toCamel } = require("../lib/database");
const { normalizeAnswers } = require("../utils/normalizeAnswers");
const { questionForSubmission } = require("../utils/publicQuestion");
const { finalizeClaimedSubmission } = require("../services/submissionService");
const { evaluateCode } = require("../utils/codeRunner");
const { PROCTOR_EVENT_TYPES } = require("../utils/proctorEvents");

async function getSubmission(req, id, res) {
  const { rows } = await query("SELECT * FROM submissions WHERE id = $1", [id]);
  const data = rows[0];
  if (!data) {
    res.status(404);
    throw new Error("Submission not found");
  }
  if (req.user.role !== "admin" && data.student_id !== req.authUser.id) {
    res.status(403);
    throw new Error("Not authorized to access this submission");
  }
  return data;
}

async function getAssessment(req, examId, res) {
  const { rows } = await query("SELECT * FROM assessments WHERE id = $1", [examId]);
  const data = rows[0];
  if (!data) {
    res.status(404);
    throw new Error("Assessment not found");
  }
  return data;
}

async function getQuestions(req, ids, res) {
  if (!ids?.length) return [];
  const { rows } = await query("SELECT * FROM questions WHERE id = ANY($1::uuid[])", [ids]);
  return rows.map(toCamel);
}

const saveAnswer = asyncHandler(async (req, res) => {
  const submission = await getSubmission(req, req.params.id, res);
  if (submission.status !== "in-progress") {
    res.status(409);
    throw new Error("Assessment has already been submitted");
  }
  const { questionId, type, selectedOptionIndex, selectedOptionIndexes, code, language } = req.body;
  const exam = await getAssessment(req, submission.exam_id, res);
  if (!(exam.question_ids || []).includes(questionId)) {
    res.status(400);
    throw new Error("Question is not part of this assessment");
  }
  const questions = await getQuestions(req, [questionId], res);
  const question = questions[0];
  if (!question || question.type !== type) {
    res.status(400);
    throw new Error("Answer type does not match the question");
  }
  if (type === "coding" && typeof code === "string" && Buffer.byteLength(code, "utf8") > 100_000) {
    res.status(400);
    throw new Error("Code must be no more than 100 KB.");
  }
  if (type === "coding" && language !== undefined
    && !["c", "cpp", "java", "python", "php", "javascript", "csharp", "go", "rust"].includes(language)) {
    res.status(400);
    throw new Error("Select a supported programming language before saving code.");
  }
  const optionOrder = submission.option_orders?.[questionId];
  const answer = {
    question: questionId,
    type,
    selectedOptionIndex: typeof selectedOptionIndex === "number" && optionOrder?.length ? optionOrder[selectedOptionIndex] : selectedOptionIndex,
    selectedOptionIndexes: optionOrder?.length ? (selectedOptionIndexes || []).map((index) => optionOrder[index]) : selectedOptionIndexes,
    code,
    language,
  };
  const { rows } = await query(
    `UPDATE submissions AS s
     SET answers = COALESCE((
       SELECT jsonb_agg(answer_item)
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(s.answers) = 'array'
           THEN s.answers ELSE $5::jsonb END
       ) AS answer_item
       WHERE answer_item->>'question' <> $2
     ), '[]'::jsonb) || jsonb_build_array($3::jsonb), updated_at = now()
     FROM assessments a
     WHERE s.id = $1 AND s.student_id = $4 AND s.status = 'in-progress'
       AND a.id = s.exam_id
       AND clock_timestamp() < LEAST(
         s.started_at + a.duration_minutes * INTERVAL '1 minute',
         COALESCE(a.end_time, 'infinity'::timestamptz)
       )
     RETURNING s.id`,
    [submission.id, questionId, answer, req.authUser.id, JSON.stringify(normalizeAnswers(submission.answers))]
  );
  if (!rows.length) {
    res.status(409);
    throw new Error("Assessment has expired or has already been submitted");
  }
  res.json({ message: "Answer saved" });
});

const runCodingCode = asyncHandler(async (req, res) => {
  const submission = await getSubmission(req, req.params.id, res);
  if (submission.status !== "in-progress") {
    res.status(409);
    throw new Error("This assessment is no longer accepting code runs.");
  }
  const { questionId, code, language } = req.body;
  if (typeof code !== "string" || !code.trim() || Buffer.byteLength(code, "utf8") > 100_000) {
    res.status(400);
    throw new Error("Enter code of up to 100 KB before running it.");
  }
  const exam = await getAssessment(req, submission.exam_id, res);
  const { rows: activeAttempts } = await query(
    `SELECT s.id
     FROM submissions s
     JOIN assessments a ON a.id = s.exam_id
     WHERE s.id = $1 AND s.student_id = $2 AND s.status = 'in-progress'
       AND clock_timestamp() < LEAST(
         s.started_at + a.duration_minutes * INTERVAL '1 minute',
         COALESCE(a.end_time, 'infinity'::timestamptz)
       )`,
    [submission.id, req.authUser.id]
  );
  if (!activeAttempts.length) {
    res.status(409);
    throw new Error("The assessment has expired. Only code runs started before the deadline are allowed.");
  }
  if (!(exam.question_ids || []).includes(questionId)) {
    res.status(400);
    throw new Error("Question is not part of this assessment.");
  }
  const [question] = await getQuestions(req, [questionId], res);
  if (!question || question.type !== "coding") {
    res.status(400);
    throw new Error("Code can only be run for a coding question in this assessment.");
  }
  const supportedLanguages = new Set(["c", "cpp", "java", "python", "php", "javascript", "csharp", "go", "rust"]);
  if (!supportedLanguages.has(language)) {
    res.status(400);
    throw new Error("Select a supported programming language before running code.");
  }
  const visibleTestCases = (question.testCases || []).filter((testCase) => !testCase.hidden);
  if (!visibleTestCases.length) {
    res.status(400);
    throw new Error("This question has no visible sample tests to run. Submit the exam to be graded against its hidden tests.");
  }
  const testResults = await evaluateCode({
    code,
    language,
    testCases: visibleTestCases,
    timeLimitMs: question.timeLimitMs,
  });
  res.json({ testResults });
});

const logProctorEvent = asyncHandler(async (req, res) => {
  const submission = await getSubmission(req, req.params.id, res);
  if (submission.status !== "in-progress") {
    res.status(409);
    throw new Error("The assessment is no longer active; warning events cannot be added.");
  }
  const { eventType } = req.body;
  if (!PROCTOR_EVENT_TYPES.has(eventType)) {
    res.status(400);
    throw new Error("Unsupported exam warning event.");
  }
  const { rows } = await query(
    `WITH inserted AS (
       INSERT INTO assessment_proctor_events (submission_id, event_type)
       SELECT s.id, $3
       FROM submissions s
       JOIN assessments a ON a.id = s.exam_id
       WHERE s.id = $1 AND s.student_id = $2 AND s.status = 'in-progress'
         AND clock_timestamp() < LEAST(
           s.started_at + a.duration_minutes * INTERVAL '1 minute',
           COALESCE(a.end_time, 'infinity'::timestamptz)
         )
       RETURNING id, created_at
     )
     SELECT inserted.id, inserted.created_at,
       (SELECT COUNT(*)::int FROM assessment_proctor_events WHERE submission_id = $1) AS warning_count,
       (SELECT COUNT(*)::int FROM assessment_proctor_events WHERE submission_id = $1 AND event_type = $3) AS event_count
     FROM inserted`,
    [submission.id, req.authUser.id, eventType]
  );
  if (!rows.length) {
    res.status(409);
    throw new Error("The assessment has expired; warning events can no longer be recorded.");
  }
  res.status(201).json({
    warningCount: rows[0].warning_count,
    eventCount: rows[0].event_count,
    recordedAt: rows[0].created_at,
  });
});

const submitExam = asyncHandler(async (req, res) => {
  const submission = await getSubmission(req, req.params.id, res);
  if (submission.status === "evaluated") {
    return res.json({ message: "Already submitted", submissionId: submission.id });
  }
  normalizeAnswers(submission.answers);
  const { rows: claimedRows } = await query(
    `UPDATE submissions AS s
     SET status = 'evaluating', evaluation_token = gen_random_uuid(), updated_at = now()
     FROM assessments a
     WHERE s.id = $1 AND s.student_id = $2 AND s.status = 'in-progress' AND a.id = s.exam_id
     RETURNING s.*, clock_timestamp() >= LEAST(
       s.started_at + a.duration_minutes * INTERVAL '1 minute',
       COALESCE(a.end_time, 'infinity'::timestamptz)
     ) AS is_expired`,
    [submission.id, req.authUser.id]
  );
  const claimed = claimedRows[0];
  if (!claimed) {
    const current = await getSubmission(req, req.params.id, res);
    if (current.status === "evaluated") return res.json({ message: "Already submitted", submissionId: current.id });
    res.status(409);
    throw new Error("Submission is already being evaluated");
  }

  let result;
  try {
    const answers = normalizeAnswers(claimed.answers);
    result = await finalizeClaimedSubmission({ ...claimed, answers }, claimed.is_expired);
  } catch (error) {
    await query(
      "UPDATE submissions SET status = 'in-progress', evaluation_token = NULL, updated_at = now() WHERE id = $1 AND status = 'evaluating' AND evaluation_token = $2",
      [claimed.id, claimed.evaluation_token]
    );
    throw error;
  }
  res.json({
    message: "Assessment submitted and evaluated",
    submissionId: result.id,
    totalMarksAwarded: result.total_marks_awarded,
    totalMarksPossible: result.total_marks_possible,
    percentage: result.percentage,
    questionsAttempted: result.questions_attempted,
    correctAnswers: result.correct_answers,
    incorrectAnswers: result.incorrect_answers,
    unansweredQuestions: result.unanswered_questions,
    accuracy: result.accuracy,
    timeTakenSeconds: result.time_taken_seconds,
    sectionScores: result.section_scores,
  });
});

const getMySubmissions = asyncHandler(async (req, res) => {
  const { rows: submissions } = await query(
    "SELECT * FROM submissions WHERE student_id = $1 AND status = 'evaluated' ORDER BY submitted_at DESC",
    [req.authUser.id]
  );
  const examIds = [...new Set(submissions.map((submission) => submission.exam_id))];
  const { rows: exams } = examIds.length
    ? await query("SELECT id, title, total_marks, duration_minutes FROM assessments WHERE id = ANY($1::uuid[])", [examIds])
    : { rows: [] };
  const byId = new Map(exams.map((exam) => [exam.id, toCamel(exam)]));
  res.json(submissions.map((submission) => ({ ...toCamel(submission), exam: byId.get(submission.exam_id) })));
});

const getSubmissionById = asyncHandler(async (req, res) => {
  const submission = await getSubmission(req, req.params.id, res);
  const exam = await getAssessment(req, submission.exam_id, res);
  const answers = normalizeAnswers(submission.answers);
  const questions = await getQuestions(req, answers.map((answer) => answer.question), res);
  const questionById = new Map(questions.map((question) => [question._id, question]));
  const response = toCamel(submission);
  response.exam = toCamel(exam);
  response.answers = answers.map((answer) => ({
    ...answer,
    question: questionForSubmission(questionById.get(answer.question) || null, {
      isAdmin: req.user.role === "admin",
      isEvaluated: submission.status === "evaluated",
    }),
  }));
  res.json(response);
});

const getSubmissionsForExam = asyncHandler(async (req, res) => {
  const { rows: data } = await query(
    "SELECT * FROM submissions WHERE exam_id = $1 AND status = 'evaluated' ORDER BY percentage DESC",
    [req.params.examId]
  );
  const studentIds = [...new Set(data.map((submission) => submission.student_id))];
  const { rows: students } = studentIds.length
    ? await query("SELECT * FROM profiles WHERE id = ANY($1::uuid[])", [studentIds])
    : { rows: [] };
  const byId = new Map(students.map((student) => [student.id, toCamel(student)]));
  res.json(data.map((submission) => ({ ...toCamel(submission), student: byId.get(submission.student_id) })));
});

const updateSelectionStatus = asyncHandler(async (req, res) => {
  const { selectionStatus } = req.body;
  if (!["pending", "shortlisted", "rejected"].includes(selectionStatus)) {
    res.status(400);
    throw new Error("Selection status must be pending, shortlisted, or rejected");
  }
  const { rows } = await query(
    "UPDATE submissions SET selection_status = $1, updated_at = now() WHERE id = $2 AND status = 'evaluated' RETURNING id, selection_status",
    [selectionStatus, req.params.id]
  );
  const data = rows[0];
  if (!data) {
    res.status(404);
    throw new Error("Evaluated submission not found");
  }
  res.json({ submissionId: data.id, selectionStatus: data.selection_status });
});

module.exports = {
  saveAnswer,
  runCodingCode,
  logProctorEvent,
  submitExam,
  getMySubmissions,
  getSubmissionById,
  getSubmissionsForExam,
  updateSelectionStatus,
};