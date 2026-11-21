const test = require("node:test");
const assert = require("node:assert/strict");
const { validateQuestion } = require("../controllers/questionController");

function validate(payload) {
  let statusCode = 200;
  const response = { status(code) { statusCode = code; return this; } };
  try {
    validateQuestion(payload, response);
    return { statusCode };
  } catch (error) {
    return { statusCode, message: error.message };
  }
}

test("accepts stdin/stdout coding test cases with optional hidden flags", () => {
  assert.deepEqual(validate({
    type: "coding",
    language: "php",
    testCases: [
      { input: "2\n3 4\n", expectedOutput: "7\n", hidden: false },
      { input: "0\n", expectedOutput: "0", hidden: true },
    ],
  }), { statusCode: 200 });
});

test("accepts supported coding languages and rejects unknown languages", () => {
  const base = { type: "coding", testCases: [{ input: "", expectedOutput: "" }] };
  for (const language of ["c", "cpp", "java", "python", "php", "javascript", "csharp", "go", "rust"]) {
    assert.deepEqual(validate({ ...base, language }), { statusCode: 200 });
  }
  assert.match(validate({ ...base, language: "brainfuck" }).message, /supported coding language/i);
});

test("accepts valid multiple-answer MCQs and rejects missing or invalid answer keys", () => {
  const question = {
    type: "mcq",
    options: ["A", "B", "C", "D"],
    allowMultipleCorrect: true,
    correctOptionIndexes: [1, 2],
  };
  assert.deepEqual(validate(question), { statusCode: 200 });
  assert.match(validate({ ...question, correctOptionIndexes: [] }).message, /valid correct option indexes/);
  assert.match(validate({ ...question, correctOptionIndexes: [1, 1] }).message, /valid correct option indexes/);
  assert.match(validate({ ...question, correctOptionIndexes: [4] }).message, /valid correct option indexes/);
});

test("rejects malformed, oversized, and excessive coding test cases", () => {
  const base = { type: "coding", language: "python", testCases: [{ input: "", expectedOutput: "" }] };
  assert.match(validate({ ...base, testCases: [{ input: "", expectedOutput: "", hidden: "yes" }] }).message, /test cases with input and expected output/);
  assert.match(validate({ ...base, testCases: [{ input: "x".repeat(100_001), expectedOutput: "" }] }).message, /Each coding test input/);
  assert.match(validate({ ...base, testCases: Array.from({ length: 241 }, () => ({ input: "", expectedOutput: "" })) }).message, /at most 240/);
});
