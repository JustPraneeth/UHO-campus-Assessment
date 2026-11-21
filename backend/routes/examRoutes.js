const express = require("express");
const router = express.Router();
const {
  createExam,
  getAllExams,
  getAvailableExams,
  registerCandidate,
  updateExam,
  deleteExam,
  getExamForTaking,
} = require("../controllers/examController");
const { protect, authorize } = require("../middleware/auth");
const { createRateLimiter, adminWriteRateLimiter } = require("../middleware/rateLimiters");

router.get("/available", protect, authorize("student"), createRateLimiter(120), getAvailableExams);
router.post("/:id/register", protect, authorize("student"), createRateLimiter(30), registerCandidate);
router.get("/:id/take", protect, authorize("student"), createRateLimiter(120), getExamForTaking);

router.get("/", protect, authorize("admin"), createRateLimiter(120), getAllExams);
router.post("/", protect, authorize("admin"), adminWriteRateLimiter, createExam);
router.put("/:id", protect, authorize("admin"), adminWriteRateLimiter, updateExam);
router.delete("/:id", protect, authorize("admin"), adminWriteRateLimiter, deleteExam);

module.exports = router;
