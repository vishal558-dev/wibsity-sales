"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard failed to load", error);
  }, [error]);

  return (
    <ErrorState
      title="Dashboard unavailable"
      description="We couldn't load your latest dashboard data. Please try again."
      onRetry={retry}
    />
  );
}
