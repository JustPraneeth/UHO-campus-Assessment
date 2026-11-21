CREATE TABLE IF NOT EXISTS assessment_proctor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'fullscreen-initial',
    'fullscreen-exited',
    'resize',
    'secondary-display',
    'focus-loss',
    'duplicate-tab',
    'clipboard',
    'right-click',
    'browser-search',
    'devtools-attempt',
    'print-attempt',
    'time-10-min',
    'time-2-min',
    'offline',
    'online',
    'idle'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_proctor_events_submission_time_idx
  ON assessment_proctor_events(submission_id, created_at DESC);
