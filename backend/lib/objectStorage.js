const { S3Client } = require("@aws-sdk/client-s3");

let client;

function getObjectStorageClient() {
  if (client) return client;
  const required = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "AWS_REGION"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    const error = new Error(`Missing Neon Object Storage settings: ${missing.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }
  client = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION,
    forcePathStyle: true,
  });
  return client;
}

module.exports = { getObjectStorageClient };