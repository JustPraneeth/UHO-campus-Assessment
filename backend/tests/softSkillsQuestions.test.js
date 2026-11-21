const test = require("node:test");
const assert = require("node:assert/strict");
const { sampleQuestions } = require("../utils/seed");

test("seeds all nine interview soft-skills questions with valid answer keys", () => {
  const questions = sampleQuestions.filter((question) => question.category === "Soft Skills");
  assert.equal(questions.length, 9);
  assert.ok(questions.every((question) => question.type === "mcq"));
  assert.equal(questions.filter((question) => question.allow_multiple_correct).length, 4);

  for (const question of questions) {
    if (question.allow_multiple_correct) {
      assert.ok(question.correct_option_indexes.length >= 2);
      assert.ok(question.correct_option_indexes.every((index) => index >= 0 && index < question.options.length));
    } else {
      assert.ok(question.correct_option_index >= 0 && question.correct_option_index < question.options.length);
    }
  }
});
