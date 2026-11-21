import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register, verifyEmailCode, resendEmailCode, user, loading, sessionActive, profileError, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assessmentId = searchParams.get("assessmentId");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    collegeName: "",
    university: "",
    degree: "",
    branch: "",
    passingYear: "",
    currentYearSemester: "",
    rollNumber: "",
    city: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [sessionConflict, setSessionConflict] = useState(false);
  const handledUser = useRef("");

  useEffect(() => {
    if (!user) return;
    if (user.role !== "student") {
      navigate("/admin", { replace: true });
      return;
    }
    const redirectKey = `${user._id}:${assessmentId || ""}`;
    if (handledUser.current === redirectKey) return;
    handledUser.current = redirectKey;
    if (!assessmentId) {
      navigate("/student", { replace: true });
      return;
    }
    api.post(`/exams/${assessmentId}/register`)
      .then(() => navigate(`/student/exam/${assessmentId}`, { replace: true }))
      .catch((err) => setError(err.response?.data?.message || "Unable to register for this assessment."));
  }, [assessmentId, navigate, user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await register({ ...form, assessmentId });
    setSubmitting(false);
    if (!result.success) {
      setError(result.message);
      setSessionConflict(Boolean(result.existingSession));
      if (result.existingAccount) setVerificationPending(false);
      return;
    }
    if (result.authenticated) return;
    setVerificationPending(Boolean(result.verificationRequired));
    setNotice(`Enter the email verification code sent to ${form.email}.`);
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await verifyEmailCode(otp);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setNotice("Email verified. Opening your account…");
  }

  async function resendCode() {
    setSubmitting(true);
    const result = await resendEmailCode();
    if (result.success) setNotice(`A new verification code has been sent to ${form.email}.`);
    else setError(result.message);
    setSubmitting(false);
  }

  async function handleContinueSession() {
    setError("");
    setSubmitting(true);
    try {
      const profile = await refreshProfile();
      if (assessmentId && profile.role === "student") {
        await api.post(`/exams/${assessmentId}/register`);
        navigate(`/student/exam/${assessmentId}`, { replace: true });
      } else {
        navigate(profile.role === "admin" ? "/admin" : "/student", { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || profileError || "Unable to load your account.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionActive && !loading && !user) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <p className="auth-eyebrow">Active session</p>
          <h1>You're already signed in</h1>
          <p className="auth-sub">{profileError || "Your account session is active."}</p>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={submitting} onClick={handleContinueSession}>
            {submitting ? "Loading account…" : "Continue to dashboard"}
          </button>
          <button className="btn btn-ghost btn-block" onClick={async () => { await logout(); setVerificationPending(false); setError(""); setNotice(""); }}>
            Sign out and create another account
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">UHO · Candidate account</p>
        <h1>{verificationPending ? "Verify your email" : "Create your account"}</h1>
        <p className="auth-sub">{verificationPending ? `Enter the email code sent to ${form.email}.` : "Complete your candidate details to continue."}</p>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}
        {sessionConflict && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={async () => {
              await logout();
              setSessionConflict(false);
              setVerificationPending(false);
              setError("");
            }}
          >
            Sign out and try again
          </button>
        )}

        {verificationPending ? (
          <form onSubmit={handleVerify}>
            <label>
              Email verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="Enter the code"
              />
            </label>
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Verifying…" : "Verify email"}
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={submitting} onClick={resendCode}>Resend email code</button>
          </form>
        ) : (
          <>
          {error.includes("already exists") && (
            <p className="auth-footnote">
              <Link to={assessmentId ? `/login?assessmentId=${assessmentId}` : "/login"}>Sign in with this email</Link>
            </p>
          )}
          <form onSubmit={handleSubmit}>

        <label>
          Full name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Doe"
          />
        </label>

        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters"
          />
        </label>

        <label>
          College name
          <input required value={form.collegeName} onChange={(e) => setForm({ ...form, collegeName: e.target.value })} />
        </label>

        <label>
          College/University
          <input required value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
        </label>

        <label>
          Degree/Course
          <input required value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} />
        </label>

        <label>
          Branch/Specialization
          <input required value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
        </label>

        <label>
          Year of passing
          <input
            type="number"
            required
            min="1900"
            max="2200"
            value={form.passingYear}
            onChange={(e) => setForm({ ...form, passingYear: e.target.value })}
          />
        </label>

        <label>
          Current year/semester
          <input required value={form.currentYearSemester} onChange={(e) => setForm({ ...form, currentYearSemester: e.target.value })} />
        </label>

        <label>
          Roll number / Student ID
          <input
            required
            value={form.rollNumber}
            onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
            placeholder="Student ID"
          />
        </label>

        <label>
          City
          <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </label>

        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>

        <p className="auth-footnote">
          Already have an account? <Link to={assessmentId ? `/login?assessmentId=${assessmentId}` : "/login"}>Sign in</Link>
        </p>
          </form>
          </>
        )}
      </div>
    </div>
  );
}
