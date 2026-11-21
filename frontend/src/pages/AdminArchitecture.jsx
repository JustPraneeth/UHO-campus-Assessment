export default function AdminArchitecture() {
  return (
    <div className="page">
      <p className="page-eyebrow">Admin · Platform overview</p>
      <div className="section-header">
        <div>
          <h1>Architecture & operations</h1>
          <p>System design, security boundaries, AI approach, and readiness notes.</p>
        </div>
        <button className="btn btn-secondary no-print" type="button" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <section className="card architecture-flow">
        <h2>Assessment data flow</h2>
        <p>Student browser → React/Vite → Clerk authentication → Express API → PostgreSQL → assessment/autosave → server-side evaluation → recruiter dashboard and descriptive performance profiles.</p>
        <p>Admin access uses the same verified Clerk session; Express enforces the admin role before accessing candidate, assessment, question, or report data.</p>
      </section>

      <div className="two-col architecture-sections">
        <section className="card">
          <h2>Technology stack</h2>
          <ul>
            <li>Frontend: React and Vite; local answer recovery and server-synchronized deadlines.</li>
            <li>Authentication: Clerk verified sessions and role-checked Express API.</li>
            <li>Backend: Node.js and Express.</li>
            <li>Data: PostgreSQL for profiles, assessments, questions, registrations, and attempts.</li>
            <li>AI/ML: deterministic K-means clustering over completed candidates’ section scores for descriptive reporting.</li>
          </ul>
          <p className="architecture-note">Redis, a separate API gateway, and cloud autoscaling are not currently configured.</p>
        </section>

        <section className="card">
          <h2>Data model & integrity</h2>
          <p>Profiles store candidate and admin accounts; question bank stores MCQ/coding content; assessments select questions and set timing/cutoffs; registrations connect students to assessments; submissions persist answers, scores, timing, and selection state.</p>
          <ul>
            <li>Unique verified email for profiles.</li>
            <li>Unique assessment/student registration and submission prevent duplicate attempts.</li>
            <li>Recruitment drive and batch entities are not yet implemented.</li>
          </ul>
        </section>

        <section className="card">
          <h2>Admin modules</h2>
          <ul>
            <li>Assessment setup: scheduling, publication, selected questions, cutoff and pass percentages.</li>
            <li>Question bank: create, edit, activate/deactivate, search, and organize questions.</li>
            <li>Candidate directory and assessment-level candidate reporting.</li>
            <li>Live report polling, score/section/college analytics, filtering, rankings, manual selection, and cutoff updates.</li>
            <li>CSV exports; browser print supports saving the current report as PDF.</li>
          </ul>
        </section>

        <section className="card">
          <h2>Resilience & security</h2>
          <ul>
            <li>Attempts resume using server-persisted answers and a server-issued deadline.</li>
            <li>Autosave plus local recovery handles refresh and temporary connection loss.</li>
            <li>Server validates deadlines and makes submission idempotent.</li>
            <li>Student endpoints enforce ownership; admin endpoints enforce role authorization.</li>
            <li>Answer keys are excluded from student exam payloads.</li>
          </ul>
        </section>

        <section className="card">
          <h2>AI insights</h2>
          <p>Current candidate profiles are descriptive clusters derived from section-level results. They are non-blocking report calculations and do not determine selection or replace the configurable cutoff.</p>
          <p className="architecture-note">A validated suitability predictor and question-item difficulty/discrimination analysis require representative historical assessment data and are not implemented yet.</p>
        </section>

        <section className="card">
          <h2>Operational readiness</h2>
          <ul>
            <li>Do not run a high-volume load test against production. Use a provisioned, authorized staging environment.</li>
            <li>1,000 concurrent candidates have not been load-tested; scale and connection capacity need measured validation.</li>
            <li>Coding questions use an unisolated runner; disable them in production unless execution is moved to a hardened sandbox.</li>
            <li>Current exports are CSV; browser print is available for a basic PDF copy. Native XLSX/PDF generation is not implemented.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
