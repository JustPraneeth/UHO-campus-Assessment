import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function ResultsList() {
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    api.get("/submissions/my").then((res) => setSubmissions(res.data));
  }, []);

  return (
    <div className="page">
      <p className="page-eyebrow">Student</p>
      <h1>My results</h1>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Exam</th>
              <th>Score</th>
              <th>Percentage</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s._id}>
                <td>{s.exam?.title}</td>
                <td>
                  {s.totalMarksAwarded} / {s.totalMarksPossible}
                </td>
                <td>{s.percentage}%</td>
                <td>{new Date(s.submittedAt).toLocaleString()}</td>
                <td>
                  <Link to={`/results/${s._id}`}>View details →</Link>
                </td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  You haven't completed any exams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
