import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";

export default function ExamResult() {
  const { id } = useParams();
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    api.get(`/submissions/${id}`).then((res) => setSubmission(res.data));
  }, [id]);

  if (!submission) return <div className="page-loading">Loading result…</div>;

  return (
    <div className="page">
      <p className="page-eyebrow">Result</p>
      <h1>{submission.exam.title}</h1>

      <div className="score-hero">
        <div className="score-ring">
          <span className="score-value">{submission.percentage}%</span>
        </div>
        <div>
          <p className="score-fraction">
            {submission.totalMarksAwarded} / {submission.totalMarksPossible} marks
          </p>
          <p className="score-meta">
            Submitted {new Date(submission.submittedAt).toLocaleString()}
            {submission.autoSubmitted && " · auto-submitted when time expired"}
          </p>
        </div>
      </div>

      <div className="stat-grid result-stats">
        <ResultStat label="Questions attempted" value={submission.questionsAttempted ?? 0} />
        <ResultStat label="Correct" value={submission.correctAnswers ?? 0} />
        <ResultStat label="Incorrect" value={submission.incorrectAnswers ?? 0} />
        <ResultStat label="Unanswered" value={submission.unansweredQuestions ?? 0} />
        <ResultStat label="Accuracy" value={`${submission.accuracy ?? 0}%`} />
        <ResultStat label="Time taken" value={formatDuration(submission.timeTakenSeconds ?? 0)} />
      </div>

      {submission.sectionScores?.length > 0 && (
        <section className="section-performance">
          <h2>Section performance</h2>
          {submission.sectionScores.map((section) => (
            <div className="section-score-row" key={section.category}>
              <strong>{section.category}</strong>
              <span>{section.score} / {section.totalMarks} marks</span>
              <span>{section.percentage}%</span>
            </div>
          ))}
        </section>
      )}

      <div className="breakdown">
        {submission.answers.map((ans, idx) => (
          <div className="breakdown-item" key={idx}>
            <div className="breakdown-item-header">
              <span className={`badge badge-${ans.type}`}>{ans.type.toUpperCase()}</span>
              <strong>{ans.question?.title || `Question ${idx + 1}`}</strong>
              <span className={`badge ${ans.isCorrect ? "badge-success" : "badge-danger"}`}>
                {ans.marksAwarded} / {ans.question?.marks ?? "?"} marks
              </span>
            </div>

            {ans.type === "coding" && ans.testResults?.length > 0 && (
              <div className="testresult-list">
                {ans.testResults.map((tr, i) => (
                  <div key={i} className={`testresult-row ${tr.passed ? "pass" : "fail"}`}>
                    <span>{tr.passed ? "✓ Passed" : "✗ Failed"}</span>
                    {!tr.hidden && <>
                      <code>Input: {tr.input || "(none)"}</code>
                      <code>Expected: {tr.expectedOutput}</code>
                    </>}
                    {!tr.passed && !tr.hidden && <code>Got: {tr.error ? `Error: ${tr.error}` : tr.actualOutput}</code>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultStat({ label, value }) {
  return <div className="stat-card"><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
