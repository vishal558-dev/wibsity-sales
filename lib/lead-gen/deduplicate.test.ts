import assert from "node:assert";
import { findMatchingLead, type ExistingLeadForDedup } from "./deduplicate";
import type { RawBusiness } from "@/types/generation";

function business(overrides: Partial<RawBusiness> = {}): RawBusiness {
  return {
    external_id: "biz-1",
    name: "Sun Solar Co",
    website: "https://www.sunsolar.com/",
    phone: "+91 99900 11122",
    email: null,
    industry: "Solar",
    city: "Noida",
    state: null,
    country: "India",
    rating: 4.5,
    review_count: 20,
    source_url: null,
    ...overrides,
  };
}

function lead(overrides: Partial<ExistingLeadForDedup> = {}): ExistingLeadForDedup {
  return {
    id: "lead-1",
    business_name: "Sun Solar Co",
    website: "https://sunsolar.com",
    phone: "919990011122",
    city: "Noida",
    external_ids: ["biz-1"],
    ...overrides,
  };
}

// 1. external_id match
assert.strictEqual(findMatchingLead(business(), [lead()]), "lead-1");

// 2. domain match (no external_id overlap)
assert.strictEqual(findMatchingLead(business({ external_id: null }), [lead({ external_ids: [] })]), "lead-1");

// 3. phone match (no external_id or domain overlap)
assert.strictEqual(
  findMatchingLead(business({ external_id: null, website: null }), [
    lead({ external_ids: [], website: null }),
  ]),
  "lead-1",
);

// 4. name + city match (no external_id/domain/phone overlap)
assert.strictEqual(
  findMatchingLead(business({ external_id: null, website: null, phone: null }), [
    lead({ external_ids: [], website: null, phone: null }),
  ]),
  "lead-1",
);

// 5. no match at all
assert.strictEqual(
  findMatchingLead(
    business({ external_id: null, website: null, phone: null, name: "Totally Different Co" }),
    [lead({ external_ids: [], website: null, phone: null })],
  ),
  null,
);

console.log("lib/lead-gen/deduplicate.test.ts: all checks passed");
