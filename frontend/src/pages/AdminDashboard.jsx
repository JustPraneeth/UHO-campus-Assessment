import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/axios";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [exams, setExams] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestInFlight = useRef(false);

  const loadDashboard = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const [statsResult, examsResult] = await Promise.allSettled([
        api.get("/admin/stats"),
        api.get("/exams"),
      ]);
      const failures = [];
      if (statsResult.status === "fulfilled") setStats(statsResult.value.data);
      else failures.push(`Dashboard statistics: ${getErrorMessage(statsResult.reason)}`);
      if (examsResult.status === "fulfilled") setExams(examsResult.value.data);
      else failures.push(`Assessments: ${getErrorMessage(examsResult.reason)}`);
      setError(failures.join(" "));
    } finally {
      setLoading(false);
      setRefreshing(false);
      requestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <p className="page-eyebrow">Admin</p>
          <h1>Control room</h1>
          <p>Manage candidates, question banks, assessments, reports, and platform design.</p>
        </div>
        <button className="btn btn-secondary" type="button" disabled={refreshing} onClick={loadDashboard}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="stat-grid">
        <StatCard label="Students" value={stats?.studentCount} />
        <StatCard label="Questions in bank" value={stats?.questionCount} />
        <StatCard label="Exams created" value={stats?.examCount} />
        <StatCard label="Evaluated submissions" value={stats?.submissionCount} />
      </div>

      <section className="card admin-module-grid" aria-label="Admin modules">
        <ModuleLink to="/admin/candidates" title="Candidates" description="Search candidate profiles and export candidate details." />
        <ModuleLink to="/admin/questions" title="Question bank" description="Create, edit, activate, and organize assessment questions." />
        <ModuleLink to="/admin/exams/new" title="Assessment setup" description="Configure questions, schedules, cutoffs, and publication." />
        <ModuleLink to="/admin/architecture" title="Architecture & operations" description="Review system design, security boundaries, AI insights, and known readiness gaps." />
      </section>

      <div className="section-header">
        <div>
          <h2>Assessments</h2>
          <p>Published and draft exams, their schedules, and direct report access.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/exams/new">
          + Create assessment
        </Link>
      </div>

      {loading && !exams.length ? (
        <div className="page-loading">Loading admin dashboard…</div>
      ) : (
        <div className="table-card">
          <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Questions</th>
              <th>Duration</th>
              <th>Total marks</th>
              <th>Status</th>
              <th>Opens / closes</th>
              <th>Manage</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam._id}>
                <td>{exam.title}</td>
                <td>{exam.questions?.length ?? 0}</td>
                <td>{exam.durationMinutes} min</td>
                <td>{exam.totalMarks}</td>
                <td>
                  <span className={`badge ${exam.isPublished ? "badge-success" : "badge-muted"}`}>
                    {exam.isPublished ? "Published" : "Draft"}
                  </span>
                </td>
                <td>
                  {exam.startTime ? new Date(exam.startTime).toLocaleString() : "Immediately"}
                  <br />
                  {exam.endTime ? `Closes ${new Date(exam.endTime).toLocaleString()}` : "No closing time"}
                </td>
                <td><Link to={`/admin/exams/${exam._id}/edit`}>Edit</Link></td>
                <td>
                  <Link to={`/admin/exams/${exam._id}/results`}>View results →</Link>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-cell">
                  No assessments yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModuleLink({ to, title, description }) {
  return (
    <Link className="admin-module-link" to={to}>
      <strong>{title}</strong>
      <span>{description}</span>
      <span className="admin-module-action">Open module →</span>
    </Link>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value ?? "–"}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
