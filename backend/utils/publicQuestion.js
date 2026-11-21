const candidateQuestionFields = [
  "_id",
  "type",
  "title",
  "description",
  "category",
  "tags",
  "difficulty",
  "marks",
  "negativeMarks",
  "options",
  "allowMultipleCorrect",
];

function questionForSubmission(question, { isAdmin, isEvaluated }) {
  if (!question || isAdmin || isEvaluated) return question;
  return Object.fromEntries(
    candidateQuestionFields
      .filter((field) => Object.hasOwn(question, field))
      .map((field) => [field, question[field]])
  );
}

module.exports = { questionForSubmission };
