import { NextResponse } from "next/server";
import { loadTermsDocument } from "@/features/legal/loadTerms";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const terms = loadTermsDocument();
  const metaOnly = new URL(request.url).searchParams.get("meta") === "1";
  if (metaOnly) {
    return NextResponse.json({ version: terms.version, updated: terms.updated, title: terms.title });
  }
  return NextResponse.json(terms);
}
