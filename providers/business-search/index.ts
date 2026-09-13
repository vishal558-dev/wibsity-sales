import type { RawBusiness } from "@/types/generation";
import { mockBusinessSearchProvider } from "./mock";
import { serpApiBusinessSearchProvider } from "./serpapi";

export interface BusinessSearchParams {
  industry: string;
  location: string;
  count: number;
}

// RawBusiness's shape mirrors what Google Places' Place Details API returns
// (external_id ~ Place ID, phone ~ formatted_phone_number, review_count ~
// user_ratings_total) so a future google-places.ts implementation is a
// drop-in, not a redesign.
export interface BusinessSearchProvider {
  name: string;
  search(params: BusinessSearchParams): Promise<RawBusiness[]>;
}

export function getBusinessSearchProvider(): BusinessSearchProvider {
  const providerName = process.env.BUSINESS_SEARCH_PROVIDER ?? "mock";
  if (providerName === "mock") return mockBusinessSearchProvider;
  if (providerName === "serpapi") return serpApiBusinessSearchProvider;
  throw new Error(
    `Business search provider "${providerName}" is not implemented yet. Available: "mock", "serpapi".`,
  );
}

