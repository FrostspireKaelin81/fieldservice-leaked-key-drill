import assert from "node:assert/strict";
import test from "node:test";
import { decideDispatch } from "../src/leaked_key_drill.js";

test("a matching log holds dispatch and requests technician follow-up", () => {
  assert.deepEqual(decideDispatch(2, "en_route"), {
    dispatchStatus: "held_for_review",
    technicianFollowUp: "required",
    exposedLogMatches: 2,
  });
});

test("no matching logs preserve the current dispatch state", () => {
  assert.deepEqual(decideDispatch(0, "assigned"), {
    dispatchStatus: "assigned",
    technicianFollowUp: "not_required",
    exposedLogMatches: 0,
  });
});
