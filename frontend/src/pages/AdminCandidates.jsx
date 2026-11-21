import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getErrorMessage } from "../api/axios";

export default function AdminCandidates() {
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCandidates = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/students");
      setCandidates(data);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const filteredCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((candidate) => [
      candidate.name,
      candidate.email,
      candidate.collegeName,
      candidate.university,
      candidate.branch,
      candidate.rollNumber,
      candidate.city,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [candidates, search]);

  function downloadCsv() {
    const columns = [
      ["Full name", "name"],
      ["Email", "email"],
      ["Mobile", "mobileNumber"],
      ["College", "collegeName"],
      ["University", "university"],
      ["Degree", "degree"],
      ["Branch", "branch"],
      ["Passing year", "passingYear"],
      ["Current year/semester", "currentYearSemester"],
      ["Roll number", "rollNumber"],
      ["City", "city"],
      ["Registered", "createdAt"],
    ];
    const rows = filteredCandidates.map((candidate) => columns.map(([, key]) => candidate[key]));
    const csv = [columns.map(([label]) => label), ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "uho-candidates.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <p className="page-eyebrow">Admin · Candidate directory</p>
      <div className="section-header">
        <div>
          <h1>Candidates</h1>
          <p>Candidate profiles captured through the student registration flow.</p>
        </div>
        <div className="button-row">
          <button className="btn btn-secondary" type="button" onClick={loadCandidates}>Refresh</button>
          <button className="btn btn-primary" type="button" disabled={!filteredCandidates.length} onClick={downloadCsv}>Download CSV</button>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="filter-row">
        <input
          aria-label="Search candidates"
          placeholder="Search name, email, college, branch, or student ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="optional">{filteredCandidates.length} of {candidates.length} candidates</span>
      </div>

      {loading ? <div className="page-loading">Loading candidates…</div> : (
        <div className="table-card">
          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th><th>College / University</th><th>Course / Branch</th>
                  <th>Student ID</th><th>Passing year</th><th>Mobile / City</th><th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate._id}>
                    <td><strong>{candidate.name}</strong><br />{candidate.email || "No email"}</td>
                    <td>{candidate.collegeName || "–"}<br />{candidate.university || "–"}</td>
                    <td>{candidate.degree || "–"}<br />{candidate.branch || "–"}</td>
                    <td>{candidate.rollNumber || "–"}</td>
                    <td>{candidate.passingYear || "–"}<br />{candidate.currentYearSemester || "–"}</td>
                    <td>{candidate.mobileNumber || "–"}<br />{candidate.city || "–"}</td>
                    <td>{candidate.createdAt ? new Date(candidate.createdAt).toLocaleString() : "–"}</td>
                  </tr>
                ))}
                {!filteredCandidates.length && (
                  <tr><td colSpan={7} className="empty-cell">No candidates match this search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
