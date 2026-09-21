import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTermsMarkdown, type TermsDocument } from "./parseTerms";

export function loadTermsDocument(): TermsDocument {
  const file = join(process.cwd(), "content", "terms.md");
  return parseTermsMarkdown(readFileSync(file, "utf8"));
}
