const express = require("express");
const router = express.Router();
const { me, updateMe } = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { profileRateLimiter } = require("../middleware/rateLimiters");

router.get("/me", protect, profileRateLimiter, me);
router.put("/me", protect, profileRateLimiter, updateMe);

module.exports = router;
