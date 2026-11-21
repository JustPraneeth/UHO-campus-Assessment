ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS evaluation_token uuid;

CREATE TABLE IF NOT EXISTS assessment_questions (
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  PRIMARY KEY (assessment_id, question_id),
  UNIQUE (assessment_id, position)
);

INSERT INTO assessment_questions (assessment_id, question_id, position)
SELECT a.id, selected.question_id, selected.position::integer
FROM assessments a
CROSS JOIN LATERAL unnest(a.question_ids) WITH ORDINALITY AS selected(question_id, position)
JOIN questions q ON q.id = selected.question_id
ON CONFLICT (assessment_id, question_id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_assessment_questions() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM assessment_questions WHERE assessment_id = NEW.id;
  INSERT INTO assessment_questions (assessment_id, question_id, position)
  SELECT NEW.id, selected.question_id, selected.position::integer
  FROM unnest(NEW.question_ids) WITH ORDINALITY AS selected(question_id, position)
  JOIN questions q ON q.id = selected.question_id
  ON CONFLICT (assessment_id, question_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessments_sync_questions ON assessments;
CREATE TRIGGER assessments_sync_questions
AFTER INSERT OR UPDATE OF question_ids ON assessments
FOR EACH ROW EXECUTE FUNCTION sync_assessment_questions();

CREATE INDEX IF NOT EXISTS assessment_questions_order_idx
  ON assessment_questions(assessment_id, position);
