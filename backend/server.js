require("./lib/loadEnv")();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("node:path");
const { clerkMiddleware } = require("@clerk/express");
const { checkDatabase } = require("./lib/database");
const { apiRateLimiter } = require("./middleware/rateLimiters");
const { publicErrorMessage, publicStatusCode } = require("./utils/publicError");

const authRoutes = require("./routes/authRoutes");
const questionRoutes = require("./routes/questionRoutes");
const examRoutes = require("./routes/examRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const adminRoutes = require("./routes/adminRoutes");
const storageRoutes = require("./routes/storageRoutes");
const { startExpiredSubmissionWorker } = require("./services/expiredSubmissionWorker");

const app = express();
const clerkAuth = clerkMiddleware({ clockSkewInMs: 30_000 });

app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }));
app.use(express.json({ limit: "2mb" }));

if (process.env.NODE_ENV !== "production") {
  app.get("/", (req, res) => res.redirect(process.env.CLIENT_ORIGIN || "http://localhost:5173"));
}

app.get("/api/health", async (req, res) => {
  try {
    await checkDatabase();
    res.json({ status: "ok", databaseReady: true, provider: "postgresql", time: new Date().toISOString() });
  } catch (error) {
    console.error(`[health] Database check failed: ${error.message}`);
    res.status(503).json({ status: "database-unavailable", databaseReady: false, provider: "postgresql", message: "Database is temporarily unavailable", time: new Date().toISOString() });
  }
});

app.use((req, res, next) => {
  if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return res.status(503).json({
      message: "Authentication is temporarily unavailable",
    });
  }
  clerkAuth(req, res, next);
});
app.use("/api", apiRateLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/storage", storageRoutes);

if (process.env.NODE_ENV === "production") {
  const frontendDirectory = path.resolve(__dirname, "../frontend/dist");
  app.use(express.static(frontendDirectory));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Centralized error handler (works with express-async-handler thrown errors)
app.use((err, req, res, next) => {
  const statusCode = publicStatusCode(
    err,
    err.statusCode || err.status || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500)
  );
  if (statusCode >= 500) console.error(`[api] ${req.method} ${req.originalUrl} failed (${statusCode}): ${err.code ? `${err.code} ` : ""}${err.message}`);
  res.status(statusCode).json({ message: publicErrorMessage(err, statusCode) });
});

const PORT = process.env.PORT || 5000;
const stopExpiredSubmissionWorker = process.env.DATABASE_URL
  ? startExpiredSubmissionWorker()
  : () => {};
if (!process.env.DATABASE_URL) {
  console.warn("[expired-submission] Worker is disabled because DATABASE_URL is not configured");
}
const server = app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));

function shutdown(signal) {
  console.log(`[server] ${signal} received; shutting down`);
  stopExpiredSubmissionWorker();
  server.close(() => {
    process.exitCode = 0;
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
