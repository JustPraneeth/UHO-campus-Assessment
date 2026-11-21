const test = require("node:test");
const assert = require("node:assert/strict");
const { PROCTOR_EVENT_TYPES } = require("../utils/proctorEvents");

test("allows only known proctor warning event types", () => {
  assert.ok(PROCTOR_EVENT_TYPES.has("focus-loss"));
  assert.ok(PROCTOR_EVENT_TYPES.has("secondary-display"));
  assert.ok(PROCTOR_EVENT_TYPES.has("offline"));
  assert.equal(PROCTOR_EVENT_TYPES.has("unknown-event"), false);
});
