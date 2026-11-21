const LANGUAGE_COMPILERS = {
  c: "gcc-15",
  cpp: "g++-15",
  java: "openjdk-25",
  python: "python-3.14",
  php: "php-8.5",
  javascript: "nodejs-24",
  csharp: "dotnet-csharp-10",
  go: "go-1.26",
  rust: "rust-1.93",
};
const DEFAULT_API_URL = "https://api.onlinecompiler.io/api/";
const DEFAULT_TIMEOUT_MS = Number(process.env.CODE_EXEC_TIMEOUT_MS) || 5000;
const DEFAULT_MAX_TESTS_PER_REQUEST = 32;
const MAX_RETRIES = 3;

function getCompiler(language) {
  const compiler = LANGUAGE_COMPILERS[language];
  if (!compiler) throw new Error(`Unsupported language: ${language}`);
  return compiler;
}

function getOnlineCompilerConfig(language) {
  const apiKey = process.env.ONLINECOMPILER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Coding assessments are not configured. Set ONLINECOMPILER_API_KEY in the backend environment.");
  }
  return {
    apiKey,
    apiUrl: process.env.ONLINECOMPILER_API_URL?.trim() || DEFAULT_API_URL,
    compiler: getCompiler(language),
  };
}

function responseErrorMessage(result, status) {
  return result?.error || result?.message || `OnlineCompiler returned HTTP ${status}`;
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 10000));
    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) return Math.max(0, Math.min(retryAt - Date.now(), 10000));
  }
  return Math.min(500 * (2 ** attempt) + Math.floor(Math.random() * 250), 5000);
}

async function postRunTests(apiUrl, apiKey, body) {
  const url = new URL("run-tests/", apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(70000),
      });
    } catch (cause) {
      if (cause.name !== "AbortError" && cause.name !== "TimeoutError" && cause.name !== "TypeError") throw cause;
      const error = new Error("OnlineCompiler could not be reached in time. Answers are saved; wait a short time and submit again.");
      error.statusCode = 503;
      throw error;
    }
    const result = await response.json().catch(() => ({}));
    if (response.status === 429 && attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error("OnlineCompiler rejected its API key. Ask the administrator to verify ONLINECOMPILER_API_KEY.");
      error.statusCode = 503;
      throw error;
    }
    if (response.status === 429) {
      const error = new Error("OnlineCompiler is busy or the account has reached its current limits. Answers are saved; wait a short time and submit again.");
      error.statusCode = 503;
      throw error;
    }
    if (!response.ok) {
      throw new Error(`OnlineCompiler request failed (${response.status}): ${responseErrorMessage(result, response.status)}`);
    }
    if (!Array.isArray(result.tests)) {
      throw new Error("OnlineCompiler returned an invalid run-tests response");
    }
    return result;
  }
}

function getMaxTestsPerRequest() {
  const raw = process.env.ONLINECOMPILER_MAX_TESTS_PER_REQUEST;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_TESTS_PER_REQUEST;
  const configured = Number(raw);
  if (!Number.isInteger(configured) || configured < 1 || configured > 240) {
    throw new Error("ONLINECOMPILER_MAX_TESTS_PER_REQUEST must be an integer from 1 to 240.");
  }
  return configured;
}

async function evaluateCode({ code, language, testCases, timeLimitMs }) {
  const { apiKey, apiUrl, compiler } = getOnlineCompilerConfig(language);
  const timeoutMs = Math.min(30000, Math.max(100, Number(timeLimitMs) || DEFAULT_TIMEOUT_MS));
  const chunkSize = getMaxTestsPerRequest();
  const results = [];

  for (let offset = 0; offset < testCases.length; offset += chunkSize) {
    const cases = testCases.slice(offset, offset + chunkSize);
    const response = await postRunTests(apiUrl, apiKey, {
      compiler,
      code,
      tests: cases.map((testCase) => ({
        input: testCase.input || "",
        expected_output: testCase.expectedOutput,
        hidden: Boolean(testCase.hidden),
      })),
      time_limit: timeoutMs / 1000,
      scoring: "percent",
      checker: "trim",
    });
    if (response.tests.length !== cases.length) {
      throw new Error("OnlineCompiler returned an incomplete test result set. Please retry submission.");
    }
    response.tests.forEach((result, index) => {
      const testCase = cases[index];
      const hidden = Boolean(testCase.hidden);
      results.push({
        passed: result.verdict === "accepted",
        hidden,
        input: hidden ? undefined : testCase.input,
        expectedOutput: hidden ? undefined : testCase.expectedOutput,
        actualOutput: hidden ? undefined : result.output || "",
        error: hidden
          ? undefined
          : result.error || response.compile_error || (result.verdict === "accepted" ? undefined : result.verdict),
      });
    });
  }
  return results;
}

module.exports = { evaluateCode, getCompiler, getOnlineCompilerConfig };
