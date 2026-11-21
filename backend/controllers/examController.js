const asyncHandler = require("express-async-handler");
const { insertRow, query, toCamel, toSnake, updateRow } = require("../lib/database");
const { normalizeAnswers } = require("../utils/normalizeAnswers");
const { hasUnconfiguredCodingQuestions } = require("../utils/assessmentAvailability");

const CODING_RUNNER_UNAVAILABLE =
  "This exam includes coding questions, but code execution is not configured. Contact the exam administrator to add the OnlineCompiler API key or replace the coding questions.";

const examColumns = [
  "title", "description", "instructions", "question_ids", "duration_minutes", "number_of_questions",
  "total_marks", "passing_percentage", "cutoff_percentage", "start_time", "end_time",
  "randomize_questions", "randomize_options", "is_published", "created_by",
];
const editableExamColumns = examColumns.filter((column) => column !== "created_by");

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const createExam = asyncHandler(async (req, res) => {
  const {
    title, description, instructions, questionIds, durationMinutes, startTime, endTime,
    isPublished, passingPercentage, cutoffPercentage, randomizeQuestions, randomizeOptions,
  } = req.body;
  if (!title || !Number(durationMinutes) || !Array.isArray(questionIds) || !questionIds.length) {
    res.status(400);
    throw new Error("Title, durationMinutes and at least one question are required");
  }
  const { rows: questions } = await query(
    "SELECT id, marks, type, is_active FROM questions WHERE id = ANY($1::uuid[])",
    [questionIds]
  );
  if (questions.length !== questionIds.length) {
    res.status(400);
    throw new Error("One or more selected questions do not exist");
  }
  if (questions.some((question) => !["mcq", "coding"].includes(question.type) || !question.is_active)) {
    res.status(400);
    throw new Error("Assessments can include active MCQ and coding questions only");
  }
  if (isPublished && hasUnconfiguredCodingQuestions(questions)) {
    res.status(503);
    throw new Error("Set ONLINECOMPILER_API_KEY in the backend environment or remove coding questions before publishing this assessment.");
  }
  const payload = {
    title, description, instructions, questionIds,
    durationMinutes: Number(durationMinutes),
    numberOfQuestions: questionIds.length,
    totalMarks: questions.reduce((sum, question) => sum + Number(question.marks), 0),
    passingPercentage: Number(passingPercentage || 0),
    cutoffPercentage: Number(cutoffPercentage ?? 70),
    startTime: startTime || null,
    endTime: endTime || null,
    randomizeQuestions: !!randomizeQuestions,
    randomizeOptions: !!randomizeOptions,
    isPublished: !!isPublished,
    createdBy: req.authUser.id,
  };
  const data = await insertRow("assessments", toSnake(payload), examColumns);
  res.status(201).json(toCamel(data));
});

const getAllExams = asyncHandler(async (req, res) => {
  const { rows: exams } = await query("SELECT * FROM assessments ORDER BY created_at DESC");
  const questionIds = [...new Set(exams.flatMap((exam) => exam.question_ids || []))];
  const { rows: questions } = questionIds.length
    ? await query("SELECT id, title, type, marks FROM questions WHERE id = ANY($1::uuid[])", [questionIds])
    : { rows: [] };
  const byId = new Map(questions.map((question) => [question.id, toCamel(question)]));
  res.json(exams.map((exam) => ({ ...toCamel(exam), questions: (exam.question_ids || []).map((id) => byId.get(id)).filter(Boolean) })));
});

const getAvailableExams = asyncHandler(async (req, res) => {
  const [{ rows: registrations }, { rows: exams }] = await Promise.all([
    query("SELECT exam_id FROM assessment_registrations WHERE student_id = $1", [req.authUser.id]),
    query("SELECT * FROM assessments WHERE is_published = true ORDER BY created_at DESC"),
  ]);
  if (!exams.length) return res.json([]);
  const ids = exams.map((exam) => exam.id);
  const { rows: submissions } = await query(
    "SELECT exam_id, status FROM submissions WHERE student_id = $1 AND exam_id = ANY($2::uuid[])",
    [req.authUser.id, ids]
  );
  const registeredIds = new Set(registrations.map((registration) => registration.exam_id));
  const statusByExam = new Map(submissions.map((submission) => [submission.exam_id, submission.status]));
  const now = new Date();
  res.json(exams.map((exam) => ({
    ...toCamel(exam),
    isRegistered: registeredIds.has(exam.id),
    attemptStatus: statusByExam.get(exam.id) || (registeredIds.has(exam.id) ? "not-started" : "not-registered"),
    isExpiredWindow: Boolean(exam.end_time && new Date(exam.end_time) < now),
    notStartedYet: Boolean(exam.start_time && new Date(exam.start_time) > now),
  })));
});

const registerCandidate = asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT id, is_published, end_time FROM assessments WHERE id = $1", [req.params.id]);
  const exam = rows[0];
  if (!exam || !exam.is_published || (exam.end_time && new Date(exam.end_time) < new Date())) {
    res.status(404);
    throw new Error("Assessment is not available for registration");
  }
  await query(
    "INSERT INTO assessment_registrations (exam_id, student_id) VALUES ($1, $2) ON CONFLICT (exam_id, student_id) DO NOTHING",
    [exam.id, req.authUser.id]
  );
  res.json({ examId: exam.id, message: "Registered for assessment" });
});

const updateExam = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  delete payload.questionIds;
  let selectedQuestions;
  if (req.body.questionIds) {
    if (!Array.isArray(req.body.questionIds) || req.body.questionIds.length === 0) {
      res.status(400);
      throw new Error("At least one question is required");
    }
    const { rows: questions } = await query(
      "SELECT id, marks, type, is_active FROM questions WHERE id = ANY($1::uuid[])",
      [req.body.questionIds]
    );
    if (questions.length !== req.body.questionIds.length) {
      res.status(400);
      throw new Error("One or more selected questions do not exist");
    }
    if (questions.some((question) => !["mcq", "coding"].includes(question.type) || !question.is_active)) {
      res.status(400);
      throw new Error("Assessments can include active MCQ and coding questions only");
    }
    selectedQuestions = questions;
    payload.questionIds = req.body.questionIds;
    payload.numberOfQuestions = questions.length;
    payload.totalMarks = questions.reduce((sum, question) => sum + Number(question.marks), 0);
  }
  if (payload.isPublished) {
    if (!selectedQuestions) {
      const { rows: exams } = await query("SELECT question_ids FROM assessments WHERE id = $1", [req.params.id]);
      const questionIds = exams[0]?.question_ids || [];
      const { rows } = questionIds.length
        ? await query("SELECT type FROM questions WHERE id = ANY($1::uuid[])", [questionIds])
        : { rows: [] };
      selectedQuestions = rows;
    }
    if (hasUnconfiguredCodingQuestions(selectedQuestions)) {
      res.status(503);
      throw new Error("Set ONLINECOMPILER_API_KEY in the backend environment or remove coding questions before publishing this assessment.");
    }
  }
  const snakePayload = toSnake(payload);
  const updateColumns = Object.keys(snakePayload).filter((column) => editableExamColumns.includes(column));
  const data = await updateRow(
    "assessments", snakePayload, editableExamColumns,
    `id = $${updateColumns.length + 1}`, [req.params.id]
  );
  if (!data) {
    res.status(404);
    throw new Error("Assessment not found");
  }
  res.json(toCamel(data));
});

const deleteExam = asyncHandler(async (req, res) => {
  const { rows } = await query("DELETE FROM assessments WHERE id = $1 RETURNING id", [req.params.id]);
  const data = rows[0];
  if (!data) {
    res.status(404);
    throw new Error("Assessment not found");
  }
  res.json({ message: "Assessment deleted" });
});

const getExamForTaking = asyncHandler(async (req, res) => {
  const { rows: examRows } = await query("SELECT * FROM assessments WHERE id = $1", [req.params.id]);
  const exam = examRows[0];
  if (!exam || !exam.is_published) {
    res.status(404);
    throw new Error("Assessment not found");
  }
  const now = new Date();
  const { rows: registrations } = await query(
    "SELECT id, status FROM assessment_registrations WHERE exam_id = $1 AND student_id = $2",
    [exam.id, req.authUser.id]
  );
  const registration = registrations[0];
  if (!registration) {
    res.status(403);
    throw new Error("Register using the candidate assessment link before starting");
  }
  const { rows: questions } = exam.question_ids?.length
    ? await query("SELECT * FROM questions WHERE id = ANY($1::uuid[])", [exam.question_ids])
    : { rows: [] };
  const byId = new Map(questions.map((question) => [question.id, toCamel(question)]));
  const orderedQuestions = exam.question_ids.map((id) => byId.get(id)).filter(Boolean);
  if (hasUnconfiguredCodingQuestions(orderedQuestions)) {
    res.status(503);
    throw new Error(CODING_RUNNER_UNAVAILABLE);
  }
  const { rows: existingSubmissions } = await query(
    "SELECT * FROM submissions WHERE exam_id = $1 AND student_id = $2",
    [exam.id, req.authUser.id]
  );
  let submission = existingSubmissions[0];
  if (exam.start_time && now < new Date(exam.start_time) && !submission) {
    res.status(403);
    throw new Error("This assessment has not started yet");
  }
  if (exam.end_time && now > new Date(exam.end_time) && !submission) {
    res.status(403);
    throw new Error("This assessment's submission window has closed");
  }
  if (submission?.status === "evaluated") {
    res.status(409);
    throw new Error("You have already submitted this assessment");
  }

  if (!submission) {
    const questionOrder = exam.randomize_questions ? shuffled(orderedQuestions.map((question) => question._id)) : orderedQuestions.map((question) => question._id);
    const optionOrders = {};
    if (exam.randomize_options) {
      orderedQuestions.filter((question) => question.type === "mcq").forEach((question) => {
        optionOrders[question._id] = shuffled(question.options.map((_, index) => index));
      });
    }
    const { rows: createdSubmissions } = await query(
      `INSERT INTO submissions (exam_id, student_id, question_order, option_orders, answers)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (exam_id, student_id) DO NOTHING RETURNING *`,
      [exam.id, req.authUser.id, questionOrder, optionOrders, []]
    );
    if (createdSubmissions[0]) submission = createdSubmissions[0];
    else {
      const { rows: resumedSubmissions } = await query(
        "SELECT * FROM submissions WHERE exam_id = $1 AND student_id = $2",
        [exam.id, req.authUser.id]
      );
      submission = resumedSubmissions[0];
    }
  }
  await query(
    "UPDATE assessment_registrations SET status = 'in-progress', updated_at = now() WHERE exam_id = $1 AND student_id = $2",
    [exam.id, req.authUser.id]
  );

  const optionOrders = submission.option_orders || {};
  const questionOrder = submission.question_order?.length ? submission.question_order : orderedQuestions.map((question) => question._id);
  const questionsForClient = questionOrder.map((id) => byId.get(id)).filter(Boolean).map((question) => {
    const order = optionOrders[question._id];
    return {
      _id: question._id,
      type: question.type,
      title: question.title,
      description: question.description,
      category: question.category,
      marks: question.marks,
      negativeMarks: question.negativeMarks,
      difficulty: question.difficulty,
      options: question.type === "mcq" ? (order?.length ? order.map((index) => question.options[index]) : question.options) : undefined,
      allowMultipleCorrect: question.type === "mcq" ? question.allowMultipleCorrect : undefined,
      starterCode: question.type === "coding" ? question.starterCode : undefined,
      language: question.type === "coding" ? question.language : undefined,
      visibleTestCases: question.type === "coding" ? question.testCases.filter((testCase) => !testCase.hidden) : undefined,
    };
  });
  const deadline = new Date(new Date(submission.started_at).getTime() + exam.duration_minutes * 60000);
  const finalDeadline = exam.end_time && new Date(exam.end_time) < deadline ? new Date(exam.end_time) : deadline;
  const savedAnswers = normalizeAnswers(submission.answers).map((answer) => {
    const order = optionOrders[answer.question];
    if (!order?.length) return answer;
    return {
      ...answer,
      selectedOptionIndex: typeof answer.selectedOptionIndex === "number" ? order.indexOf(answer.selectedOptionIndex) : undefined,
      selectedOptionIndexes: answer.selectedOptionIndexes?.map((index) => order.indexOf(index)),
    };
  });
  const { rows: warningRows } = await query(
    "SELECT event_type, COUNT(*)::int AS count FROM assessment_proctor_events WHERE submission_id = $1 GROUP BY event_type",
    [submission.id]
  );
  const warningCounts = Object.fromEntries(warningRows.map((warning) => [warning.event_type, warning.count]));
  res.json({
    submissionId: submission.id,
    exam: { _id: exam.id, title: exam.title, description: exam.description, instructions: exam.instructions, durationMinutes: exam.duration_minutes, totalMarks: exam.total_marks },
    questions: questionsForClient,
    startedAt: submission.started_at,
    deadline: finalDeadline,
    savedAnswers,
    warningCounts,
  });
});

module.exports = { createExam, getAllExams, getAvailableExams, registerCandidate, updateExam, deleteExam, getExamForTaking };