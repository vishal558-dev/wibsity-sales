import * as cheerio from "cheerio";
import { runAllChecks, checkHttps } from "./checks";
import type { CheckFinding } from "@/types/audit";

const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface FetchResult {
  reachable: boolean;
  error: string | null;
  findings: CheckFinding[];
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Not unit-tested (network-dependent, no framework for mocking fetch in
// this codebase) — matches lib/lead-gen/job-store.ts's precedent of no
// self-check for DB/network-touching helpers. Exercised in Task 9's
// manual verification against a real reachable and a real unreachable URL.
export async function fetchAndCheckWebsite(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(withScheme(url), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { reachable: false, error: `Site responded with HTTP ${response.status}.`, findings: [] };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        reachable: false,
        error: `Site did not return HTML (content-type: ${contentType || "unknown"}).`,
        findings: [],
      };
    }

    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          break;
        }
        html += decoder.decode(value, { stream: true });
      }
    } else {
      html = await response.text();
    }

    const $ = cheerio.load(html);
    const findings = [...runAllChecks($), checkHttps(response.url || url)];
    return { reachable: true, error: null, findings };
  } catch (err) {
    const reason = controller.signal.aborted
      ? "Request timed out."
      : err instanceof Error
        ? err.message
        : "Unknown error.";
    return { reachable: false, error: `Could not reach the site: ${reason}`, findings: [] };
  } finally {
    clearTimeout(timeout);
  }
}
