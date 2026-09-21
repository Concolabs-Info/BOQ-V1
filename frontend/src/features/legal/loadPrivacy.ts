import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTermsMarkdown, type TermsDocument } from "./parseTerms";

export function loadPrivacyDocument(): TermsDocument {
  const file = join(process.cwd(), "content", "privacy.md");
  return parseTermsMarkdown(readFileSync(file, "utf8"));
}
