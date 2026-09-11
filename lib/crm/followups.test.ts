import assert from "node:assert";
import { followUpLabel } from "./followups";

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

assert.strictEqual(followUpLabel(null), null);
assert.strictEqual(followUpLabel(isoDaysFromNow(0)), "Follow up today");
assert.strictEqual(followUpLabel(isoDaysFromNow(-1)), "1 day overdue");
assert.strictEqual(followUpLabel(isoDaysFromNow(-3)), "3 days overdue");
assert.strictEqual(followUpLabel(isoDaysFromNow(5)), "Follow up scheduled");

console.log("lib/crm/followups.test.ts: all checks passed");
