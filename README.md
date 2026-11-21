# UHO Campus Assessment Platform

Campus recruitment platform for candidate enrollment, timed assessments, automated scoring, recruiter shortlisting, analytics, and CSV reporting.

**Stack:** React/Vite, Clerk email authentication, standalone PostgreSQL, and an Express API for protected assessment operations.

## Setup

1. Neon is linked to the `production` branch. `neon deploy` provisions PostgreSQL, Neon Auth, and the private `assets` bucket, and writes values into workspace `.env.local`. The backend loads that file automatically. Run `npm run migrate` from the workspace root to apply all ordered SQL migrations, including the answer-evaluation lease and relational assessment-question index.
2. Clerk remains the active identity provider because this app already uses Clerk; the provisioned Neon Auth service is not used for sign-in. Set Clerk's publishable key in `frontend/.env.local` and its publishable/secret keys in `backend/.env`. Never expose the Clerk secret key or commit local `.env` files.
3. Coding assessments use OnlineCompiler. Create an API key at <https://api.onlinecompiler.io/compilers/api-keys/> and set `ONLINECOMPILER_API_KEY` in `backend/.env`; never put it in frontend files or paste it into source control. The API URL defaults to `https://api.onlinecompiler.io/api/`. The backend supports C, C++, Java, Python, PHP, JavaScript, C#, Go, and Rust using OnlineCompiler's published compiler IDs. Students can select a language for each coding question; visible sample tests and final grading use the selected language. All tests for one coding question are sent through a single `run-tests` request. The default batch size is 32 (Free plan limit); set `ONLINECOMPILER_MAX_TESTS_PER_REQUEST` only to a value allowed by your plan. Publishing a coding assessment requires the key; coding and multiple-choice questions may be combined in one assessment. Run `npm run migrate` after updating to apply the supported-language database constraint.
4. Existing Supabase data has not been copied to Neon. To preserve it, set `SOURCE_DATABASE_URL` in your local PowerShell session to the old direct PostgreSQL connection string, then run `npm --prefix .\UHO_Tech_project\online-exam-system-main\backend run migrate:data`. The importer preserves UUIDs and JSON fields; profiles are linked to Clerk by verified email. Profiles without email need an email-based account before they can sign in. Never paste connection strings into chat.
5. Set `ADMIN_EMAIL` to the verified email of an account in the selected Clerk application, then run the backend seeder to provision the initial recruiter and sample questions, including the first-round interview Soft Skills question set. Re-running the seeder adds missing sample questions without duplicating existing titles:

   ```powershell
   cd backend
   npm install
   npm run seed
   npm run dev
   ```

6. Build the frontend and start the single Express server from the workspace root:

   ```powershell
   npm run dev
   ```

Open `http://localhost:5000`. The app and API run on this single server; the API health endpoint is `http://localhost:5000/api/health`. The separate Vite server at port 5173 is not required. Students register and sign in with email through Clerk.

## Netlify Deployment

The root `netlify.toml` configures Netlify to build the Vite frontend from `frontend/` and serve client-side routes. Deploy the Express backend separately; the existing public Netlify site does not serve this workspace's API. Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL` in the Netlify site's production environment. `VITE_API_BASE_URL` must be the full backend API URL ending in `/api` (for example, `https://api.example.com/api`). Set the backend's `CLIENT_ORIGIN` to the Netlify site URL and configure the required backend secrets there. Never put backend secrets in Netlify frontend variables or `frontend/.env.local`.

## Render Deployment

The root `render.yaml` deploys the existing Docker setup as one Render web service: the Vite frontend and Express API share the same origin, just as they do through the local Vite proxy. To deploy:

1. Push this repository to a Git provider supported by Render, then create a **Blueprint** in the Render Dashboard and select the repository. Render reads `render.yaml` and creates the web service.
2. Provide `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY` when prompted. Use the same Clerk publishable key for both publishable-key variables. Keep `CLERK_SECRET_KEY` private. The frontend key is embedded in the built client and is public by design.
3. Apply the PostgreSQL migrations to the production database before using the app. Set the production database connection string in the untracked `backend/.env` file, then run `npm --prefix backend run migrate` from the repository root. The backend loads that file with precedence over shell variables. Do not commit the connection string.
4. Add the Render service's public URL to the allowed domains/origins in the Clerk Dashboard. After deployment, verify `https://<your-render-service>.onrender.com/api/health` reports `"status":"ok"`.

Render supplies `PORT`; the Docker container serves both the frontend and `/api` from the same origin. Leave `VITE_API_BASE_URL` unset—do not set it to `localhost`. The Blueprint uses Render's free plan, which spins down after inactivity and can take time to wake up; choose an always-on paid plan in Render if the app must remain continuously responsive. Add `ONLINECOMPILER_API_KEY` if publishing coding assessments, and `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION` if using candidate file uploads. Do not commit any secret values.

## Security and Scale

Candidate profile and assessment data are stored in PostgreSQL. Clerk issues browser sessions and email verification; Express verifies Clerk bearer tokens, resolves the profile/role, and performs database operations. Question answer keys and result writes are only returned/processed through the protected Express API.

Candidate file uploads use the private Neon `assets` bucket through authenticated presigned-URL endpoints. The API limits uploads to PDF/JPEG/PNG/WebP files up to 10 MB. Neon Auth is provisioned but intentionally not used alongside Clerk, avoiding two competing login systems.

Expired submissions are claimed and evaluated by a database-backed worker every five seconds. Evaluation uses database row locks and per-attempt lease tokens, so multiple API replicas can run the worker safely; abandoned evaluation claims are recoverable. Coding answers are sent to OnlineCompiler from the backend only. Provider 429 responses are retried; if limits remain exhausted, answers are preserved and students receive a retry message.

The student dashboard caches only a minimal profile and published-exam list in the current browser tab for up to 30 seconds, then refreshes from the API in the background. This improves repeat reloads but can briefly show stale status and is not a one-second response guarantee. The current Render free plan and Clerk development instance are not a capacity guarantee for 50 simultaneous sign-ins; use production Clerk keys and load-test an appropriately sized always-on service and database in authorized staging before a live event.

If a student sees the coding-service setup error when starting an assessment, the selected questions include at least one question whose saved type is `coding`. Configure `ONLINECOMPILER_API_KEY` in `backend/.env` and restart the API before publishing. The start request fails before creating a submission, so this configuration error does not consume an attempt. Multiple-choice-only assessments do not require an OnlineCompiler key.

Answer updates are deadline-checked atomically against database time, and late submission requests can only finalize server-persisted answers. Active student submission responses do not include answer keys. API requests and sensitive writes are rate-limited; the built-in limiter uses per-process memory, so multi-replica deployments should configure a shared rate-limit store. Unexpected server errors return generic client messages while diagnostic details are logged server-side.

Exam fullscreen, focus, clipboard/shortcut, resize/display, timer, offline/online, idle, and duplicate-tab warnings are stored for recruiter review in the assessment report. Warnings are informational and do not lock candidates out or automatically submit their attempts. Browser focus/display/DevTools signals are best-effort and can be unavailable or produce false positives. The schema is applied by the normal migration command (`004_exam_proctor_events.sql`).

The candidate assessment interface supports single-answer and multiple-answer MCQs as well as coding questions. Coding questions use a split code editor/sample-results workbench with light/dark theme controls; changing languages loads a matching starter template when the current code is still the untouched starter, and Run Code executes only visible samples with per-test pass/fail results. Final grading uses the same OnlineCompiler output checker against all cases. Admin test inputs are literal stdin and expected outputs are stdout; the coding question must explain the input format that the program should read. Starting an exam requests browser fullscreen from the student's click. Browser security does not let the site close other tabs/windows or force fullscreen when denied; a fullscreen button remains available. During an exam, copy/cut/paste and context menus are blocked with a warning, and changing tabs/windows or exiting fullscreen displays a warning. A browser cannot prevent operating-system-level window switching. Candidates can explicitly submit and exit, and timed-out attempts are finalized automatically.

PostgreSQL hosting, backups, connection limits, and scaling are managed by the selected database provider. A 400–500 or 1,000-candidate drive still needs an appropriately sized database, multiple API replicas if needed, shared rate-limit storage, and load testing. This workspace has not been load-tested at either volume; this code change does not certify capacity. OnlineCompiler currently documents account limits for request rate, pending jobs, concurrently running sandboxes, tests per request, and monthly runs; these vary by plan. A coding assessment consumes one provider run per test case, per coding question, per student, including retakes. Before a 500-candidate event, confirm the account limits and remaining monthly runs with OnlineCompiler and perform a load test with provider approval. The default 32-test batch limit is the Free plan limit; batching reduces HTTP calls but does not reduce the number of test runs billed/allowed. Do not promise 500 simultaneous coding submissions on a plan whose limits are lower. Run performance tests only against local infrastructure or a staging environment you are authorized to test.

## Verification

```powershell
npm test
npm run build
npm --prefix .\UHO_Tech_project\online-exam-system-main\backend run storage:check
npm --prefix .\UHO_Tech_project\online-exam-system-main\backend run migrate
```

See [architecture and AI approach](docs/architecture.md), [API reference](docs/api.md), and [sample candidate CSV](docs/sample-candidates.csv).