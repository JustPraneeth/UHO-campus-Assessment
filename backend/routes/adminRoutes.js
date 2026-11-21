const express = require("express");
const router = express.Router();
const { getStats, getStudents, getExamReport, applyCutoff } = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");
const { createRateLimiter, adminWriteRateLimiter } = require("../middleware/rateLimiters");

router.use(protect, authorize("admin"));
router.get("/stats", createRateLimiter(120), getStats);
router.get("/students", createRateLimiter(120), getStudents);
router.get("/exams/:examId/report", createRateLimiter(120), getExamReport);
router.put("/exams/:examId/cutoff", adminWriteRateLimiter, applyCutoff);

module.exports = router;
