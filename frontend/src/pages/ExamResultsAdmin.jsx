import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/axios";

const initialFilters = {
  search: "",
  college: "",
  branch: "",
  minimumPercentage: "",
  maximumPercentage: "",
  rank: "",
  status: "",
  selectionStatus: "",
  date: "",
};

export default function ExamResultsAdmin() {
  const { examId } = useParams();
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [cutoff, setCutoff] = useState(70);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const requestInFlight = useRef(false);

  const loadReport = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const { data } = await api.get(`/admin/exams/${examId}/report`);
      setReport(data);
      setCutoff(data.exam.cutoffPercentage ?? 70);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      requestInFlight.current = false;
      setRefreshing(false);
    }
  }, [examId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const candidates = (report?.candidates || []).filter((candidate) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || [candidate.name, candidate.email, candidate.rollNumber]
      .some((value) => value?.toLowerCase().includes(search));
    const matchesCollege = !filters.college || candidate.collegeName?.toLowerCase().includes(filters.college.toLowerCase());
    const matchesBranch = !filters.branch || candidate.branch?.toLowerCase().includes(filters.branch.toLowerCase());
    const matchesScore = !filters.minimumPercentage || (candidate.percentage ?? -1) >= Number(filters.minimumPercentage);
    const matchesMaximumScore = !filters.maximumPercentage || (candidate.percentage ?? 101) <= Number(filters.maximumPercentage);
    const matchesRank = !filters.rank || candidate.rank === Number(filters.rank);
    const matchesStatus = !filters.status || candidate.status === filters.status;
    const matchesSelection = !filters.selectionStatus || candidate.selectionStatus === filters.selectionStatus;
    const candidateDate = candidate.testSubmittedAt || candidate.testStartedAt || candidate.createdAt;
    const matchesDate = !filters.date || (candidateDate && new Date(candidateDate).toISOString().slice(0, 10) === filters.date);
    return matchesSearch && matchesCollege && matchesBranch && matchesScore && matchesMaximumScore && matchesRank && matchesStatus && matchesSelection && matchesDate;
  }).sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));

  async function applyCutoff(event) {
    event.preventDefault();
    setUpdating(true);
    try {
      await api.put(`/admin/exams/${examId}/cutoff`, { cutoffPercentage: Number(cutoff) });
      await loadReport();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  }

  async function updateSelection(submissionId, selectionStatus) {
    try {
      await api.put(`/submissions/${submissionId}/selection`, { selectionStatus });
      await loadReport();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function downloadCsv() {
    const columns = [
      "Rank", "Full Name", "Email", "College", "University", "Degree", "Branch",
      "Passing Year", "Current Year/Semester", "Roll Number", "City", "Assessment", "Assessment Date", "Registration Time",
      "Test Start Time", "Test Submission Time", "Test Status", "Warning Count", "Score", "Total Marks", "Percentage",
      "Selection Status", "Performance Profile",
    ];
    const rows = candidates.map((candidate) => [
      candidate.rank, candidate.name, candidate.email, candidate.collegeName,
      candidate.university, candidate.degree, candidate.branch, candidate.passingYear,
      candidate.currentYearSemester, candidate.rollNumber, candidate.city, candidate.examName, candidate.assessmentDate,
      candidate.createdAt, candidate.testStartedAt, candidate.testSubmittedAt, candidate.status, candidate.warningCount,
      candidate.score, candidate.totalMarks, candidate.percentage, candidate.selectionStatus,
      candidate.performanceProfile,
    ]);
    const csv = [columns, ...rows].map((row) => row.map((value) => {
      const text = value == null ? "" : String(value);
      return `"${text.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report?.exam.title || "assessment"}-candidates.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (error && !report) {
    return <div className="page">
      <div className="alert alert-error" role="alert">{error}</div>
      <button className="btn btn-secondary" disabled={refreshing} onClick={loadReport}>
        {refreshing ? "Refreshing…" : "Retry"}
      </button>
    </div>;
  }
  if (!report) return <div className="page-loading">Loading candidate report…</div>;

  const { stats } = report;
  const registrationLink = `${window.location.origin}/register?assessmentId=${examId}`;
  return (
    <div className="page">
      <p className="page-eyebrow">Recruiter · Live report</p>
      <h1>{report.exam.title}</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <section className="card assessment-link-panel">
        <div><strong>Candidate registration link</strong><code>{registrationLink}</code></div>
        <button className="btn btn-secondary" onClick={() => {
          navigator.clipboard.writeText(registrationLink).then(() => setCopiedLink(true)).catch(() => setError("Clipboard access is unavailable in this browser."));
        }}>{copiedLink ? "Copied" : "Copy link"}</button>
      </section>

      <div className="stat-grid">
        <StatCard label="Registered" value={stats.registered} />
        <StatCard label="Test started" value={stats.started} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="In progress" value={stats.inProgress} />
        <StatCard label="Exam warnings" value={stats.totalWarnings} />
        <StatCard label="Candidates warned" value={stats.candidatesWithWarnings} />
        <StatCard label="Not attempted" value={stats.notAttempted} />
        <StatCard label="Highest score" value={`${stats.highestPercentage}%`} />
        <StatCard label="Average score" value={`${stats.averagePercentage}%`} />
        <StatCard label="Lowest score" value={`${stats.lowestPercentage}%`} />
        <StatCard label="Median score" value={`${stats.medianPercentage}%`} />
        <StatCard label="Shortlisted" value={stats.shortlisted} />
      </div>

      <div className="two-col report-analytics">
        <section className="card">
          <h2>Section performance</h2>
          {stats.sectionPerformance.length ? stats.sectionPerformance.map((section) => (
            <p key={section.category}><strong>{section.category}</strong><span>{section.averagePercentage}% average</span></p>
          )) : <p className="empty-cell">Results will appear after candidates complete the assessment.</p>}
        </section>
        <section className="card">
          <h2>College performance</h2>
          {stats.collegePerformance.length ? stats.collegePerformance.map((college) => (
            <p key={college.college}><strong>{college.college}</strong><span>{college.averagePercentage}% · {college.candidates} candidates</span></p>
          )) : <p className="empty-cell">Results will appear after candidates complete the assessment.</p>}
        </section>
        <section className="card">
          <h2>Score distribution</h2>
          {stats.scoreDistribution.map((bucket) => (
            <p key={bucket.range}><strong>{bucket.range}</strong><span>{bucket.count} candidates</span></p>
          ))}
        </section>
      </div>

      <section className="card item-analysis">
        <h2>Question difficulty analysis</h2>
        <p>Descriptive item statistics from completed MCQ attempts. Difficulty is the fraction correct; discrimination compares the top and bottom score groups when at least four candidates have completed the test.</p>
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr><th>Question</th><th>Section</th><th>Configured level</th><th>Attempts</th><th>Correct</th><th>Difficulty index</th><th>Discrimination</th><th>Review flag</th></tr>
            </thead>
            <tbody>
              {report.itemAnalysis.map((item) => (
                <tr key={item.questionId}>
                  <td>{item.title}</td>
                  <td>{item.category}</td>
                  <td>{item.configuredDifficulty}</td>
                  <td>{item.attemptedCount}</td>
                  <td>{item.correctCount}</td>
                  <td>{item.difficultyIndex == null ? "–" : `${Math.round(item.difficultyIndex * 100)}%`}</td>
                  <td>{item.discriminationIndex == null ? "–" : item.discriminationIndex}</td>
                  <td>{item.flag}</td>
                </tr>
              ))}
              {!report.itemAnalysis.length && (
                <tr><td colSpan={8} className="empty-cell">Question analysis will appear after candidates submit results.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card performance-insights">
        <h2>Performance profiles</h2>
        <p>{report.aiMethod}</p>
        {report.performanceProfiles.length ? report.performanceProfiles.map((profile) => (
          <span className="badge badge-muted" key={profile.label}>
            {profile.label}: {profile.candidateCount} candidates · {profile.averagePercentage}% mean · relative strength: {profile.relativeStrength}
          </span>
        )) : <span className="optional">At least two completed assessments are needed for profiles.</span>}
      </section>

      <div className="section-header">
        <div>
          <h2>Candidate ranking and shortlist</h2>
          <p>{candidates.length} of {stats.registered} candidates</p>
        </div>
        <div className="button-row no-print">
          <button className="btn btn-secondary" disabled={refreshing} onClick={loadReport}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="btn btn-primary" onClick={downloadCsv}>Download CSV</button>
        </div>
      </div>

      <form className="cutoff-control no-print" onSubmit={applyCutoff}>
        <label>
          Shortlist cutoff (%)
          <input type="number" min="0" max="100" required value={cutoff} onChange={(event) => setCutoff(event.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={updating}>{updating ? "Updating…" : "Apply cutoff"}</button>
      </form>

      <div className="filter-row report-filters no-print">
        <input placeholder="Name, email, or student ID" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <input placeholder="College" value={filters.college} onChange={(event) => setFilters({ ...filters, college: event.target.value })} />
        <input placeholder="Branch" value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })} />
        <input aria-label="Minimum percentage" type="number" min="0" max="100" placeholder="Minimum %" value={filters.minimumPercentage} onChange={(event) => setFilters({ ...filters, minimumPercentage: event.target.value })} />
        <input aria-label="Maximum percentage" type="number" min="0" max="100" placeholder="Maximum %" value={filters.maximumPercentage} onChange={(event) => setFilters({ ...filters, maximumPercentage: event.target.value })} />
        <input aria-label="Rank" type="number" min="1" placeholder="Exact rank" value={filters.rank} onChange={(event) => setFilters({ ...filters, rank: event.target.value })} />
        <select aria-label="Test status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All test statuses</option>
          <option value="completed">Completed</option>
          <option value="in-progress">In progress</option>
          <option value="not-attempted">Not attempted</option>
        </select>
        <select aria-label="Selection status" value={filters.selectionStatus} onChange={(event) => setFilters({ ...filters, selectionStatus: event.target.value })}>
          <option value="">All selection statuses</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="rejected">Rejected</option>
          <option value="pending">Pending</option>
        </select>
        <input aria-label="Assessment date" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
      </div>

      <div className="table-card">
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>Candidate</th><th>College / Branch</th><th>Email / City</th>
                <th>Score</th><th>Accuracy</th><th>Test status</th><th>Warnings</th><th>Pass</th><th>Selection</th><th>Submitted</th><th>Result</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate._id}>
                  <td>{candidate.rank ?? "–"}</td>
                  <td><strong>{candidate.name}</strong><br />{candidate.email || "No email"}<br />{candidate.rollNumber || "No student ID"}</td>
                  <td>{candidate.collegeName || "–"}<br />{candidate.branch || "–"}</td>
                  <td>{candidate.email || "–"}<br />{candidate.city || "–"}</td>
                  <td>{candidate.percentage == null ? "–" : `${candidate.score}/${candidate.totalMarks} (${candidate.percentage}%)`}</td>
                  <td>{candidate.status === "completed" ? `${candidate.accuracy}%` : "–"}</td>
                  <td><span className={`badge ${candidate.status === "completed" ? "badge-success" : "badge-muted"}`}>{candidate.status}</span></td>
                  <td>
                    <details>
                      <summary>{candidate.warningCount || 0}</summary>
                      {candidate.warningEvents?.length ? candidate.warningEvents.map((warning) => (
                        <div key={warning.type}>
                          {warning.type}: {warning.count}
                          {warning.lastAt ? ` (last ${new Date(warning.lastAt).toLocaleString()})` : ""}
                        </div>
                      )) : <span>No warnings</span>}
                    </details>
                  </td>
                  <td>{candidate.status === "completed" ? candidate.passed ? "Passed" : "Not passed" : "–"}</td>
                  <td>
                    {candidate.submissionId ? (
                      <select aria-label={`Selection status for ${candidate.name}`} value={candidate.selectionStatus} onChange={(event) => updateSelection(candidate.submissionId, event.target.value)}>
                        <option value="pending">Pending</option><option value="shortlisted">Shortlisted</option><option value="rejected">Rejected</option>
                      </select>
                    ) : "–"}
                  </td>
                  <td>{candidate.testSubmittedAt ? new Date(candidate.testSubmittedAt).toLocaleString() : "–"}</td>
                  <td>{candidate.submissionId ? <Link to={`/results/${candidate.submissionId}`}>View</Link> : "–"}</td>
                </tr>
              ))}
              {!candidates.length && <tr><td colSpan={12} className="empty-cell">No candidates match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return <div className="stat-card"><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}