const { query, toCamel, updateRow } = require("../lib/database");
const { evaluateSubmission } = require("../utils/evaluator");
const { normalizeAnswers } = require("../utils/normalizeAnswers");

const scoreColumns = [
  "answers", "evaluation_token", "total_marks_awarded", "total_marks_possible", "percentage", "questions_attempted",
  "correct_answers", "incorrect_answers", "unanswered_questions", "accuracy", "time_taken_seconds",
  "section_scores", "selection_status", "status", "auto_submitted", "submitted_at",
];

function createSubmissionFinalizer({
  queryFn = query,
  updateRowFn = updateRow,
  evaluateFn = evaluateSubmission,
  now = () => new Date(),
} = {}) {
  return async function finalizeClaimedSubmission(submission, autoSubmitted) {
    const { rows: exams } = await queryFn("SELECT * FROM assessments WHERE id = $1", [submission.exam_id]);
    const exam = exams[0];
    if (!exam) throw new Error(`Assessment ${submission.exam_id} was not found`);

    const { rows: questionRows } = await queryFn(
      "SELECT * FROM questions WHERE id = ANY($1::uuid[])",
      [exam.question_ids || []]
    );
    const questions = questionRows.map(toCamel);
    const result = await evaluateFn(normalizeAnswers(submission.answers), questions);
    const submittedAt = now();
    const deadline = new Date(new Date(submission.started_at).getTime() + exam.duration_minutes * 60000);
    if (exam.end_time && new Date(exam.end_time) < deadline) deadline.setTime(new Date(exam.end_time).getTime());
    const score = {
      answers: result.scoredAnswers,
      evaluation_token: null,
      total_marks_awarded: result.totalAwarded,
      total_marks_possible: result.totalPossible,
      percentage: result.percentage,
      questions_attempted: result.questionsAttempted,
      correct_answers: result.correctAnswers,
      incorrect_answers: result.incorrectAnswers,
      unanswered_questions: result.unansweredQuestions,
      accuracy: result.accuracy,
      section_scores: result.sectionScores,
      selection_status: result.percentage >= exam.cutoff_percentage ? "shortlisted" : "rejected",
      status: "evaluated",
      auto_submitted: Boolean(autoSubmitted),
      submitted_at: submittedAt.toISOString(),
      time_taken_seconds: Math.max(0, Math.round((Math.min(submittedAt, deadline) - new Date(submission.started_at)) / 1000)),
    };
    const scoreValues = Object.fromEntries(Object.entries(score).filter(([column]) => scoreColumns.includes(column)));
    const updated = await updateRowFn(
      "submissions",
      scoreValues,
      scoreColumns,
      `id = $${Object.keys(scoreValues).length + 1} AND status = 'evaluating' AND evaluation_token = $${Object.keys(scoreValues).length + 2}`,
      [submission.id, submission.evaluation_token]
    );
    if (!updated) throw new Error(`Submission ${submission.id} is no longer being evaluated`);

    await queryFn(
      "UPDATE assessment_registrations SET status = 'completed', updated_at = now() WHERE exam_id = $1 AND student_id = $2",
      [submission.exam_id, submission.student_id]
    );
    return updated;
  };
}

const finalizeClaimedSubmission = createSubmissionFinalizer();

module.exports = { createSubmissionFinalizer, finalizeClaimedSubmission };
