# API Reference

Base URL: `http://localhost:5000/api`. Protected requests use `Authorization: Bearer <Clerk session token>`. Student endpoints require the student role; recruiter endpoints require the admin role. JSON errors have a `message` field. Application data is stored in PostgreSQL.

## Authentication and Candidate Enrollment

| Method | Path | Access | Description |
|---|---|---|---|
| Signup | Clerk React `SignUp` | Public | Clerk creates the account and sends its configured email verification. The API provisions the student profile on first authenticated request. |
| Confirmation | Clerk email verification | Public | Clerk verifies the email and establishes the client session. Configure local/deployed origins in Clerk. |
| Login | Clerk React `SignIn` | Public | Clerk validates the email/password and returns a session token. |
| Logout | Clerk `signOut` | Signed-in user | Revoke/clear the current Clerk session. |
| GET | `/auth/me` | Student/admin | Validate the Clerk bearer token and return the PostgreSQL profile. Existing profiles are linked by verified email. |
| PUT | `/auth/me` | Student/admin | Update the signed-in candidate's name and education details in PostgreSQL. |

Assessment links use `/register?assessmentId=<examId>`. After Clerk confirms a new signup, the callback returns to the assessment link and enrolls the candidate. Existing users can sign in through the same link.

## Questions and Assessments

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/questions?type=&difficulty=&tag=&search=` | Admin | Search the database-backed question bank. |
| POST | `/questions` | Admin | Create an MCQ or coding question. Coding cases use literal stdin `input`, expected stdout `expectedOutput`, and an optional boolean `hidden`; provider request-size limits are validated. |
| GET/PUT/DELETE | `/questions/:id` | Admin | Read, update, or delete a question. |
| GET | `/exams` | Admin | List assessments and their selected questions. |
| POST | `/exams` | Admin | Create an assessment with active MCQ `questionIds`, title, description, instructions, `durationMinutes`, schedule, publication state, `passingPercentage`, `cutoffPercentage`, `randomizeQuestions`, and `randomizeOptions`. Schedule values are submitted as UTC timestamps after converting the admin's local `datetime-local` inputs. |
| PUT/DELETE | `/exams/:id` | Admin | Update or delete an assessment. Editing schedule values preserves the admin's local wall-clock time; clearing an optional time removes that schedule boundary. |
| GET | `/exams/available` | Student | List published assessments with the signed-in candidate's enrollment, attempt, and window state. |
| POST | `/exams/:id/register` | Student | Enroll the signed-in candidate before starting or resuming an assessment. Idempotent per assessment. |
| GET | `/exams/:id/take` | Enrolled student | Start or resume the single attempt; returns safe question data, saved answers, randomized order, and server deadline. |

## Attempts and Results

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/submissions/:id/run-code` | Attempt owner | Body: `{ "questionId", "code", "language" }`. Runs the submitted source against that coding question's visible samples only; hidden cases are reserved for final grading. Limited to 30 preview requests per minute per student. |
| POST | `/submissions/:id/proctor-event` | Attempt owner | Body: `{ "eventType" }`. Records an allow-listed fullscreen, focus, shortcut, network, timer, idle, display or resize warning for the active attempt. Events are visible in the admin assessment report. |
| PUT | `/submissions/:id/answer` | Attempt owner | Autosave one answer. Rejects non-member questions, type mismatch, late writes, and finalized attempts. |
| POST | `/submissions/:id/submit` | Attempt owner | Evaluate and finalize. Manual submission is allowed before the deadline. After expiry the server auto-submits; optional `answers` are accepted only for expiry recovery. Repeated requests are idempotent. |
| GET | `/submissions/my` | Student | Current candidate's evaluated result history. |
| GET | `/submissions/:id` | Owner/admin | Detailed result; candidates cannot read another candidate's record. |
| GET | `/submissions/exam/:examId` | Admin | Evaluated results for one assessment. |
| PUT | `/submissions/:id/selection` | Admin | Manually set `selectionStatus` to `pending`, `shortlisted`, or `rejected`. |

## Recruiter Reports

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/admin/stats` | Admin | Global student/question/assessment/evaluated-submission counts. |
| GET | `/admin/students` | Admin | Candidate accounts. |
| GET | `/admin/exams/:examId/report` | Admin | Assessment roster, attempt states, ranking, candidate profile, score/section/college analytics, score distribution, and descriptive performance profiles. |
| PUT | `/admin/exams/:examId/cutoff` | Admin | Set `cutoffPercentage` (0-100) and apply automatic shortlisted/rejected states to evaluated candidates. |

## Neon Object Storage

The private `assets` bucket is accessed only through authenticated API routes. Uploads are limited to PDF/JPEG/PNG/WebP files up to 10 MB. The backend returns five-minute presigned URLs; the browser never receives Neon storage credentials.

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/storage/upload-url` | Student/admin | Body: `{ "contentType": "application/pdf", "size": 1234 }`. Returns a user-scoped object key and presigned `PUT` URL. |
| POST | `/storage/download-url` | Owner/admin | Body: `{ "key": "<profile-uuid>/<object-id>.pdf" }`. Returns a short-lived presigned `GET` URL. |

An independent database-backed worker scans expired attempts every five seconds, so closure of the student browser does not prevent timeout evaluation. Database row locks and evaluation lease tokens prevent duplicate evaluation across multiple API instances and recover stale claims.

Answer saves and submission claims enforce deadlines with database time. Expired submissions are evaluated only from answers already persisted before the deadline; client-supplied answer replacements are not accepted. The student submission-detail response omits correct-option fields until the attempt is evaluated.

The coding preview and final grading both use the same OnlineCompiler run-tests API and output checker. Preview runs are permitted only during the active attempt and disclose visible sample results only. The exam requests browser fullscreen from the candidate's Start exam click when supported; browser security prevents the website from closing other tabs/windows or forcing fullscreen in browsers that deny the request.

Exam warnings are recorded for admin review and never auto-submit or lock a candidate out. Browser indicators for secondary displays, developer tools, focus, and split-screen are best-effort only and may be unavailable or produce false positives. Warning events are stored in `assessment_proctor_events`; apply migration `004_exam_proctor_events.sql`.

API requests are rate-limited per authenticated account (or client IP before authentication); profile, assessment writes, submissions, admin mutations, and file URL operations have stricter limits. The default limiter store is in-memory and per API process. Deployments with multiple API replicas should configure a shared rate-limit store to enforce quotas across replicas.

The report UI polls every ten seconds and downloads filtered rows as CSV. Equal scores share a competition rank. Reports include descriptive MCQ difficulty and, for assessments with at least four completed candidates, a top/bottom score-group discrimination index. These are item-analysis statistics, not an IRT model or hiring prediction. Date filtering uses submission time, start time, then registration time, in that order. Result percentages use the assessment's total positive marks as denominator; negative marking may reduce score below zero, while the displayed overall percentage is clamped at zero.

## Status and Error Codes

- `400`: malformed/missing fields, invalid cutoff, question mismatch, or invalid assessment ID.
- `401`: missing/invalid/expired Clerk session or unverified email.
- `403`: wrong role, another candidate's result, not enrolled, or assessment not yet open.
- `404`: assessment, question, or submission not found/available.
- `409`: duplicate email, duplicate/finished attempt, expired answer save, or evaluation already running.
- `429`: API request rate limit exceeded; retry after the response's `Retry-After` interval.
- `503`: PostgreSQL or Clerk server configuration is unavailable. `/api/health` checks the PostgreSQL connection.

Unexpected server errors return a generic message; diagnostic details are written to backend logs.

Run the PostgreSQL schema migration before starting the API. Protected data operations go through Express after Clerk token verification and profile-role validation.