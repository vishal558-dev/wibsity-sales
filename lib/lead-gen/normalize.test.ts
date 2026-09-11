import assert from "node:assert";
import { normalizeDomain, normalizeName, normalizePhone } from "./normalize";

assert.strictEqual(normalizeDomain("https://www.Example.com/"), "example.com");
assert.strictEqual(normalizeDomain("http://example.com/path"), "example.com");
assert.strictEqual(normalizeDomain("Example.COM"), "example.com");
assert.strictEqual(normalizeDomain(null), null);
assert.strictEqual(normalizeDomain(""), null);

assert.strictEqual(normalizePhone("+91 (990) 123-4567"), "919901234567");
assert.strictEqual(normalizePhone(null), null);

assert.strictEqual(normalizeName("  Sun   Solar   Co  "), "Sun Solar Co");

console.log("lib/lead-gen/normalize.test.ts: all checks passed");
