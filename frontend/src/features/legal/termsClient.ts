export type TermsMeta = {
  version: string;
  updated: string;
  title: string;
};

export function hasAcceptedTerms(
  context: { terms_accepted?: boolean; terms_version?: string | null },
  meta: Pick<TermsMeta, "version">,
) {
  return Boolean(context.terms_accepted) && context.terms_version === meta.version;
}

export async function fetchTermsMeta(): Promise<TermsMeta> {
  const response = await fetch("/api/legal/terms?meta=1");
  if (!response.ok) {
    throw new Error("Could not load the current terms version.");
  }
  return (await response.json()) as TermsMeta;
}
