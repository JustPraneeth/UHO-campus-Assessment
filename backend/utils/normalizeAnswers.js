function normalizeAnswers(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    try {
      return normalizeAnswers(JSON.parse(value));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new TypeError("Submission answers contain invalid JSON");
      }
      throw error;
    }
  }
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") {
    throw new TypeError("Submission answers must be an array or object");
  }
  if ("answers" in value) return normalizeAnswers(value.answers);
  if (typeof value.question === "string") return [value];

  return Object.entries(value).map(([question, answer]) => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      throw new TypeError("Submission answer entries must be objects");
    }
    return { ...answer, question: answer.question || question };
  });
}

module.exports = { normalizeAnswers };
