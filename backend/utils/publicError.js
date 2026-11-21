const CONNECTION_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "57P01", // admin_shutdown (e.g. serverless compute suspended)
]);

function isConnectionError(error) {
  return Boolean(error) && (CONNECTION_ERROR_CODES.has(error.code)
    || /Connection terminated|timeout exceeded when trying to connect/i.test(error.message || ""));
}

function publicStatusCode(error, fallbackStatusCode) {
  if (error.code === "23505" || error.code === 11000) return 409;
  if (isConnectionError(error)) return 503;
  return fallbackStatusCode;
}

function publicErrorMessage(error, statusCode) {
  if (error.code === "23505" || error.code === 11000) {
    return "A record with that unique value already exists";
  }
  if (isConnectionError(error)) return "Database is temporarily unavailable. Please try again shortly.";
  // 503s are thrown deliberately with operator-facing, non-sensitive messages.
  if (statusCode === 503 && error.message) return error.message;
  if (statusCode >= 500) return "An unexpected error occurred";
  return error.message || "Request failed";
}

module.exports = { isConnectionError, publicErrorMessage, publicStatusCode };
