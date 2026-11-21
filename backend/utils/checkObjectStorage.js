const { randomUUID } = require("node:crypto");
require("../lib/loadEnv")();
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getObjectStorageClient } = require("../lib/objectStorage");

async function checkObjectStorage() {
  const client = getObjectStorageClient();
  const key = `healthcheck/${randomUUID()}.txt`;
  const expected = `neon-storage-check-${randomUUID()}`;
  try {
    await client.send(new PutObjectCommand({ Bucket: "assets", Key: key, Body: expected, ContentType: "text/plain" }));
    const response = await client.send(new GetObjectCommand({ Bucket: "assets", Key: key }));
    const actual = await response.Body.transformToString();
    if (actual !== expected) throw new Error("Uploaded object content did not match");
    console.log("Neon Object Storage upload/read check passed.");
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: "assets", Key: key }));
  }
}

checkObjectStorage().catch((error) => {
  console.error(`[storage-check] ${error.message}`);
  process.exitCode = 1;
});