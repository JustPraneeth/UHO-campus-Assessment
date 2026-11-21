CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id text UNIQUE,
  email text UNIQUE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student')),
  mobile_number text,
  college_name text,
  university text,
  degree text,
  branch text,
  passing_year integer,
  current_year_semester text,
  roll_number text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('mcq', 'coding')),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  tags text[] NOT NULL DEFAULT '{}',
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  marks numeric NOT NULL DEFAULT 1 CHECK (marks >= 0),
  negative_marks numeric NOT NULL DEFAULT 0 CHECK (negative_marks >= 0),
  is_active boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '[]',
  correct_option_index integer,
  allow_multiple_correct boolean NOT NULL DEFAULT false,
  correct_option_indexes integer[] NOT NULL DEFAULT '{}',
  starter_code text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'javascript' CHECK (language IN ('javascript', 'python')),
  test_cases jsonb NOT NULL DEFAULT '[]',
  time_limit_ms integer NOT NULL DEFAULT 5000,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcq_has_options CHECK (type <> 'mcq' OR jsonb_array_length(options) >= 2),
  CONSTRAINT coding_has_cases CHECK (type <> 'coding' OR jsonb_array_length(test_cases) >= 1)
);

CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  question_ids uuid[] NOT NULL DEFAULT '{}',
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  number_of_questions integer NOT NULL DEFAULT 0,
  total_marks numeric NOT NULL DEFAULT 0,
  passing_percentage numeric NOT NULL DEFAULT 0 CHECK (passing_percentage BETWEEN 0 AND 100),
  cutoff_percentage numeric NOT NULL DEFAULT 70 CHECK (cutoff_percentage BETWEEN 0 AND 100),
  start_time timestamptz,
  end_time timestamptz,
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_options boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessment_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'in-progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '[]',
  question_order uuid[] NOT NULL DEFAULT '{}',
  option_orders jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  evaluation_token uuid,
  submitted_at timestamptz,
  auto_submitted boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'evaluating', 'evaluated')),
  total_marks_awarded numeric NOT NULL DEFAULT 0,
  total_marks_possible numeric NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  questions_attempted integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  incorrect_answers integer NOT NULL DEFAULT 0,
  unanswered_questions integer NOT NULL DEFAULT 0,
  accuracy numeric NOT NULL DEFAULT 0,
  time_taken_seconds integer NOT NULL DEFAULT 0,
  section_scores jsonb NOT NULL DEFAULT '[]',
  selection_status text NOT NULL DEFAULT 'pending' CHECK (selection_status IN ('pending', 'shortlisted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS questions_category_difficulty_active_idx ON questions(category, difficulty, is_active);
CREATE INDEX IF NOT EXISTS assessments_published_window_idx ON assessments(is_published, start_time, end_time);
CREATE INDEX IF NOT EXISTS registrations_student_status_idx ON assessment_registrations(student_id, status, exam_id);
CREATE INDEX IF NOT EXISTS submissions_exam_status_score_idx ON submissions(exam_id, status, percentage DESC);
CREATE INDEX IF NOT EXISTS submissions_student_date_idx ON submissions(student_id, submitted_at DESC);