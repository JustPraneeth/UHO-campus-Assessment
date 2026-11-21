const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAnswers } = require("../utils/normalizeAnswers");

test("keeps submission answer arrays unchanged", () => {
  const answers = [{ question: "question-1", selectedOptionIndex: 2 }];
  assert.equal(normalizeAnswers(answers), answers);
});

test("converts legacy question-keyed answers to an answer array", () => {
  assert.deepEqual(normalizeAnswers({
    "question-1": { selectedOptionIndex: 2 },
  }), [
    { question: "question-1", selectedOptionIndex: 2 },
  ]);
});

test("accepts JSON-encoded and wrapped answer arrays", () => {
  const answers = [{ question: "question-1", code: "return 1;" }];
  assert.deepEqual(normalizeAnswers(JSON.stringify({ answers })), answers);
});

test("rejects malformed answer data explicitly", () => {
  assert.throws(() => normalizeAnswers("not-json"), /invalid JSON/);
  assert.throws(() => normalizeAnswers({ "question-1": "invalid" }), /entries must be objects/);
});
