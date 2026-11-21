function hasUnconfiguredCodingQuestions(questions, apiKey = process.env.ONLINECOMPILER_API_KEY) {
  return !apiKey?.trim() && questions.some((question) => question.type === "coding");
}

module.exports = { hasUnconfiguredCodingQuestions };
