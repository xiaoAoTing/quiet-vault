import type { Entry } from './vault';

export function uniqueEntryNames(entries: Entry[], excludeId?: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.id === excludeId) continue;
    const name = entry.name.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

// Prefix matches come first; the exact typed value is never suggested back.
export function matchEntryNames(names: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q || limit <= 0) return [];
  const ranked: { name: string; prefix: boolean }[] = [];
  for (const name of names) {
    const lower = name.toLocaleLowerCase();
    if (lower === q) continue;
    const at = lower.indexOf(q);
    if (at < 0) continue;
    ranked.push({ name, prefix: at === 0 });
  }
  ranked.sort((a, b) => (a.prefix === b.prefix ? a.name.localeCompare(b.name) : a.prefix ? -1 : 1));
  return ranked.slice(0, limit).map(item => item.name);
}
