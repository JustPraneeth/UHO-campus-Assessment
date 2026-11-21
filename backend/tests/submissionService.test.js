const test = require("node:test");
const assert = require("node:assert/strict");
const { createSubmissionFinalizer } = require("../services/submissionService");

test("finalizes an expired attempt and completes its registration", async () => {
  const calls = [];
  const result = {
    scoredAnswers: [{ question: "q1", isCorrect: true }],
    totalAwarded: 2,
    totalPossible: 2,
    percentage: 100,
    questionsAttempted: 1,
    correctAnswers: 1,
    incorrectAnswers: 0,
    unansweredQuestions: 0,
    accuracy: 100,
    sectionScores: [],
  };
  const finalize = createSubmissionFinalizer({
    queryFn: async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM assessments")) {
        return { rows: [{ id: "exam-1", question_ids: ["q1"], duration_minutes: 10, cutoff_percentage: 70 }] };
      }
      if (sql.includes("FROM questions")) return { rows: [{ id: "q1", type: "mcq" }] };
      return { rows: [] };
    },
    evaluateFn: async (answers, questions) => {
      assert.deepEqual(answers, [{ question: "q1", selectedOptionIndex: 0 }]);
      assert.deepEqual(questions, [{ _id: "q1", type: "mcq" }]);
      return result;
    },
    updateRowFn: async (table, score) => {
      assert.equal(table, "submissions");
      assert.equal(score.status, "evaluated");
      assert.equal(score.evaluation_token, null);
      assert.equal(score.auto_submitted, true);
      assert.equal(score.selection_status, "shortlisted");
      return { id: "submission-1", ...score };
    },
    now: () => new Date("2026-10-29T12:05:00.000Z"),
  });

  const finalized = await finalize({
    id: "submission-1",
    exam_id: "exam-1",
    student_id: "student-1",
    started_at: "2026-10-29T12:00:00.000Z",
    evaluation_token: "lease-1",
    answers: [{ question: "q1", selectedOptionIndex: 0 }],
  }, true);

  assert.equal(finalized.status, "evaluated");
  assert.equal(finalized.time_taken_seconds, 300);
  assert.ok(calls.some((sql) => sql.includes("UPDATE assessment_registrations")));
});

test("does not claim finalization if the submission is no longer evaluating", async () => {
  const finalize = createSubmissionFinalizer({
    queryFn: async (sql) => sql.includes("FROM assessments")
      ? { rows: [{ id: "exam-1", question_ids: [], duration_minutes: 10, cutoff_percentage: 70 }] }
      : { rows: [] },
    evaluateFn: async () => ({
      scoredAnswers: [], totalAwarded: 0, totalPossible: 0, percentage: 0,
      questionsAttempted: 0, correctAnswers: 0, incorrectAnswers: 0,
      unansweredQuestions: 0, accuracy: 0, sectionScores: [],
    }),
    updateRowFn: async (_table, _score, _columns, where, values) => {
      assert.match(where, /evaluation_token/);
      assert.deepEqual(values, ["submission-1", "lease-1"]);
      return null;
    },
  });

  await assert.rejects(
    finalize({ id: "submission-1", exam_id: "exam-1", student_id: "student-1", started_at: new Date().toISOString(), evaluation_token: "lease-1", answers: [] }, true),
    /no longer being evaluated/
  );
});
