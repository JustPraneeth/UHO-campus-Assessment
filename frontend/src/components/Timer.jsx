import { useEffect, useRef, useState } from "react";

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Countdown timer driven by an absolute deadline (not a relative duration),
 * so it stays correct even if the tab is backgrounded/throttled and stays in
 * sync with the server-issued deadline. Calls onExpire exactly once.
 */
export default function Timer({ deadline, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(() => new Date(deadline) - new Date());
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = new Date(deadline) - new Date();
      setRemainingMs(diff);
      if (diff <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, onExpire]);

  const isUrgent = remainingMs <= 60000; // last minute
  const isWarning = remainingMs <= 5 * 60000; // last 5 minutes

  return (
    <div className={`exam-timer ${isUrgent ? "urgent" : isWarning ? "warning" : ""}`}>
      <span className="exam-timer-label">Time remaining</span>
      <span className="exam-timer-value">{formatDuration(remainingMs)}</span>
    </div>
  );
}
