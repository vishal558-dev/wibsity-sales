import type { CheerioAPI } from "cheerio";
import type { CheckFinding } from "@/types/audit";

// A plain HTTP fetch + HTML parse (see lib/audits/fetch-website.ts) can't
// execute JS or measure real layout, so every check here is a heuristic
// proxy for the real thing — documented as such in each description.

export function checkTitle($: CheerioAPI): CheckFinding {
  const title = $("title").first().text().trim();
  const passed = title.length >= 10 && title.length <= 60;
  return {
    category: "seo",
    points: 30,
    passed,
    title: "Page title",
    description: !title
      ? "No <title> tag was found."
      : passed
        ? `Title is ${title.length} characters, within the recommended range.`
        : `Title is ${title.length} characters — outside the recommended 10-60 character range.`,
    evidence: { title: title || null },
  };
}

export function checkMetaDescription($: CheerioAPI): CheckFinding {
  const content = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const passed = content.length >= 50 && content.length <= 160;
  return {
    category: "seo",
    points: 25,
    passed,
    title: "Meta description",
    description: !content
      ? "No meta description was found."
      : passed
        ? `Meta description is ${content.length} characters, within the recommended range.`
        : `Meta description is ${content.length} characters — outside the recommended 50-160 character range.`,
    evidence: { description: content || null },
  };
}

export function checkHeadingStructure($: CheerioAPI): CheckFinding {
  const h1Count = $("h1").length;
  const passed = h1Count === 1;
  return {
    category: "seo",
    points: 20,
    passed,
    title: "Heading structure",
    description:
      h1Count === 0
        ? "No <h1> heading was found."
        : h1Count === 1
          ? "Exactly one <h1> heading was found."
          : `${h1Count} <h1> headings were found — a page should have exactly one.`,
    evidence: { h1Count },
  };
}

export function checkAltText($: CheerioAPI): CheckFinding {
  const images = $("img");
  const total = images.length;
  const withAlt = images.filter((_, el) => Boolean($(el).attr("alt")?.trim())).length;
  const coverage = total === 0 ? 1 : withAlt / total;
  const passed = coverage >= 0.8;
  return {
    category: "seo",
    points: 25,
    passed,
    title: "Image alt text",
    description:
      total === 0
        ? "No images were found on the page."
        : `${withAlt} of ${total} images (${Math.round(coverage * 100)}%) have alt text.`,
    evidence: { total, withAlt },
  };
}

export function checkViewport($: CheerioAPI): CheckFinding {
  const passed = $('meta[name="viewport"]').length > 0;
  return {
    category: "mobile",
    points: 100,
    passed,
    title: "Mobile viewport",
    description: passed
      ? "A viewport meta tag was found."
      : "No viewport meta tag was found. This is a heuristic signal only, not a rendering test, but its absence strongly suggests the page isn't optimized for mobile screens.",
    evidence: null,
  };
}

const CTA_WORDS = ["contact", "call", "book", "quote", "buy", "get started", "sign up", "order", "schedule"];

export function checkAboveFoldCta($: CheerioAPI): CheckFinding {
  // "Above the fold" heuristic: without real layout/rendering, treat the
  // first <h2> as the boundary (content past the first subheading is
  // typically below an initial hero/CTA area); if there's no <h2>, use the
  // first 40% of the combined element sequence instead. A single combined
  // selector is used so results come back in true document order.
  const ordered = $("h2, button, a").toArray();
  const h2Index = ordered.findIndex((el) => el.tagName === "h2");
  const cutoff = h2Index >= 0 ? h2Index : Math.ceil(ordered.length * 0.4);

  const hasCta = ordered.some((el, index) => {
    if (index >= cutoff) return false;
    if (el.tagName !== "button" && el.tagName !== "a") return false;
    const text = $(el).text().trim().toLowerCase();
    return CTA_WORDS.some((word) => text.includes(word));
  });

  return {
    category: "conversion",
    points: 40,
    passed: hasCta,
    title: "Above-the-fold call to action",
    description: hasCta
      ? "A call-to-action element was found near the top of the page."
      : "No clear call-to-action (e.g. Contact, Call, Book, Get a quote) was found near the top of the page.",
    evidence: null,
  };
}

export function checkContactMethod($: CheerioAPI): CheckFinding {
  const hasTel = $('a[href^="tel:"]').length > 0;
  const hasMailto = $('a[href^="mailto:"]').length > 0;
  const hasForm = $("form").length > 0;
  const passed = hasTel || hasMailto || hasForm;
  return {
    category: "conversion",
    points: 40,
    passed,
    title: "Contact method",
    description: passed
      ? "A phone link, email link, or contact form was found."
      : "No phone link, email link, or contact form was found.",
    evidence: { hasTel, hasMailto, hasForm },
  };
}

const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "wa.me", "whatsapp.com"];

function isSocialLink(href: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(href).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SOCIAL_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function checkSocialLinks($: CheerioAPI): CheckFinding {
  const links = $("a[href]")
    .toArray()
    .map((el) => $(el).attr("href") ?? "");
  const passed = links.some(isSocialLink);
  return {
    category: "conversion",
    points: 20,
    passed,
    title: "Social links",
    description: passed ? "At least one social media link was found." : "No social media links were found.",
    evidence: null,
  };
}

// Cross-cutting: not scored into any category, but always recorded as an
// issue when it fails (see lib/audits/score.ts — "technical" category
// findings never affect computeCategoryScores). Takes the final URL after
// redirects (see fetch-website.ts) rather than the stored website value,
// so an http -> https redirect is correctly read as passing.
export function checkHttps(finalUrl: string): CheckFinding {
  const passed = finalUrl.toLowerCase().startsWith("https://");
  return {
    category: "technical",
    points: 30,
    passed,
    title: "HTTPS",
    description: passed ? "The site is served over HTTPS." : "The site is served over plain HTTP, not HTTPS.",
    evidence: { url: finalUrl },
  };
}

export function runAllChecks($: CheerioAPI): CheckFinding[] {
  return [
    checkTitle($),
    checkMetaDescription($),
    checkHeadingStructure($),
    checkAltText($),
    checkViewport($),
    checkAboveFoldCta($),
    checkContactMethod($),
    checkSocialLinks($),
  ];
}
