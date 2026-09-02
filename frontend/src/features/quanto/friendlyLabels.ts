const TECHNICAL_ID = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i;

function titleCase(value: string) {
  const smallWords = new Set(["and", "or", "of"]);
  return value
    .split(/(\s+|\/)/)
    .map((part, index) => {
      if (!part.trim() || part === "/") return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      if (/^[A-Z]\d+$/i.test(part) || /^\d+$/.test(part)) return part.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function friendlyRoomLabel(value?: string | null) {
  const source = String(value || "").trim();
  if (!source || TECHNICAL_ID.test(source)) return "Detected area";
  const readable = source
    .replace(/[_-]+/g, " ")
    .replace(/\bbed\s*room\b/gi, "bedroom")
    .replace(/\b(toi|toilet|wc)\.?\b/gi, "bathroom")
    .replace(/\bbal\.?\b/gi, "balcony")
    .replace(/\bdin\.?\b/gi, "dining")
    .replace(/\bliv\.?\b/gi, "living")
    .replace(/\bkit\.?\b/gi, "kitchen")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
  const unitMatch = readable.match(/^unit\s+([a-z0-9-]+)\s+(.+)$/i);
  return unitMatch
    ? `Unit ${unitMatch[1].toUpperCase()} · ${titleCase(unitMatch[2])}`
    : titleCase(readable);
}

export function compactRoomLabel(value?: string | null, maxLength = 34) {
  const label = friendlyRoomLabel(value);
  return label.length <= maxLength ? label : `${label.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function friendlyRegionKind(value?: string | null) {
  const source = String(value || "").replace(/[_-]+/g, " ").trim();
  return source ? titleCase(source) : "Review area";
}
