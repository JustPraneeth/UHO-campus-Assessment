const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createRateLimiter } = require("../middleware/rateLimiters");

test("limits requests per authenticated user and returns an explicit 429", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.authUser = { id: "student-1" };
    next();
  });
  app.use(createRateLimiter(1, 60_000));
  app.get("/", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const first = await fetch(url);
    const second = await fetch(url);

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.match((await second.json()).message, /Too many requests/);
    assert.ok(second.headers.has("retry-after"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
