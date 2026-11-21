const test = require("node:test");
const assert = require("node:assert/strict");
const { hasUnconfiguredCodingQuestions } = require("../utils/assessmentAvailability");

test("requires OnlineCompiler only when an assessment contains coding questions", () => {
  assert.equal(hasUnconfiguredCodingQuestions([{ type: "mcq" }], ""), false);
  assert.equal(hasUnconfiguredCodingQuestions([{ type: "coding" }], ""), true);
  assert.equal(hasUnconfiguredCodingQuestions([{ type: "mcq" }, { type: "coding" }], "  "), true);
  assert.equal(hasUnconfiguredCodingQuestions([{ type: "coding" }], "configured-key"), false);
});
