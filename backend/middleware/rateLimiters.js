const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { getAuth } = require("@clerk/express");

const windowMs = 15 * 60 * 1000;

function createRateLimiter(limit, intervalMs = windowMs) {
  return rateLimit({
    windowMs: intervalMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const userId = req.authUser?.id || getAuth(req).userId;
      return userId ? `user:${userId}` : ipKeyGenerator(req.ip);
    },
    handler: (_req, res) => res.status(429).json({
      message: "Too many requests. Please wait before trying again.",
    }),
  });
}

module.exports = {
  createRateLimiter,
  apiRateLimiter: createRateLimiter(600),
  profileRateLimiter: createRateLimiter(60),
  studentWriteRateLimiter: createRateLimiter(300),
  submissionRateLimiter: createRateLimiter(10),
  adminWriteRateLimiter: createRateLimiter(60),
  uploadRateLimiter: createRateLimiter(10),
  downloadRateLimiter: createRateLimiter(30),
};
