import assert from "node:assert";
import { mapSerpApiResultToBusiness } from "./serpapi";

const mockItem = {
  position: 1,
  title: "Apex Solar Energy Systems",
  place_id: "ChIJ1234567890",
  rating: 4.7,
  reviews: 82,
  phone: "+91 98765 43210",
  address: "B-12, Sector 62, Noida, Uttar Pradesh 201301",
  website: "https://apexsolar.in",
  link: "https://www.google.com/maps/place/Apex+Solar",
};

const business = mapSerpApiResultToBusiness(mockItem, "Solar companies", "Noida");

assert.strictEqual(business.external_id, "ChIJ1234567890");
assert.strictEqual(business.name, "Apex Solar Energy Systems");
assert.strictEqual(business.website, "https://apexsolar.in");
assert.strictEqual(business.phone, "+91 98765 43210");
assert.strictEqual(business.rating, 4.7);
assert.strictEqual(business.review_count, 82);
assert.strictEqual(business.industry, "Solar companies");
assert.strictEqual(business.city, "Noida");
assert.strictEqual(business.country, "India");
assert.strictEqual(business.source_url, "https://www.google.com/maps/place/Apex+Solar");

// Test missing fields fallback gracefully
const minimalItem = {};
const minimalBusiness = mapSerpApiResultToBusiness(minimalItem, "HVAC", "Delhi");
assert.strictEqual(minimalBusiness.external_id, null);
assert.strictEqual(minimalBusiness.name, "Unknown Business");
assert.strictEqual(minimalBusiness.website, null);
assert.strictEqual(minimalBusiness.phone, null);
assert.strictEqual(minimalBusiness.rating, null);
assert.strictEqual(minimalBusiness.review_count, null);
assert.strictEqual(minimalBusiness.city, "Delhi");

console.log("providers/business-search/serpapi.test.ts: all checks passed");
