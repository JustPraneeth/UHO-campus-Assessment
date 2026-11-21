const test = require("node:test");
const assert = require("node:assert/strict");
const { questionForSubmission } = require("../utils/publicQuestion");

test("hides answer keys and internal fields from active candidate submissions", () => {
  const question = {
    _id: "question-1",
    type: "mcq",
    title: "Question",
    description: "Choose an answer",
    category: "Logic",
    tags: [],
    difficulty: "easy",
    marks: 1,
    negativeMarks: 0,
    options: ["A", "B"],
    allowMultipleCorrect: false,
    correctOptionIndex: 1,
    correctOptionIndexes: [1],
    createdBy: "admin-1",
  };

  const publicQuestion = questionForSubmission(question, { isAdmin: false, isEvaluated: false });

  assert.deepEqual(publicQuestion, {
    _id: "question-1",
    type: "mcq",
    title: "Question",
    description: "Choose an answer",
    category: "Logic",
    tags: [],
    difficulty: "easy",
    marks: 1,
    negativeMarks: 0,
    options: ["A", "B"],
    allowMultipleCorrect: false,
  });
  assert.equal("correctOptionIndex" in publicQuestion, false);
  assert.equal("correctOptionIndexes" in publicQuestion, false);
});

test("preserves full question details for admins and evaluated candidate results", () => {
  const question = { _id: "question-1", correctOptionIndex: 1 };
  assert.equal(questionForSubmission(question, { isAdmin: true, isEvaluated: false }), question);
  assert.equal(questionForSubmission(question, { isAdmin: false, isEvaluated: true }), question);
});
