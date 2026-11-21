function hasResponse(answer) {
  return typeof answer?.selectedOptionIndex === "number" ||
    Boolean(answer?.selectedOptionIndexes?.length);
}

function buildItemAnalysis(questions, submissions) {
  const ranked = [...submissions].sort(
    (left, right) => Number(right.total_marks_awarded) - Number(left.total_marks_awarded)
  );
  const groupSize = Math.max(1, Math.ceil(ranked.length * 0.27));
  const upperGroup = ranked.slice(0, groupSize);
  const lowerGroup = ranked.slice(-groupSize);

  return questions.map((question) => {
    const responses = ranked.map((submission) => {
      const answer = (Array.isArray(submission.answers) ? submission.answers : [])
        .find((item) => item.question === question.id);
      return { answer, correct: Boolean(answer?.isCorrect) };
    });
    const attempted = responses.filter(({ answer }) => hasResponse(answer));
    const correctCount = attempted.filter(({ correct }) => correct).length;
    const difficultyIndex = attempted.length ? correctCount / attempted.length : null;
    const groupCorrectRate = (group) => {
      const answers = group.map((submission) =>
        (Array.isArray(submission.answers) ? submission.answers : [])
          .find((item) => item.question === question.id)
      ).filter(hasResponse);
      return answers.length
        ? answers.filter((answer) => answer.isCorrect).length / answers.length
        : null;
    };
    const upperRate = ranked.length >= 4 ? groupCorrectRate(upperGroup) : null;
    const lowerRate = ranked.length >= 4 ? groupCorrectRate(lowerGroup) : null;
    const discriminationIndex = upperRate == null || lowerRate == null ? null : upperRate - lowerRate;

    return {
      questionId: question.id,
      title: question.title,
      category: question.category,
      configuredDifficulty: question.difficulty,
      attemptedCount: attempted.length,
      correctCount,
      difficultyIndex: difficultyIndex == null ? null : Math.round(difficultyIndex * 100) / 100,
      discriminationIndex: discriminationIndex == null ? null : Math.round(discriminationIndex * 100) / 100,
      flag: difficultyIndex == null
        ? "insufficient responses"
        : difficultyIndex < 0.3
          ? "unusually difficult"
          : difficultyIndex > 0.9
            ? "unusually easy"
            : discriminationIndex != null && discriminationIndex < 0
              ? "review discrimination"
              : "within expected range",
    };
  });
}

module.exports = { buildItemAnalysis };
