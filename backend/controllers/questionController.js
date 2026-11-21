const asyncHandler = require("express-async-handler");
const { insertRow, query, toCamel, toSnake, updateRow } = require("../lib/database");

const questionColumns = [
  "type", "title", "description", "category", "tags", "difficulty", "marks", "negative_marks",
  "is_active", "options", "correct_option_index", "allow_multiple_correct", "correct_option_indexes",
  "starter_code", "language", "test_cases", "time_limit_ms", "created_by",
];
const editableQuestionColumns = questionColumns.filter((column) => column !== "created_by");
const supportedLanguages = new Set(["c", "cpp", "java", "python", "php", "javascript", "csharp", "go", "rust"]);

function validateQuestion(payload, res) {
  if (!payload.type || !["mcq", "coding"].includes(payload.type)) {
    res.status(400);
    throw new Error("Question type must be mcq or coding");
  }
  if (payload.type === "mcq" && (!Array.isArray(payload.options) || payload.options.length < 2)) {
    res.status(400);
    throw new Error("MCQ questions require at least 2 options");
  }
  if (payload.type === "mcq" && payload.allowMultipleCorrect) {
    const correctIndexes = payload.correctOptionIndexes;
    if (!Array.isArray(correctIndexes)
      || correctIndexes.length === 0
      || new Set(correctIndexes).size !== correctIndexes.length
      || correctIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= payload.options.length)) {
      res.status(400);
      throw new Error("Multiple-answer questions require valid correct option indexes");
    }
  }
  if (payload.type === "coding") {
    if (!supportedLanguages.has(payload.language)) {
      res.status(400);
      throw new Error("Select a supported coding language");
    }
    if (!Array.isArray(payload.testCases) || payload.testCases.length < 1 || payload.testCases.some(
      (testCase) => !testCase
        || typeof testCase.input !== "string"
        || typeof testCase.expectedOutput !== "string"
        || (testCase.hidden !== undefined && typeof testCase.hidden !== "boolean")
    )) {
      res.status(400);
      throw new Error("Coding questions require test cases with input and expected output text");
    }
    if (payload.testCases.length > 240) {
      res.status(400);
      throw new Error("Coding questions can contain at most 240 test cases");
    }
    if (payload.testCases.some(
      (testCase) => Buffer.byteLength(testCase.input) > 100_000 || Buffer.byteLength(testCase.expectedOutput) > 65_536
    )) {
      res.status(400);
      throw new Error("Each coding test input must be at most 100 KB and expected output at most 64 KB");
    }
    const testDataBytes = payload.testCases.reduce((total, testCase) => (
      total + Buffer.byteLength(testCase.input) + Buffer.byteLength(testCase.expectedOutput)
    ), 0);
    if (testDataBytes > 1_000_000) {
      res.status(400);
      throw new Error("Combined coding test input and expected output must be no more than 1 MB");
    }
  }
}

function failIf(error, res, message) {
  if (!error) return;
  res.status(error.code === "23505" ? 409 : 400);
  throw new Error(error.message || message);
}

const createQuestion = asyncHandler(async (req, res) => {
  const payload = { ...req.body, createdBy: req.authUser.id };
  validateQuestion(payload, res);
  try {
    const data = await insertRow("questions", toSnake(payload), questionColumns);
    res.status(201).json(toCamel(data));
  } catch (error) {
    failIf(error, res, "Could not create question");
  }
});

const getQuestions = asyncHandler(async (req, res) => {
  const { type, difficulty, tag, search } = req.query;
  const conditions = [];
  const values = [];
  if (type) { values.push(type); conditions.push(`type = $${values.length}`); }
  if (difficulty) { values.push(difficulty); conditions.push(`difficulty = $${values.length}`); }
  if (tag) { values.push(tag); conditions.push(`tags @> ARRAY[$${values.length}]::text[]`); }
  if (search) {
    values.push(`%${String(search).replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`title ILIKE $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await query(`SELECT * FROM questions ${where} ORDER BY created_at DESC`, values);
  res.json(toCamel(rows));
});

const getQuestionById = asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT * FROM questions WHERE id = $1", [req.params.id]);
  const data = rows[0];
  if (!data) {
    res.status(404);
    throw new Error("Question not found");
  }
  res.json(toCamel(data));
});

const updateQuestion = asyncHandler(async (req, res) => {
  if (req.body.type || req.body.testCases || req.body.language) {
    let existingQuestion = {};
    if (!req.body.type) {
      const { rows } = await query("SELECT * FROM questions WHERE id = $1", [req.params.id]);
      if (!rows[0]) {
        res.status(404);
        throw new Error("Question not found");
      }
      existingQuestion = toCamel(rows[0]);
    }
    validateQuestion({ ...existingQuestion, ...req.body }, res);
  }
  const payload = toSnake(req.body);
  const data = await updateRow("questions", payload, editableQuestionColumns, "id = $" + (Object.keys(payload).filter((column) => editableQuestionColumns.includes(column)).length + 1), [req.params.id]);
  if (!data) {
    res.status(404);
    throw new Error("Question not found");
  }
  res.json(toCamel(data));
});

const deleteQuestion = asyncHandler(async (req, res) => {
  const { rows } = await query("DELETE FROM questions WHERE id = $1 RETURNING id", [req.params.id]);
  const data = rows[0];
  if (!data) {
    res.status(404);
    throw new Error("Question not found");
  }
  res.json({ message: "Question deleted" });
});

module.exports = { createQuestion, getQuestions, getQuestionById, updateQuestion, deleteQuestion, validateQuestion };