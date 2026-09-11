import type { RawBusiness } from "@/types/generation";

export interface QualifyFilters {
  minRating: number | null;
  websiteRequired: boolean;
  phoneRequired: boolean;
}

export function passesFilters(business: RawBusiness, filters: QualifyFilters): boolean {
  if (filters.minRating != null && (business.rating == null || business.rating < filters.minRating)) {
    return false;
  }
  if (filters.websiteRequired && !business.website) return false;
  if (filters.phoneRequired && !business.phone) return false;
  return true;
}
