const test = require("node:test");
const assert = require("node:assert/strict");
const { publicErrorMessage } = require("../utils/publicError");

test("replaces unexpected server details with a generic client message", () => {
  assert.equal(
    publicErrorMessage(new Error("postgres://private-host/internal"), 500),
    "An unexpected error occurred"
  );
});

test("preserves safe validation errors and maps duplicate records", () => {
  assert.equal(publicErrorMessage(new Error("Assessment time has expired"), 409), "Assessment time has expired");
  assert.equal(publicErrorMessage({ code: "23505", message: "duplicate key value" }, 409), "A record with that unique value already exists");
});

test("deliberate 503 messages are shown to users", () => {
  assert.equal(
    publicErrorMessage(new Error("OnlineCompiler is busy or the account has reached its current limits. Answers are saved; wait a short time and submit again."), 503),
    "OnlineCompiler is busy or the account has reached its current limits. Answers are saved; wait a short time and submit again."
  );
});

test("database connection failures map to 503 with a friendly message", () => {
  const { publicStatusCode } = require("../utils/publicError");
  const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND db.example"), { code: "ENOTFOUND" });
  assert.equal(publicStatusCode(dnsError, 500), 503);
  assert.match(publicErrorMessage(dnsError, 503), /Database is temporarily unavailable/);
  assert.doesNotMatch(publicErrorMessage(dnsError, 503), /db\.example/);
});
