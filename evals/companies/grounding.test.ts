import assert from "node:assert/strict";
import test from "node:test";
import { isReturnedLocation, recommendationLinesMatch } from "./grounding.ts";

test("Dataset company names used as returned locations are not extra recommendations", () => {
  assert.ok(isReturnedLocation("Sterling", [{ location: "Sterling" }]));
  assert.ok(isReturnedLocation("Sterling", [{ location: "Sterling,Virginia" }]));
  assert.equal(isReturnedLocation("Sterling", [{ location: "Mumbai" }]), false);
  assert.equal(isReturnedLocation("Other Company", [{ location: "Sterling" }]), false);
});

const records = [
  { name: "Truncated Name...", score: 88.8888888889 },
  { name: "Second Company", score: 50 },
];
const valid =
  "Here are the matches.\n1. **Truncated Name...** — Score: 88.9 — Matches the requested description.\n2. **Second Company** — Score: 50 — Partial match.\nWant details?";
test("Recommendation checks accept source names, order and valid rounding", () => {
  assert.ok(recommendationLinesMatch(valid, records));
  assert.ok(recommendationLinesMatch(valid.replace("88.9", "89"), records));
});
test("Recommendation checks reject invented names, changed truncations and order", () => {
  assert.equal(
    recommendationLinesMatch(valid.replace("Second Company", "Invented Company"), records),
    false,
  );
  assert.equal(
    recommendationLinesMatch(valid.replace("Truncated Name...", "Truncated..."), records),
    false,
  );
  assert.equal(recommendationLinesMatch(valid, [...records].reverse()), false);
});
test("Recommendation checks reject altered scores and extra or missing companies", () => {
  assert.equal(recommendationLinesMatch(valid.replace("88.9", "88.5"), records), false);
  assert.equal(recommendationLinesMatch(valid + "\n3. Extra Company — Score: 50", records), false);
  assert.equal(recommendationLinesMatch(valid, records.slice(0, 1)), false);
  assert.equal(recommendationLinesMatch(valid.replace("88.9", "88.89"), records), false);
});
