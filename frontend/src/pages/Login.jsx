import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const {
    login,
    verifySignInCode,
    requestPasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
    user,
    loading,
    profileError,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assessmentId = searchParams.get("assessmentId");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [code, setCode] = useState("");
  const [resetStep, setResetStep] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const redirectHandled = useRef(false);

  useEffect(() => {
    if (loading || !user || redirectHandled.current) return;
    redirectHandled.current = true;
    if (assessmentId && user.role === "student") {
      api.post(`/exams/${assessmentId}/register`)
        .then(() => navigate(`/student/exam/${assessmentId}`, { replace: true }))
        .catch((err) => setError(err.response?.data?.message || "Unable to open this assessment."));
      return;
    }
    navigate(user.role === "admin" ? "/admin" : "/student", { replace: true });
  }, [assessmentId, loading, navigate, user]);

  async function continueAfterSignIn(profile) {
    redirectHandled.current = true;
    if (assessmentId && profile.role === "student") {
      try {
        await api.post(`/exams/${assessmentId}/register`);
        navigate(`/student/exam/${assessmentId}`, { replace: true });
      } catch (err) {
        setError(err.response?.data?.message || "Unable to open this assessment.");
      }
      return;
    }
    navigate(profile.role === "admin" ? "/admin" : "/student", { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    redirectHandled.current = true;
    const result = await login(form.email, form.password);
    setSubmitting(false);
    if (!result.success) {
      redirectHandled.current = false;
      setError(result.message);
      return;
    }
    if (result.verificationRequired) {
      setVerificationPending(true);
      setNotice(`Enter the verification code sent to ${form.email}.`);
      return;
    }
    await continueAfterSignIn(result.user);
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    redirectHandled.current = true;
    const result = await verifySignInCode(code);
    setSubmitting(false);
    if (!result.success) {
      redirectHandled.current = false;
      setError(result.message);
      return;
    }
    await continueAfterSignIn(result.user);
  }

  async function handleRequestPasswordReset() {
    setError("");
    setNotice("");
    if (!form.email.trim()) {
      setError("Enter your account email first.");
      return;
    }
    setSubmitting(true);
    const result = await requestPasswordReset(form.email);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setResetStep("code");
    setNotice(`A password reset code was sent to ${form.email}.`);
  }

  async function handleVerifyPasswordReset(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await verifyPasswordResetCode(resetCode);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message || "The password reset code could not be verified.");
      return;
    }
    setResetStep("new-password");
    setNotice("Email verified. Choose a new password.");
  }

  async function handleCompletePasswordReset(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    redirectHandled.current = true;
    const result = await completePasswordReset(newPassword);
    setSubmitting(false);
    if (!result.success) {
      redirectHandled.current = false;
      setError(result.message);
      return;
    }
    await continueAfterSignIn(result.user);
  }

  function returnToSignIn() {
    setResetStep("");
    setResetCode("");
    setNewPassword("");
    setError("");
    setNotice("");
  }

  return (
    <div className="auth-page">
      <form
        className="auth-card"
        onSubmit={verificationPending ? handleVerify : resetStep === "code" ? handleVerifyPasswordReset : resetStep === "new-password" ? handleCompletePasswordReset : handleSubmit}
      >
        <p className="auth-eyebrow">Q01 · Sign in</p>
        <h1>
          {verificationPending ? "Verify your email" : resetStep ? "Reset your password" : "Welcome back"}
        </h1>
        <p className="auth-sub">
          {verificationPending
            ? "Complete the email verification to continue."
            : resetStep === "code"
              ? `Enter the reset code sent to ${form.email}.`
              : resetStep === "new-password"
                ? "Set a new password with at least 8 characters."
                : "Sign in with your email and password."}
        </p>

        {(error || profileError) && <div className="alert alert-error">{error || profileError}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        {verificationPending || resetStep === "code" ? (
          <label>
            {resetStep === "code" ? "Password reset code" : "Email verification code"}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={resetStep === "code" ? resetCode : code}
              onChange={(event) => resetStep === "code" ? setResetCode(event.target.value) : setCode(event.target.value)}
              placeholder="Enter the code"
            />
          </label>
        ) : resetStep === "new-password" ? (
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
        ) : (
          <>
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
                placeholder="••••••••"
              />
            </label>
          </>
        )}

        {resetStep === "" && !verificationPending && (
          <button type="button" className="btn btn-ghost btn-block" disabled={submitting} onClick={handleRequestPasswordReset}>
            Forgot password?
          </button>
        )}

        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting
            ? "Please wait…"
            : verificationPending || resetStep === "code"
              ? "Verify code"
              : resetStep === "new-password"
                ? "Set new password"
                : "Sign in"}
        </button>

        {resetStep && <button type="button" className="btn btn-ghost btn-block" disabled={submitting} onClick={returnToSignIn}>Back to sign in</button>}

        {!verificationPending && !resetStep && <p className="auth-footnote">
          New here? <Link to={assessmentId ? `/register?assessmentId=${assessmentId}` : "/register"}>Create an account</Link>
        </p>}
      </form>
    </div>
  );
}
