const PROCTOR_EVENT_TYPES = new Set([
  "fullscreen-initial",
  "fullscreen-exited",
  "resize",
  "secondary-display",
  "focus-loss",
  "duplicate-tab",
  "clipboard",
  "right-click",
  "browser-search",
  "devtools-attempt",
  "print-attempt",
  "time-10-min",
  "time-2-min",
  "offline",
  "online",
  "idle",
]);

module.exports = { PROCTOR_EVENT_TYPES };
