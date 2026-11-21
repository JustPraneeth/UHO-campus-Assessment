const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSslMode, prepareValue, queryWithDnsRetry, toCamel, toSnake } = require("../lib/database");

test("maps profile and nested JSON fields to API camelCase", () => {
  assert.deepEqual(toCamel({
    id: "profile-id",
    college_name: "Campus",
    section_scores: [{ category: "Quant", total_marks: 10 }],
  }), {
    _id: "profile-id",
    collegeName: "Campus",
    sectionScores: [{ category: "Quant", totalMarks: 10 }],
  });
});

test("maps API payloads to database snake_case", () => {
  assert.deepEqual(toSnake({
    questionIds: ["id-a"],
    randomizeOptions: true,
    testCases: [{ expectedOutput: "ok" }],
  }), {
    question_ids: ["id-a"],
    randomize_options: true,
    test_cases: [{ expected_output: "ok" }],
  });
});

test("serializes JSONB arrays for node-postgres", () => {
  assert.equal(prepareValue("answers", [{ question: "question-id" }]), '[{"question":"question-id"}]');
  assert.deepEqual(prepareValue("question_ids", ["question-id"]), ["question-id"]);
});

test("uses explicit full certificate verification for legacy PostgreSQL SSL modes", () => {
  assert.equal(
    normalizeSslMode("postgres://db.example/app?sslmode=require&connect_timeout=10"),
    "postgres://db.example/app?sslmode=verify-full&connect_timeout=10"
  );
  assert.equal(
    normalizeSslMode("postgres://db.example/app?sslmode=disable"),
    "postgres://db.example/app?sslmode=disable"
  );
});

test("retries transient DNS failures for database queries", async () => {
  let attempts = 0;
  const result = await queryWithDnsRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error("DNS lookup temporarily failed"), { code: "EAI_AGAIN" });
    return { rows: [{ count: 1 }] };
  }, "WITH expired AS (SELECT id FROM submissions) UPDATE submissions SET status = 'evaluating'");

  assert.equal(attempts, 2);
  assert.deepEqual(result.rows, [{ count: 1 }]);
});

test("does not retry non-DNS database errors", async () => {
  let attempts = 0;
  await assert.rejects(queryWithDnsRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
  }, "UPDATE submissions SET status = 'evaluated'"), /connection refused/);
  assert.equal(attempts, 1);
});