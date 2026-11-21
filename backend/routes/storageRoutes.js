const { randomUUID } = require("node:crypto");
const express = require("express");
const asyncHandler = require("express-async-handler");
const { GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { getObjectStorageClient } = require("../lib/objectStorage");
const { protect } = require("../middleware/auth");
const { uploadRateLimiter, downloadRateLimiter } = require("../middleware/rateLimiters");

const router = express.Router();
const bucket = "assets";
const maxUploadBytes = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

router.use(protect);

router.post("/upload-url", uploadRateLimiter, asyncHandler(async (req, res) => {
  const { contentType, size } = req.body;
  const extension = allowedTypes.get(contentType);
  if (!extension) {
    res.status(400);
    throw new Error("Upload a PDF, JPEG, PNG, or WebP file");
  }
  if (!Number.isInteger(size) || size < 1 || size > maxUploadBytes) {
    res.status(400);
    throw new Error("File size must be between 1 byte and 10 MB");
  }
  const key = `${req.authUser.id}/${randomUUID()}.${extension}`;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size });
  const url = await getSignedUrl(getObjectStorageClient(), command, { expiresIn: 300 });
  res.json({ key, url, method: "PUT", expiresIn: 300 });
}));

router.post("/download-url", downloadRateLimiter, asyncHandler(async (req, res) => {
  const { key } = req.body;
  if (typeof key !== "string" || !key || (!key.startsWith(`${req.authUser.id}/`) && req.user.role !== "admin")) {
    res.status(403);
    throw new Error("You cannot access this file");
  }
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(getObjectStorageClient(), command, { expiresIn: 300 });
  res.json({ url, expiresIn: 300 });
}));

module.exports = router;