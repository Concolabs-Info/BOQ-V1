export type TermsDocument = {
  version: string;
  updated: string;
  title: string;
  markdown: string;
};

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseTermsMarkdown(raw: string): TermsDocument {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("content/terms.md must start with YAML frontmatter (version, updated, title).");
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const cut = line.indexOf(":");
    if (cut <= 0) continue;
    fields[line.slice(0, cut).trim()] = stripQuotes(line.slice(cut + 1));
  }

  const version = fields.version?.trim();
  const updated = fields.updated?.trim();
  const title = fields.title?.trim() || "Terms of Service";
  if (!version || !updated) {
    throw new Error("content/terms.md frontmatter must include version and updated.");
  }

  const markdown = match[2].replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!markdown) {
    throw new Error("content/terms.md has no body to render.");
  }

  return { version, updated, title, markdown };
}
