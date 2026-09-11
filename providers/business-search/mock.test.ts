import assert from "node:assert";
import { mockBusinessSearchProvider } from "./mock";

async function main() {
  const results = await mockBusinessSearchProvider.search({
    industry: "Solar companies",
    location: "Noida",
    count: 25,
  });

  assert.strictEqual(results.length, 25);
  for (const business of results) {
    assert.strictEqual(typeof business.name, "string");
    assert.ok(business.name.length > 0);
    assert.strictEqual(business.industry, "Solar companies");
    assert.strictEqual(business.city, "Noida");
    assert.strictEqual(business.country, "India");
    assert.ok(business.rating === null || (business.rating >= 2.5 && business.rating <= 5));
  }

  const uniqueExternalIds = new Set(results.map((b) => b.external_id));
  assert.strictEqual(uniqueExternalIds.size, results.length, "external_ids must be unique within a batch");

  console.log("providers/business-search/mock.test.ts: all checks passed");
}

main();
