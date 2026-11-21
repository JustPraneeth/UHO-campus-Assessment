const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateSubmission, evaluateMcq } = require("../utils/evaluator");
const { clusterCandidates } = require("../utils/performanceInsights");

test("scores correct, incorrect, and unanswered questions with negative marks", async () => {
  const result = await evaluateSubmission(
    [
      { question: "quant-correct", type: "mcq", selectedOptionIndex: 1 },
      { question: "verbal-wrong", type: "mcq", selectedOptionIndex: 0 },
    ],
    [
      { _id: "quant-correct", type: "mcq", category: "Quantitative Aptitude", marks: 2, correctOptionIndex: 1 },
      { _id: "verbal-wrong", type: "mcq", category: "Verbal Ability", marks: 1, negativeMarks: 0.25, correctOptionIndex: 1 },
      { _id: "quant-empty", type: "mcq", category: "Quantitative Aptitude", marks: 1, correctOptionIndex: 0 },
    ]
  );

  assert.equal(result.totalAwarded, 1.75);
  assert.equal(result.totalPossible, 4);
  assert.equal(result.percentage, 43.75);
  assert.equal(result.questionsAttempted, 2);
  assert.equal(result.correctAnswers, 1);
  assert.equal(result.incorrectAnswers, 1);
  assert.equal(result.unansweredQuestions, 1);
  assert.equal(result.accuracy, 50);
  assert.deepEqual(result.sectionScores.map((section) => section.category), ["Quantitative Aptitude", "Verbal Ability"]);
});

test("scores PostgreSQL numeric strings without concatenating marks", async () => {
  const result = await evaluateSubmission(
    [
      { question: "correct", type: "mcq", selectedOptionIndex: 0 },
      { question: "wrong", type: "mcq", selectedOptionIndex: 0 },
    ],
    [
      { _id: "correct", type: "mcq", marks: "1", correctOptionIndex: 0 },
      { _id: "wrong", type: "mcq", marks: "1", negativeMarks: "0.25", correctOptionIndex: 1 },
    ]
  );

  assert.equal(result.totalAwarded, 0.75);
  assert.equal(result.totalPossible, 2);
  assert.equal(result.percentage, 37.5);
});

test("matches multi-select answers independent of selected order", () => {
  const question = { allowMultipleCorrect: true, correctOptionIndexes: [1, 3], marks: 2 };
  assert.deepEqual(evaluateMcq(question, { selectedOptionIndexes: [3, 1] }), { isCorrect: true, marksAwarded: 2 });
});

test("creates descriptive candidate profiles without assigning incomplete candidates", () => {
  const candidates = [
    { status: "completed", percentage: 90, sectionScores: [{ category: "Quant", percentage: 95 }, { category: "Verbal", percentage: 80 }] },
    { status: "completed", percentage: 45, sectionScores: [{ category: "Quant", percentage: 35 }, { category: "Verbal", percentage: 60 }] },
    { status: "completed", percentage: 68, sectionScores: [{ category: "Quant", percentage: 70 }, { category: "Verbal", percentage: 66 }] },
    { status: "in-progress", percentage: null, sectionScores: [] },
  ];

  const result = clusterCandidates(candidates);
  assert.equal(result.profiles.reduce((total, profile) => total + profile.candidateCount, 0), 3);
  assert.ok(candidates.slice(0, 3).every((candidate) => candidate.performanceProfile));
  assert.equal(candidates[3].performanceProfile, undefined);
});