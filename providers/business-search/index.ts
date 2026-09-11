import type { RawBusiness } from "@/types/generation";
import { mockBusinessSearchProvider } from "./mock";

export interface BusinessSearchParams {
  industry: string;
  location: string;
  count: number;
}

// RawBusiness's shape mirrors what Google Places' Place Details API returns
// (external_id ~ Place ID, phone ~ formatted_phone_number, review_count ~
// user_ratings_total) so a future google-places.ts implementation is a
// drop-in, not a redesign. Only the mock is implemented in this phase.
export interface BusinessSearchProvider {
  search(params: BusinessSearchParams): Promise<RawBusiness[]>;
}

export function getBusinessSearchProvider(): BusinessSearchProvider {
  const providerName = process.env.BUSINESS_SEARCH_PROVIDER ?? "mock";
  if (providerName === "mock") return mockBusinessSearchProvider;
  throw new Error(
    `Business search provider "${providerName}" is not implemented yet. Only "mock" is available.`,
  );
}
