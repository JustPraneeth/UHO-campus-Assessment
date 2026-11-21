const { evaluateCode } = require("./codeRunner");

/**
 * Evaluates a single MCQ answer against the question's correct option(s).
 */
function evaluateMcq(question, answer) {
  const marks = Number(question.marks) || 0;
  const negativeMarks = Number(question.negativeMarks) || 0;
  let isCorrect = false;

  if (question.allowMultipleCorrect) {
    const correct = [...(question.correctOptionIndexes || [])].sort();
    const given = [...(answer.selectedOptionIndexes || [])].sort();
    isCorrect =
      correct.length === given.length && correct.every((v, i) => v === given[i]);
  } else {
    isCorrect =
      typeof answer.selectedOptionIndex === "number" &&
      answer.selectedOptionIndex === question.correctOptionIndex;
  }

  return {
    isCorrect,
    marksAwarded: isCorrect ? marks : hasMcqAnswer(answer) ? -negativeMarks : 0,
  };
}

function hasMcqAnswer(answer) {
  return typeof answer.selectedOptionIndex === "number" ||
    (answer.selectedOptionIndexes || []).length > 0;
}

/**
 * Evaluates a coding answer by running it against all test cases.
 * Awards partial credit proportional to the fraction of test cases passed.
 */
async function evaluateCoding(question, answer) {
  if (!answer.code || !answer.code.trim()) {
    return { isCorrect: false, marksAwarded: 0, testResults: [] };
  }

  const testResults = await evaluateCode({
    code: answer.code,
    language: answer.language || question.language,
    testCases: question.testCases,
    timeLimitMs: question.timeLimitMs,
  });

  const passedCount = testResults.filter((r) => r.passed).length;
  const totalCount = testResults.length || 1;
  const fraction = passedCount / totalCount;
  const marksAwarded = Math.round((Number(question.marks) || 0) * fraction * 100) / 100;

  return {
    isCorrect: passedCount === totalCount,
    marksAwarded,
    testResults,
  };
}

/**
 * Evaluates a full submission against EVERY question in the exam (passed in
 * as `allQuestions`) — not just the ones the student happened to answer.
 * Unanswered questions are scored as 0 marks awarded but their full marks
 * still count toward totalPossible, so skipping a question correctly hurts
 * the score instead of being silently excluded from the total.
 */
async function evaluateSubmission(answers, allQuestions) {
  let totalAwarded = 0;
  let totalPossible = 0;
  let questionsAttempted = 0;
  let correctAnswers = 0;
  let incorrectAnswers = 0;
  const sectionTotals = new Map();

  const answersByQuestionId = new Map(answers.map((a) => [String(a.question), a]));
  const scoredAnswers = [];

  for (const question of allQuestions) {
    const marks = Number(question.marks) || 0;
    totalPossible += marks;
    const category = question.category || "General";
    const section = sectionTotals.get(category) || { category, score: 0, totalMarks: 0 };
    section.totalMarks += marks;
    const ans = answersByQuestionId.get(String(question._id));

    if (!ans) {
      // Student never answered this question at all
      scoredAnswers.push({
        question: question._id,
        type: question.type,
        isCorrect: false,
        marksAwarded: 0,
      });
      sectionTotals.set(category, section);
      continue;
    }

    const attempted = question.type === "mcq"
      ? hasMcqAnswer(ans)
      : Boolean(ans.code && ans.code.trim());
    if (attempted) questionsAttempted += 1;
    if (question.type === "mcq") {
      const { isCorrect, marksAwarded } = evaluateMcq(question, ans);
      scoredAnswers.push({ ...ans, isCorrect, marksAwarded });
      totalAwarded += marksAwarded;
      section.score += marksAwarded;
      if (attempted) isCorrect ? correctAnswers++ : incorrectAnswers++;
    } else {
      const { isCorrect, marksAwarded, testResults } = await evaluateCoding(question, ans);
      scoredAnswers.push({ ...ans, isCorrect, marksAwarded, testResults });
      totalAwarded += marksAwarded;
      section.score += marksAwarded;
      if (attempted) isCorrect ? correctAnswers++ : incorrectAnswers++;
    }
    sectionTotals.set(category, section);
  }

  const percentage = totalPossible > 0 ? Math.round((totalAwarded / totalPossible) * 10000) / 100 : 0;
  const unansweredQuestions = allQuestions.length - questionsAttempted;
  const sectionScores = Array.from(sectionTotals.values()).map((section) => ({
    ...section,
    percentage: section.totalMarks > 0 ? Math.round((section.score / section.totalMarks) * 10000) / 100 : 0,
  }));

  return {
    scoredAnswers,
    totalAwarded,
    totalPossible,
    percentage: Math.max(0, percentage),
    questionsAttempted,
    correctAnswers,
    incorrectAnswers,
    unansweredQuestions,
    accuracy: questionsAttempted ? Math.round((correctAnswers / questionsAttempted) * 10000) / 100 : 0,
    sectionScores,
  };
}

module.exports = { evaluateSubmission, evaluateMcq, evaluateCoding };
