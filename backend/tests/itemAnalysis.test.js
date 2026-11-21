const test = require("node:test");
const assert = require("node:assert/strict");
const { buildItemAnalysis } = require("../utils/itemAnalysis");

test("reports question difficulty and flags items with insufficient or unusual statistics", () => {
  const questions = [
    { id: "easy", title: "Easy", category: "Logic", difficulty: "easy" },
    { id: "hard", title: "Hard", category: "Logic", difficulty: "medium" },
  ];
  const submissions = [
    { total_marks_awarded: 10, answers: [{ question: "easy", isCorrect: true, selectedOptionIndex: 0 }, { question: "hard", isCorrect: true, selectedOptionIndex: 0 }] },
    { total_marks_awarded: 8, answers: [{ question: "easy", isCorrect: true, selectedOptionIndex: 0 }, { question: "hard", isCorrect: false, selectedOptionIndex: 1 }] },
    { total_marks_awarded: 4, answers: [{ question: "easy", isCorrect: true, selectedOptionIndex: 0 }, { question: "hard", isCorrect: false, selectedOptionIndex: 1 }] },
    { total_marks_awarded: 1, answers: [{ question: "easy", isCorrect: true, selectedOptionIndex: 0 }] },
  ];

  const report = buildItemAnalysis(questions, submissions);
  assert.equal(report[0].difficultyIndex, 1);
  assert.equal(report[0].flag, "unusually easy");
  assert.equal(report[1].difficultyIndex, 0.33);
  assert.equal(report[1].discriminationIndex, 0.5);
  assert.equal(report[1].flag, "within expected range");
});

test("does not compute a discrimination index for fewer than four candidates", () => {
  const [item] = buildItemAnalysis(
    [{ id: "q", title: "Question", difficulty: "medium" }],
    [{ total_marks_awarded: 1, answers: [] }]
  );
  assert.equal(item.discriminationIndex, null);
  assert.equal(item.flag, "insufficient responses");
});
