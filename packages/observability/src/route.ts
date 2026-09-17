const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Segments beyond this depth are folded away to bound label cardinality. */
const maximumSegments = 8;

/**
 * Converts a concrete request path into a stable route template.
 *
 * Two problems are solved at once. Metric labels must have bounded cardinality,
 * and a logged path must not carry an invitation capability, a signed download
 * key, or an entity identifier that turns the log into a personal-data store.
 * Both are avoided by substituting every variable segment before the value is
 * ever attached to a log line or a metric series.
 */
export function normalizeRouteTemplate(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? "";
  const segments = withoutQuery.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) return "/";

  const normalized = segments
    .slice(0, maximumSegments)
    .map((segment) => normalizeSegment(segment));
  if (segments.length > maximumSegments) normalized.push("*");
  return `/${normalized.join("/")}`;
}

function normalizeSegment(segment: string): string {
  const decoded = decodeSegment(segment);
  if (uuidPattern.test(decoded)) return ":id";
  if (/^\d+$/.test(decoded)) return ":number";
  // Opaque high-entropy material: capabilities, signed keys, and hashes.
  if (decoded.length >= 20 && /^[A-Za-z0-9_.~-]+$/.test(decoded))
    return ":token";
  if (decoded.length > 40) return ":value";
  if (!/^[A-Za-z0-9._~-]+$/.test(decoded)) return ":value";
  return decoded;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
