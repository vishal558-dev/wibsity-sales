import type { BusinessSearchProvider, BusinessSearchParams } from "./index";
import type { RawBusiness } from "@/types/generation";

interface SerpApiLocalResult {
  position?: number;
  title?: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  rating?: number;
  reviews?: number;
  phone?: string;
  address?: string;
  website?: string;
  link?: string;
}

interface SerpApiResponse {
  local_results?: SerpApiLocalResult[];
  error?: string;
}

const FETCH_TIMEOUT_MS = 15000;
const PAGE_SIZE = 20;
const MAX_PAGES = 3; // Safety cap to conserve SerpApi search credits

export function mapSerpApiResultToBusiness(
  item: SerpApiLocalResult,
  industry: string,
  location: string,
): RawBusiness {
  return {
    external_id: item.place_id || item.data_id || item.data_cid || null,
    name: item.title?.trim() || "Unknown Business",
    website: item.website || null,
    phone: item.phone || null,
    email: null,
    industry,
    city: location,
    state: null,
    country: "India",
    rating: typeof item.rating === "number" ? item.rating : null,
    review_count: typeof item.reviews === "number" ? item.reviews : null,
    source_url: item.link || null,
  };
}

export const serpApiBusinessSearchProvider: BusinessSearchProvider = {
  name: "serpapi",
  async search({ industry, location, count }: BusinessSearchParams): Promise<RawBusiness[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "SERPAPI_API_KEY is not configured. Please add SERPAPI_API_KEY to your .env.local file.",
      );
    }

    const pagesToFetch = Math.min(Math.ceil(count / PAGE_SIZE), MAX_PAGES);
    const results: RawBusiness[] = [];

    for (let page = 0; page < pagesToFetch; page++) {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_maps");
      url.searchParams.set("q", `${industry} in ${location}`);
      url.searchParams.set("type", "search");
      url.searchParams.set("hl", "en");
      url.searchParams.set("gl", "in");
      url.searchParams.set("api_key", apiKey);

      if (page > 0) {
        url.searchParams.set("start", String(page * PAGE_SIZE));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`SerpApi responded with HTTP ${response.status}: ${body}`);
        }

        const data = (await response.json()) as SerpApiResponse;

        if (data.error) {
          throw new Error(`SerpApi error: ${data.error}`);
        }

        const localResults = data.local_results ?? [];
        if (localResults.length === 0) {
          break;
        }

        for (const item of localResults) {
          results.push(mapSerpApiResultToBusiness(item, industry, location));
        }

        if (localResults.length < PAGE_SIZE || results.length >= count) {
          break;
        }
      } catch (err) {
        if (controller.signal.aborted) {
          throw new Error("SerpApi request timed out.");
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    return results.slice(0, count);
  },
};
