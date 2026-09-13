import type { BusinessSearchProvider } from "./index";
import type { RawBusiness } from "@/types/generation";

// Dev/test-only stand-in for a real business-search provider (e.g. Google
// Places). Generates plausible-looking businesses with realistic gaps
// (missing phone/website, varying rating) so the form's filters and the
// dedup/qualify pipeline have real work to do. Never treat this as a
// production data source.

const NAME_PREFIXES = ["Sun", "Green", "Prime", "Metro", "Star", "Elite", "Bright", "Urban", "Peak", "Royal"];
const NAME_SUFFIXES = [
  "Solutions",
  "Traders",
  "Enterprises",
  "Works",
  "Group",
  "Co",
  "Services",
  "Hub",
  "Industries",
  "Ventures",
];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBusinessName(industry: string): string {
  return `${randomFrom(NAME_PREFIXES)} ${industry} ${randomFrom(NAME_SUFFIXES)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const mockBusinessSearchProvider: BusinessSearchProvider = {
  name: "mock",
  async search({ industry, location, count }) {
    const results: RawBusiness[] = [];

    for (let i = 0; i < count; i++) {
      const name = randomBusinessName(industry);
      const slug = slugify(name);
      const hasWebsite = Math.random() > 0.2;
      const hasPhone = Math.random() > 0.15;
      const phoneDigits = Math.floor(6000000000 + Math.random() * 3999999999);

      results.push({
        external_id: `mock-${slug}-${slugify(location)}-${i}`,
        name,
        website: hasWebsite ? `https://${slug}.example.com` : null,
        phone: hasPhone ? `+91 ${phoneDigits}` : null,
        email: null,
        industry,
        city: location,
        state: null,
        country: "India",
        rating: Math.round((2.5 + Math.random() * 2.5) * 10) / 10,
        review_count: Math.floor(Math.random() * 300),
        source_url: null,
      });
    }

    return results;
  },
};
