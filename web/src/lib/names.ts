// Utilities for dealing with server-unique display names like "John (2)"

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  try {
    return String(name).replace(/\s*\(\d+\)\s*$/, '').trim();
  } catch {
    return String(name || '');
  }
}

export function equalNames(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a || '');
  const nb = normalizeName(b || '');
  return na.localeCompare(nb, undefined, { sensitivity: 'accent' }) === 0;
}
