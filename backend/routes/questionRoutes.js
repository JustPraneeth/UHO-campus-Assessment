const express = require("express");
const router = express.Router();
const {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
} = require("../controllers/questionController");
const { protect, authorize } = require("../middleware/auth");
const { createRateLimiter, adminWriteRateLimiter } = require("../middleware/rateLimiters");

router.use(protect, authorize("admin"));

router.get("/", createRateLimiter(120), getQuestions);
router.post("/", adminWriteRateLimiter, createQuestion);
router.get("/:id", createRateLimiter(120), getQuestionById);
router.put("/:id", adminWriteRateLimiter, updateQuestion);
router.delete("/:id", adminWriteRateLimiter, deleteQuestion);

module.exports = router;
