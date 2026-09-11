"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PipelineStage } from "@/types/pipeline";
import type { LeadFilterOptions } from "@/types/lead";

const SCORE_CATEGORIES = ["HOT", "WARM", "LOW", "SKIP"] as const;

const selectClassName =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function LeadFilters({
  stages,
  options,
}: {
  stages: PipelineStage[];
  options: LeadFilterOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function toggleParam(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === "1") params.delete(key);
    else params.set(key, "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filter by score"
        className={selectClassName}
        value={searchParams.get("score") ?? ""}
        onChange={(e) => setParam("score", e.target.value || null)}
      >
        <option value="">All scores</option>
        {SCORE_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by status"
        className={selectClassName}
        value={searchParams.get("stage") ?? ""}
        onChange={(e) => setParam("stage", e.target.value || null)}
      >
        <option value="">All statuses</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.slug}>
            {stage.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by industry"
        className={selectClassName}
        value={searchParams.get("industry") ?? ""}
        onChange={(e) => setParam("industry", e.target.value || null)}
      >
        <option value="">All industries</option>
        {options.industries.map((industry) => (
          <option key={industry} value={industry}>
            {industry}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by location"
        className={selectClassName}
        value={searchParams.get("city") ?? ""}
        onChange={(e) => setParam("city", e.target.value || null)}
      >
        <option value="">All locations</option>
        {options.cities.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by source"
        className={selectClassName}
        value={searchParams.get("source") ?? ""}
        onChange={(e) => setParam("source", e.target.value || null)}
      >
        <option value="">All sources</option>
        {options.sources.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={searchParams.get("website") === "1"}
          onChange={() => toggleParam("website")}
        />
        Has website
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={searchParams.get("phone") === "1"}
          onChange={() => toggleParam("phone")}
        />
        Has phone
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={searchParams.get("email") === "1"}
          onChange={() => toggleParam("email")}
        />
        Has email
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={searchParams.get("followup") === "1"}
          onChange={() => toggleParam("followup")}
        />
        Follow-up due
      </label>
    </div>
  );
}
