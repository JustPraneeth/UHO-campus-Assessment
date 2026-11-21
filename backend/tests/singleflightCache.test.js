const test = require("node:test");
const assert = require("node:assert/strict");
const { createSingleflightCache } = require("../lib/singleflightCache");

test("coalesces concurrent loads for the same key and reuses the result", async () => {
  let loadCount = 0;
  const getUser = createSingleflightCache(async (userId) => {
    loadCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { userId };
  });

  const users = await Promise.all(Array.from({ length: 50 }, () => getUser("user-1")));

  assert.equal(loadCount, 1);
  assert.ok(users.every((user) => user.userId === "user-1"));
  assert.deepEqual(await getUser("user-1"), { userId: "user-1" });
  assert.equal(loadCount, 1);
});

test("does not cache rejected or explicitly uncacheable values", async () => {
  let loadCount = 0;
  const getUser = createSingleflightCache(async () => {
    loadCount += 1;
    if (loadCount === 1) throw new Error("temporary failure");
    return { verified: false };
  }, { shouldCache: (user) => user.verified });

  await assert.rejects(getUser("user-1"), /temporary failure/);
  assert.deepEqual(await getUser("user-1"), { verified: false });
  assert.deepEqual(await getUser("user-1"), { verified: false });
  assert.equal(loadCount, 3);
});
