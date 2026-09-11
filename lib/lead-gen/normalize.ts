export function normalizeDomain(website: string | null): string | null {
  if (!website) return null;
  const stripped = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  const domain = stripped.split("/")[0];
  return domain || null;
}

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  return digits || null;
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
