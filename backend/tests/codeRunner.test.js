const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateCode, getCompiler } = require("../utils/codeRunner");

const originalKey = process.env.ONLINECOMPILER_API_KEY;
const originalUrl = process.env.ONLINECOMPILER_API_URL;
const originalBatchSize = process.env.ONLINECOMPILER_MAX_TESTS_PER_REQUEST;
const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ONLINECOMPILER_API_KEY;
  else process.env.ONLINECOMPILER_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.ONLINECOMPILER_API_URL;
  else process.env.ONLINECOMPILER_API_URL = originalUrl;
  if (originalBatchSize === undefined) delete process.env.ONLINECOMPILER_MAX_TESTS_PER_REQUEST;
  else process.env.ONLINECOMPILER_MAX_TESTS_PER_REQUEST = originalBatchSize;
});

test("maps supported languages to OnlineCompiler compiler IDs", () => {
  assert.equal(getCompiler("c"), "gcc-15");
  assert.equal(getCompiler("cpp"), "g++-15");
  assert.equal(getCompiler("java"), "openjdk-25");
  assert.equal(getCompiler("python"), "python-3.14");
  assert.equal(getCompiler("php"), "php-8.5");
  assert.equal(getCompiler("javascript"), "nodejs-24");
  assert.equal(getCompiler("csharp"), "dotnet-csharp-10");
  assert.equal(getCompiler("go"), "go-1.26");
  assert.equal(getCompiler("rust"), "rust-1.93");
  assert.throws(() => getCompiler("ruby"), /Unsupported language/);
});

test("runs coding test cases through OnlineCompiler in one batch", async () => {
  process.env.ONLINECOMPILER_API_KEY = "test-token";
  process.env.ONLINECOMPILER_API_URL = "https://api.onlinecompiler.io/api/";
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        tests: [
          { verdict: "accepted", output: "42\n", error: "" },
          { verdict: "wrong_answer", hidden: true },
        ],
      }),
    };
  };

  const results = await evaluateCode({
    code: "print(input())",
    language: "python",
    testCases: [
      { input: "42", expectedOutput: "42" },
      { input: "secret", expectedOutput: "hidden", hidden: true },
    ],
    timeLimitMs: 2000,
  });

  assert.equal(request.url, "https://api.onlinecompiler.io/api/run-tests/");
  assert.equal(request.options.headers.Authorization, "test-token");
  assert.equal(request.options.headers["X-Auth-Token"], undefined);
  assert.deepEqual(JSON.parse(request.options.body), {
    compiler: "python-3.14",
    code: "print(input())",
    tests: [
      { input: "42", expected_output: "42", hidden: false },
      { input: "secret", expected_output: "hidden", hidden: true },
    ],
    time_limit: 2,
    scoring: "percent",
    checker: "trim",
  });
  assert.equal(results[0].passed, true);
  assert.equal(results[0].actualOutput, "42\n");
  assert.equal(results[1].passed, false);
  assert.equal(results[1].input, undefined);
  assert.equal(results[1].expectedOutput, undefined);
  assert.equal(results[1].actualOutput, undefined);
});

test("fails clearly when the API key is missing", async () => {
  delete process.env.ONLINECOMPILER_API_KEY;
  await assert.rejects(
    evaluateCode({ code: "print(1)", language: "python", testCases: [{ input: "", expectedOutput: "1" }] }),
    /Set ONLINECOMPILER_API_KEY/
  );
});

test("retries a rate-limited run-tests request", async () => {
  process.env.ONLINECOMPILER_API_KEY = "test-token";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => "0" },
        json: async () => ({ error: "busy" }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ tests: [{ verdict: "accepted", output: "1" }] }) };
  };

  const results = await evaluateCode({
    code: "print(1)",
    language: "python",
    testCases: [{ input: "", expectedOutput: "1" }],
  });
  assert.equal(calls, 2);
  assert.equal(results[0].passed, true);
});

test("reports exhausted provider limits as a retryable service error", async () => {
  process.env.ONLINECOMPILER_API_KEY = "test-token";
  global.fetch = async () => ({
    ok: false,
    status: 429,
    headers: { get: () => "0" },
    json: async () => ({ error: "busy" }),
  });

  await assert.rejects(
    evaluateCode({ code: "print(1)", language: "python", testCases: [{ input: "", expectedOutput: "1" }] }),
    (error) => error.statusCode === 503 && /answers are saved/i.test(error.message)
  );
});

test("splits test lists using the configured account batch limit", async () => {
  process.env.ONLINECOMPILER_API_KEY = "test-token";
  process.env.ONLINECOMPILER_MAX_TESTS_PER_REQUEST = "1";
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    const [{ expected_output: output }] = JSON.parse(options.body).tests;
    return { ok: true, status: 200, json: async () => ({ tests: [{ verdict: "accepted", output }] }) };
  };

  const results = await evaluateCode({
    code: "print(input())",
    language: "python",
    testCases: [
      { input: "one", expectedOutput: "one" },
      { input: "two", expectedOutput: "two" },
    ],
  });
  assert.equal(calls, 2);
  assert.deepEqual(results.map((result) => result.passed), [true, true]);
});

test("reports invalid configured batch sizes instead of silently changing them", async () => {
  process.env.ONLINECOMPILER_API_KEY = "test-token";
  process.env.ONLINECOMPILER_MAX_TESTS_PER_REQUEST = "241";
  await assert.rejects(
    evaluateCode({ code: "print(1)", language: "python", testCases: [{ input: "", expectedOutput: "1" }] }),
    /must be an integer from 1 to 240/
  );
});
