import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../api/axios";
import { useAuth } from "../context/AuthContext";

const refreshIntervalMs = 60_000;
const rateLimitWindowMs = 15 * 60_000;

function getRateLimitRetryAt(requestError) {
  const headers = requestError.response?.headers;
  const getHeader = (name) => headers?.get?.(name) ?? headers?.[name];
  const retryAfter = getHeader("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Date.now() + seconds * 1000;
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return retryDate;
  }

  const resetAfter = Number(getHeader("ratelimit-reset"));
  if (Number.isFinite(resetAfter) && resetAfter > 0) {
    return Date.now() + resetAfter * 1000;
  }

  return Date.now() + rateLimitWindowMs;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [startingExamId, setStartingExamId] = useState("");
  const navigate = useNavigate();
  const requestInFlight = useRef(false);
  const lastRequestAt = useRef(0);
  const rateLimitUntilRef = useRef(0);
  const rateLimitTimer = useRef(null);

  async function startExam(exam) {
    const fullscreenRequest = document.fullscreenElement
      ? Promise.resolve(true)
      : document.documentElement.requestFullscreen
        ? document.documentElement.requestFullscreen().then(() => true).catch(() => false)
        : Promise.resolve(false);
    setStartingExamId(exam._id);
    setError("");
    try {
      await api.post(`/exams/${exam._id}/register`);
      const fullscreenActive = await fullscreenRequest;
      navigate(`/student/exam/${exam._id}`, { state: { fullscreenActive } });
    } catch (requestError) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setError(getErrorMessage(requestError));
      setStartingExamId("");
    }
  }

  const loadExams = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (requestInFlight.current) return;
    if (rateLimitUntilRef.current > now) {
      setRateLimitUntil(rateLimitUntilRef.current);
      return;
    }
    if (!force && now - lastRequestAt.current < refreshIntervalMs) return;

    requestInFlight.current = true;
    lastRequestAt.current = now;
    setRefreshing(true);
    try {
      const { data } = await api.get("/exams/available");
      setExams(data);
      setError("");
      setRateLimitUntil(0);
      rateLimitUntilRef.current = 0;
    } catch (requestError) {
      if (requestError.response?.status === 429) {
        const retryAt = getRateLimitRetryAt(requestError);
        rateLimitUntilRef.current = retryAt;
        setRateLimitUntil(retryAt);
        setError(`Assessment refresh is temporarily rate-limited. Try again after ${new Date(retryAt).toLocaleTimeString()}.`);
        window.clearTimeout(rateLimitTimer.current);
        rateLimitTimer.current = window.setTimeout(
          () => setRateLimitUntil(0),
          Math.max(0, retryAt - Date.now())
        );
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      requestInFlight.current = false;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadExams({ force: true });
  }, [loadExams]);

  useEffect(() => () => window.clearTimeout(rateLimitTimer.current), []);

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <p className="page-eyebrow">Student</p>
          <h1>Hi {user.name.split(" ")[0]}, here's what's on</h1>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={refreshing || rateLimitUntil > Date.now()}
          onClick={() => loadExams({ force: true })}
        >
          {refreshing ? "Refreshing…" : rateLimitUntil > Date.now() ? "Refresh temporarily limited" : "Refresh"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {initialLoading ? (
        <div className="page-loading">Loading assessments…</div>
      ) : (
        <div className="exam-grid">
          {exams.map((exam) => (
            <div className="exam-card" key={exam._id}>
              <h3>{exam.title}</h3>
              <p className="exam-card-desc">{exam.description || "No description provided."}</p>
              <div className="exam-card-meta">
                <span>{exam.durationMinutes} min</span>
                <span>{exam.totalMarks} marks</span>
              </div>
              {exam.attemptStatus === "evaluated" ? (
                <span className="badge badge-success">Completed</span>
              ) : exam.attemptStatus === "in-progress" ? (
                <button
                  className="btn btn-primary btn-block"
                  disabled={startingExamId === exam._id}
                  onClick={() => startExam(exam)}
                >
                  {startingExamId === exam._id ? "Opening exam…" : "Resume exam"}
                </button>
              ) : exam.notStartedYet ? (
                <span className="badge badge-muted">Opens {new Date(exam.startTime).toLocaleString()}</span>
              ) : exam.isExpiredWindow ? (
                <span className="badge badge-muted">Closed</span>
              ) : (
                <button
                  className="btn btn-primary btn-block"
                  disabled={startingExamId === exam._id}
                  onClick={() => startExam(exam)}
                >
                  {startingExamId === exam._id
                    ? "Opening exam…"
                    : "Start exam"}
                </button>
              )}
            </div>
          ))}
          {exams.length === 0 && <p className="empty-cell">No exams are available right now. Check back later.</p>}
        </div>
      )}
    </div>
  );
}
