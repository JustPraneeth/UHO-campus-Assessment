ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_language_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_language_check
  CHECK (language IN ('c', 'java', 'python', 'javascript'));