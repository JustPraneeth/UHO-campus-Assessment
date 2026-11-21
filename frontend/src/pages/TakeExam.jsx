import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../api/axios";
import Timer from "../components/Timer";
import { getCodeTemplate, supportedLanguages } from "../utils/codeTemplates";

const initialExamNotice = "For an uninterrupted exam experience, keep your browser in fullscreen mode until you submit.";
const proctorEventMessages = {
  "fullscreen-exited": "You have exited fullscreen mode. Return to fullscreen immediately to continue your assessment.",
  resize: "Split-screen view and resized windows are not permitted. Maximize your browser window to resume.",
  "secondary-display": "A secondary display was detected. Disconnect all external monitors to proceed with the exam.",
  "duplicate-tab": "This exam is already active in another tab or window. Close the duplicate tab to prevent submission conflicts.",
  clipboard: "Clipboard actions (copy, cut, and paste) are disabled outside the code editor.",
  "right-click": "Right-clicking and context menus are restricted during the assessment.",
  "browser-search": "In-page search and browser shortcuts are disabled during the exam.",
  "devtools-attempt": "Opening browser developer tools is not allowed. This attempt has been recorded.",
  "print-attempt": "Printing or exporting exam content is restricted.",
  "time-10-min": "10 minutes remaining. Review your flagged and unanswered questions.",
  "time-2-min": "Less than 2 minutes left. Unsubmitted code and selected options will be auto-submitted when the timer expires.",
  offline: "Network connection lost. Do not refresh or close this tab—your answers are saved locally and will sync when reconnected.",
  online: "Back online. All saved responses have been synced with the server.",
  idle: "No activity detected for 5 minutes. Interact with the page to keep your exam session active.",
};

function readQueuedEvents(key) {
  try {
    const queued = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(queued) ? queued.filter((event) => event && typeof event.eventType === "string") : [];
  } catch {
    return [];
  }
}

export default function TakeExam() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState("");
  const [proctorWarning, setProctorWarning] = useState("");
  const [saveState, setSaveState] = useState("All changes saved");
  const [submitting, setSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const submittedRef = useRef(false);
  const saveTimers = useRef({});
  const focusLossCount = useRef(0);
  const lastEventAt = useRef(new Map());
  const lastFullscreenChangeAt = useRef(0);
  const fullscreenActive = useRef(Boolean(document.fullscreenElement));
  const warningQueueKey = data?.submissionId ? `exam-warning-events-${data.submissionId}` : "";

  const recordWarning = useCallback(async (eventType, message) => {
    setProctorWarning(message);
    if (!data?.submissionId) return;
    const now = Date.now();
    const previous = lastEventAt.current.get(eventType) || 0;
    const throttleMs = eventType === "focus-loss" ? 1500 : eventType === "resize" ? 30000 : 3000;
    if (now - previous < throttleMs) return;
    lastEventAt.current.set(eventType, now);
    const entry = { eventType };
    if (!navigator.onLine) {
      localStorage.setItem(warningQueueKey, JSON.stringify([...readQueuedEvents(warningQueueKey), entry]));
      return;
    }
    try {
      const { data: result } = await api.post(`/submissions/${data.submissionId}/proctor-event`, entry);
      if (eventType === "focus-loss") focusLossCount.current = result.eventCount;
    } catch (requestError) {
      if (requestError.response?.status !== 409) {
        localStorage.setItem(warningQueueKey, JSON.stringify([...readQueuedEvents(warningQueueKey), entry]));
      }
    }
  }, [data?.submissionId, warningQueueKey]);

  const syncQueuedWarnings = useCallback(async () => {
    if (!data?.submissionId || !navigator.onLine || !warningQueueKey) return false;
    const queued = readQueuedEvents(warningQueueKey);
    let synced = 0;
    for (const entry of queued) {
      try {
        const { data: result } = await api.post(`/submissions/${data.submissionId}/proctor-event`, entry);
        synced += 1;
        if (entry.eventType === "focus-loss") focusLossCount.current = result.eventCount;
      } catch (requestError) {
        if (requestError.response?.status === 409) {
          synced += 1;
          continue;
        }
        break;
      }
    }
    if (synced) localStorage.setItem(warningQueueKey, JSON.stringify(queued.slice(synced)));
    return synced === queued.length;
  }, [data?.submissionId, warningQueueKey]);

  useEffect(() => {
    let mounted = true;
    api.get(`/exams/${id}/take`)
      .then((res) => {
        if (!mounted) return;
        setData(res.data);
        const initial = {};
        res.data.savedAnswers.forEach((answer) => { initial[answer.question] = answer; });
        const cached = JSON.parse(localStorage.getItem(`exam-answers-${res.data.submissionId}`) || "{}");
        setAnswers({ ...initial, ...(cached.answers || {}) });
        const focusWarnings = res.data.warningCounts?.["focus-loss"] || 0;
        focusLossCount.current = focusWarnings;
        setProctorWarning(initialExamNotice);
      })
      .catch((err) => setError(getErrorMessage(err)));
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    if (!data?.submissionId) return undefined;
    const owner = crypto.randomUUID();
    const lockKey = `exam-attempt-lock-${data.submissionId}`;
    const channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(`exam-attempt-${data.submissionId}`);
    const notifyDuplicate = () => {
      recordWarning("duplicate-tab", proctorEventMessages["duplicate-tab"]);
    };
    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === "attempt-active" && event.data.owner !== owner) notifyDuplicate();
      };
      channel.postMessage({ type: "attempt-active", owner });
    }
    let existingLock = null;
    try {
      existingLock = JSON.parse(localStorage.getItem(lockKey) || "null");
    } catch {
      existingLock = null;
    }
    if (existingLock && existingLock.owner !== owner && Date.now() - existingLock.updatedAt < 30000) notifyDuplicate();
    const updateLock = () => localStorage.setItem(lockKey, JSON.stringify({ owner, updatedAt: Date.now() }));
    const releaseLock = () => {
      const lock = JSON.parse(localStorage.getItem(lockKey) || "null");
      if (lock?.owner === owner) localStorage.removeItem(lockKey);
    };
    updateLock();
    const heartbeat = window.setInterval(updateLock, 10000);
    window.addEventListener("beforeunload", releaseLock);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", releaseLock);
      releaseLock();
      channel?.close();
    };
  }, [data?.submissionId]);

  useEffect(() => {
    if (!data?.submissionId) return undefined;
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      lastFullscreenChangeAt.current = Date.now();
      if (fullscreenActive.current && !active) {
        recordWarning("fullscreen-exited", proctorEventMessages["fullscreen-exited"]);
      }
      fullscreenActive.current = active;
      setIsFullscreen(active);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [data?.submissionId, recordWarning]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw new Error("Fullscreen is not supported by this browser.");
    } catch (fullscreenError) {
      setProctorWarning(`Could not change fullscreen: ${fullscreenError.message}`);
    }
  }

  useEffect(() => {
    if (!data?.submissionId) return undefined;
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const target = event.target instanceof Element ? event.target : null;
      const isCodeEditor = Boolean(target?.closest(".coding-editor-panel .code-editor"));
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "x"].includes(key) && !isCodeEditor) {
        event.preventDefault();
        recordWarning("clipboard", proctorEventMessages.clipboard);
      } else if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        recordWarning("browser-search", proctorEventMessages["browser-search"]);
      } else if (key === "f12" || ((event.ctrlKey || event.metaKey) && event.shiftKey && ["i", "j", "c"].includes(key))) {
        event.preventDefault();
        recordWarning("devtools-attempt", proctorEventMessages["devtools-attempt"]);
      } else if ((event.ctrlKey || event.metaKey) && key === "p") {
        event.preventDefault();
        recordWarning("print-attempt", proctorEventMessages["print-attempt"]);
      }
    };
    const onBlockedClipboard = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".coding-editor-panel .code-editor")) return;
      event.preventDefault();
      recordWarning("clipboard", proctorEventMessages.clipboard);
    };
    const onContextMenu = (event) => {
      event.preventDefault();
      recordWarning("right-click", proctorEventMessages["right-click"]);
    };
    const onFocusLoss = () => {
      focusLossCount.current += 1;
      const count = focusLossCount.current;
      const message = count === 1
        ? "Exam window focus lost. Switching tabs, opening applications, or clicking outside the browser is logged."
        : `Warning ${count}: Repeatedly leaving the exam window is logged. This assessment will not be automatically submitted.`;
      recordWarning("focus-loss", message);
    };
    let focusLossRecordedAt = 0;
    const onBlur = () => {
      if (Date.now() - focusLossRecordedAt < 1500) return;
      focusLossRecordedAt = Date.now();
      onFocusLoss();
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") onBlur(); };
    const onResize = () => {
      if (document.fullscreenElement || Date.now() - lastFullscreenChangeAt.current < 1500) return;
      if (window.innerWidth < window.screen.availWidth * 0.85 || window.innerHeight < window.screen.availHeight * 0.85) {
        recordWarning("resize", proctorEventMessages.resize);
      }
    };
    const onScreenChange = () => {
      if (window.screen.isExtended === true) {
        recordWarning("secondary-display", proctorEventMessages["secondary-display"]);
      }
    };
    if (window.screen.isExtended === true) onScreenChange();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("copy", onBlockedClipboard);
    window.addEventListener("cut", onBlockedClipboard);
    window.addEventListener("paste", onBlockedClipboard);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    window.addEventListener("screenschange", onScreenChange);
    window.screen.addEventListener?.("change", onScreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("copy", onBlockedClipboard);
      window.removeEventListener("cut", onBlockedClipboard);
      window.removeEventListener("paste", onBlockedClipboard);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("screenschange", onScreenChange);
      window.screen.removeEventListener?.("change", onScreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [data?.submissionId, recordWarning]);

  const persistAnswer = useCallback(async (questionId, answer) => {
    if (!data) return false;
    try {
      await api.put(`/submissions/${data.submissionId}/answer`, { questionId, ...answer });
      setSaveState("All changes saved");
      return true;
    } catch {
      setSaveState("Saved on this device; waiting for connection");
      return false;
    }
  }, [data]);

  function updateAnswer(question, patch) {
    const answer = { ...(answers[question._id] || {}), type: question.type, ...patch };
    const nextAnswers = { ...answers, [question._id]: answer };
    setAnswers(nextAnswers);
    if (data) {
      localStorage.setItem(`exam-answers-${data.submissionId}`, JSON.stringify({ answers: nextAnswers }));
      setSaveState(navigator.onLine ? "Saving changes…" : "Saved on this device; waiting for connection");
    }
    clearTimeout(saveTimers.current[question._id]);
    saveTimers.current[question._id] = window.setTimeout(() => {
      persistAnswer(question._id, answer);
    }, 600);
  }

  useEffect(() => {
    if (!data) return undefined;
    const syncWhenOnline = async () => {
      const saved = await Promise.all(Object.entries(answers).map(([questionId, answer]) =>
        persistAnswer(questionId, answer)
      ));
      const warningsSynced = await syncQueuedWarnings();
      if (saved.every(Boolean) && warningsSynced) {
        localStorage.removeItem(`exam-answers-${data.submissionId}`);
        setSaveState("All changes saved");
        recordWarning("online", proctorEventMessages.online);
      } else {
        setSaveState("Some responses are still waiting to sync");
        setProctorWarning("Back online, but some saved responses are still syncing. Keep this tab open.");
      }
    };
    const flushWarningQueue = () => { void syncQueuedWarnings(); };
    window.addEventListener("online", syncWhenOnline);
    const retryTimer = window.setInterval(flushWarningQueue, 15000);
    return () => {
      window.removeEventListener("online", syncWhenOnline);
      window.clearInterval(retryTimer);
    };
  }, [data, answers, persistAnswer, recordWarning, syncQueuedWarnings]);

  useEffect(() => {
    if (!data?.submissionId) return undefined;
    const startedRemaining = new Date(data.deadline).getTime() - Date.now();
    const tenMinuteKey = `exam-reminder-10-${data.submissionId}`;
    const twoMinuteKey = `exam-reminder-2-${data.submissionId}`;
    const timer = window.setInterval(() => {
      const remaining = new Date(data.deadline).getTime() - Date.now();
      if (remaining <= 120000 && !sessionStorage.getItem(twoMinuteKey)) {
        sessionStorage.setItem(twoMinuteKey, "shown");
        recordWarning("time-2-min", proctorEventMessages["time-2-min"]);
      } else if (startedRemaining > 600000 && remaining <= 600000 && !sessionStorage.getItem(tenMinuteKey)) {
        sessionStorage.setItem(tenMinuteKey, "shown");
        recordWarning("time-10-min", proctorEventMessages["time-10-min"]);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [data?.submissionId, data?.deadline, recordWarning]);

  useEffect(() => {
    if (!data?.submissionId) return undefined;
    let idleTimer;
    const resetIdleTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (document.visibilityState === "visible") recordWarning("idle", proctorEventMessages.idle);
      }, 5 * 60 * 1000);
    };
    ["pointerdown", "keydown", "touchstart"].forEach((event) => window.addEventListener(event, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      window.clearTimeout(idleTimer);
      ["pointerdown", "keydown", "touchstart"].forEach((event) => window.removeEventListener(event, resetIdleTimer));
    };
  }, [data?.submissionId, recordWarning]);

  useEffect(() => {
    if (navigator.onLine || !data?.submissionId) return undefined;
    recordWarning("offline", proctorEventMessages.offline);
    return undefined;
  }, [data?.submissionId, recordWarning]);

  const handleSubmit = useCallback(async (autoSubmitted = false) => {
    if (!data || submittedRef.current) return;
    autoSubmitted = autoSubmitted || Date.now() >= new Date(data.deadline).getTime();
    submittedRef.current = true;
    setSubmitting(true);
    try {
      Object.values(saveTimers.current).forEach(clearTimeout);
      const saved = await Promise.all(Object.entries(answers).map(([questionId, answer]) =>
        persistAnswer(questionId, answer)
      ));
      if (saved.some((result) => !result) && !autoSubmitted) throw new Error("Your answers could not be synced. Reconnect and submit again.");
      const { data: result } = await api.post(`/submissions/${data.submissionId}/submit`);
      localStorage.removeItem(`exam-answers-${data.submissionId}`);
      navigate(`/results/${result.submissionId}`);
    } catch (err) {
      setError(getErrorMessage(err));
      submittedRef.current = false;
      setSubmitting(false);
    }
  }, [data, answers, persistAnswer, navigate]);

  if (error && !data) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!data) return <div className="page-loading">Loading exam…</div>;

  const question = data.questions[activeIdx];
  const answer = answers[question._id] || {};
  return (
    <div className="exam-shell">
      {error && <div className="alert alert-error" role="alert">
        {error}
        <button className="btn btn-ghost btn-small" onClick={() => setError("")}>Return to exam</button>
      </div>}
      <div className="exam-toolbar">
        <div>
          <h2>{data.exam.title}</h2>
          <p className="exam-toolbar-sub">Question {activeIdx + 1} of {data.questions.length}</p>
          {data.exam.instructions && <p className="exam-instructions">{data.exam.instructions}</p>}
          <p className="exam-save-state" aria-live="polite">{saveState}</p>
        </div>
        <div>
          <button className="btn btn-ghost btn-small" type="button" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          </button>
          <Timer deadline={data.deadline} onExpire={() => handleSubmit(true)} />
          <button
            className="btn btn-ghost"
            disabled={submitting}
            onClick={() => {
              if (window.confirm("Exit and submit this exam now? This cannot be undone.")) handleSubmit(false);
            }}
          >Exit and submit</button>
        </div>
      </div>

      {proctorWarning && <div className="exam-proctor-alert" role="alert" aria-live="assertive">
        {proctorWarning}
        <button type="button" aria-label="Dismiss warning" onClick={() => setProctorWarning("")}>Dismiss</button>
      </div>}

      <div className="exam-body">
        <aside className="question-nav">
          {data.questions.map((item, idx) => {
            const savedAnswer = answers[item._id];
            const answered = typeof savedAnswer?.selectedOptionIndex === "number" ||
              Boolean(savedAnswer?.selectedOptionIndexes?.length || savedAnswer?.code?.trim());
            return (
              <button
                key={item._id}
                className={`qnav-btn ${idx === activeIdx ? "active" : ""} ${answered ? "answered" : ""}`}
                aria-label={`Question ${idx + 1}, ${answered ? "answered" : "unanswered"}`}
                title={answered ? "Answered" : "Unanswered"}
                onClick={() => setActiveIdx(idx)}
              >Q{String(idx + 1).padStart(2, "0")}</button>
            );
          })}
        </aside>

        <main className="question-panel">
          <div className="question-panel-header">
            <span className={`badge badge-${question.type}`}>{question.type.toUpperCase()}</span>
            <span className="badge badge-muted">{question.category || "General"}</span>
            <span className="question-marks">{question.marks} marks</span>
          </div>
          <h3>{question.title}</h3>
          <p className="question-description">{question.description}</p>
          {question.type === "mcq" ? (
            <McqAnswer question={question} answer={answer} onChange={(patch) => updateAnswer(question, patch)} />
          ) : (
            <CodingAnswer
              key={question._id}
              question={question}
              answer={answer}
              submissionId={data.submissionId}
              onChange={(patch) => updateAnswer(question, patch)}
            />
          )}
          <div className="question-panel-footer">
            <button className="btn btn-ghost" disabled={activeIdx === 0} onClick={() => setActiveIdx((index) => index - 1)}>← Previous</button>
            {activeIdx < data.questions.length - 1 ? (
              <button className="btn btn-secondary" onClick={() => setActiveIdx((index) => index + 1)}>Next →</button>
            ) : (
              <button className="btn btn-primary" disabled={submitting} onClick={() => handleSubmit(false)}>
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function McqAnswer({ question, answer, onChange }) {
  if (question.allowMultipleCorrect) {
    const selected = new Set(answer.selectedOptionIndexes || []);
    return <div className="option-list">{question.options.map((option, index) => (
      <label className="option-choice" key={index}>
        <input type="checkbox" checked={selected.has(index)} onChange={(event) => {
          const next = new Set(selected);
          event.target.checked ? next.add(index) : next.delete(index);
          onChange({ selectedOptionIndexes: Array.from(next) });
        }} />{option}
      </label>
    ))}</div>;
  }
  return <div className="option-list">{question.options.map((option, index) => (
    <label className="option-choice" key={index}>
      <input type="radio" name={question._id} checked={answer.selectedOptionIndex === index} onChange={() => onChange({ selectedOptionIndex: index })} />
      {option}
    </label>
  ))}</div>;
}

function CodingAnswer({ question, answer, submissionId, onChange }) {
  const code = answer.code ?? question.starterCode ?? "";
  const language = answer.language ?? question.language;
  const [codeDrafts, setCodeDrafts] = useState(() => ({ [language]: code }));
  const [theme, setTheme] = useState(() => localStorage.getItem("coding-editor-theme") || "dark");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [testResults, setTestResults] = useState(null);

  async function runCode() {
    setRunning(true);
    setRunError("");
    setTestResults(null);
    try {
      const { data } = await api.post(`/submissions/${submissionId}/run-code`, {
        questionId: question._id,
        code,
        language,
      });
      setTestResults(data.testResults);
    } catch (requestError) {
      setRunError(getErrorMessage(requestError));
    } finally {
      setRunning(false);
    }
  }

  function changeTheme(nextTheme) {
    setTheme(nextTheme);
    localStorage.setItem("coding-editor-theme", nextTheme);
  }

  const visibleTestCases = question.visibleTestCases || [];
  return (
    <div className="coding-answer">
      <div className="coding-workbench" data-theme={theme}>
        <div className="coding-workbench-toolbar">
          <label>
            Language
            <select value={language} onChange={(event) => {
              const nextLanguage = event.target.value;
              const nextCode = codeDrafts[nextLanguage] ?? getCodeTemplate(nextLanguage);
              setCodeDrafts({ ...codeDrafts, [language]: code, [nextLanguage]: nextCode });
              onChange({
                code: nextCode,
                language: nextLanguage,
              });
              setTestResults(null);
              setRunError("");
            }}>
              {supportedLanguages.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="coding-workbench-actions">
            <button className="btn btn-ghost btn-small" type="button" onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
            <button className="btn btn-primary btn-small" type="button" disabled={running || !visibleTestCases.length} onClick={runCode}>
              {running ? "Running…" : "▶ Run code"}
            </button>
          </div>
        </div>
        <div className="coding-workbench-panels">
          <section className="coding-editor-panel">
            <div className="coding-panel-heading">
              {`solution.${{ csharp: "cs", javascript: "js", python: "py", cpp: "cpp" }[language] || language}`}
            </div>
            <textarea
              className="code-textarea code-editor"
              aria-label="Your code"
              spellCheck={false}
              rows={18}
              value={code}
              onChange={(event) => {
                setCodeDrafts({ ...codeDrafts, [language]: event.target.value });
                setTestResults(null);
                onChange({ code: event.target.value, language });
              }}
            />
          </section>
          <section className="coding-tests-panel" aria-live="polite">
            <div className="coding-panel-heading">
              <span>Sample test cases</span>
              {testResults && <span>{testResults.filter((result) => result.passed).length}/{testResults.length} passed</span>}
            </div>
            {runError && <p className="alert alert-error">{runError}</p>}
            {visibleTestCases.map((testCase, index) => {
              const result = testResults?.[index];
              return (
                <article className={`coding-test-card ${result ? result.passed ? "passed" : "failed" : ""}`} key={index}>
                  <strong>Test case {index + 1}{result ? result.passed ? " · Passed" : " · Failed" : ""}</strong>
                  <div><span>Input</span><code>{testCase.input || "(no input)"}</code></div>
                  <div><span>Expected</span><code>{testCase.expectedOutput}</code></div>
                  {result && <div><span>Actual</span><code>{result.error || result.actualOutput || "(no output)"}</code></div>}
                </article>
              );
            })}
            {!visibleTestCases.length && <p className="hint">No visible sample tests are configured for this question.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}