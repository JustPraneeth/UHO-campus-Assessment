const express = require("express");
const router = express.Router();
const {
  saveAnswer,
  runCodingCode,
  logProctorEvent,
  submitExam,
  getMySubmissions,
  getSubmissionById,
  getSubmissionsForExam,
  updateSelectionStatus,
} = require("../controllers/submissionController");
const { protect, authorize } = require("../middleware/auth");
const {
  createRateLimiter,
  studentWriteRateLimiter,
  submissionRateLimiter,
  adminWriteRateLimiter,
} = require("../middleware/rateLimiters");

router.get("/my", protect, authorize("student"), createRateLimiter(120), getMySubmissions);
router.post("/:id/run-code", protect, authorize("student"), createRateLimiter(30, 60_000), runCodingCode);
router.post("/:id/proctor-event", protect, authorize("student"), createRateLimiter(120, 60_000), logProctorEvent);
router.put("/:id/answer", protect, authorize("student"), studentWriteRateLimiter, saveAnswer);
router.post("/:id/submit", protect, authorize("student"), submissionRateLimiter, submitExam);

router.get("/exam/:examId", protect, authorize("admin"), createRateLimiter(120), getSubmissionsForExam);
router.put("/:id/selection", protect, authorize("admin"), adminWriteRateLimiter, updateSelectionStatus);
router.get("/:id", protect, createRateLimiter(120), getSubmissionById);

module.exports = router;
