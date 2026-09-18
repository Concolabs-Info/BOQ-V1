export function firstParam(value: string | string[] | undefined): string | undefined {
  const next = Array.isArray(value) ? value[0] : value;
  return next?.trim() || undefined;
}

export function safeInternalPath(value: string | string[] | undefined): string | undefined {
  const next = firstParam(value);
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return undefined;
  }
  return next;
}
