import assert from "node:assert";
import { passesFilters } from "./qualify";
import type { RawBusiness } from "@/types/generation";

function business(overrides: Partial<RawBusiness> = {}): RawBusiness {
  return {
    external_id: "1",
    name: "Test Co",
    website: "https://test.co",
    phone: "9990001111",
    email: null,
    industry: "Solar",
    city: "Noida",
    state: null,
    country: "India",
    rating: 4.2,
    review_count: 10,
    source_url: null,
    ...overrides,
  };
}

assert.strictEqual(
  passesFilters(business(), { minRating: null, websiteRequired: false, phoneRequired: false }),
  true,
);
assert.strictEqual(
  passesFilters(business({ rating: 3 }), { minRating: 3.5, websiteRequired: false, phoneRequired: false }),
  false,
);
assert.strictEqual(
  passesFilters(business({ rating: null }), { minRating: 3, websiteRequired: false, phoneRequired: false }),
  false,
);
assert.strictEqual(
  passesFilters(business({ website: null }), { minRating: null, websiteRequired: true, phoneRequired: false }),
  false,
);
assert.strictEqual(
  passesFilters(business({ phone: null }), { minRating: null, websiteRequired: false, phoneRequired: true }),
  false,
);

console.log("lib/lead-gen/qualify.test.ts: all checks passed");
