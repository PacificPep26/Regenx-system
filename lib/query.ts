import { toCents } from "./money";

export type SP = Record<string, string | string[] | undefined>;

export const str = (sp: SP, k: string) => {
  const v = sp[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
};

/** comma list filtered to an allowed set (never trust raw enum values from the URL) */
export function list<T extends string>(sp: SP, k: string, allowed: readonly T[]): T[] | undefined {
  const v = str(sp, k);
  if (!v) return undefined;
  const out = v.split(",").filter((x): x is T => (allowed as readonly string[]).includes(x));
  return out.length ? out : undefined;
}

export function one<T extends string>(sp: SP, k: string, allowed: readonly T[]): T | undefined {
  return list(sp, k, allowed)?.[0];
}

/** yyyy-mm-dd inputs, interpreted as New York days; `to` is inclusive.
 * shortcut: fixed -05:00 offset, off by 1h during EDT; switch to statementPeriod-style tz math if it matters */
export function dateRange(sp: SP, from: string, to: string) {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const f = ok(str(sp, from));
  const t = ok(str(sp, to));
  const gte = f ? new Date(`${f}T00:00:00-05:00`) : undefined;
  const lt = t ? new Date(new Date(`${t}T00:00:00-05:00`).getTime() + 86400000) : undefined;
  return gte || lt ? { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } : undefined;
}

export function centsRange(sp: SP, min: string, max: string) {
  const parse = (s?: string) => {
    if (!s) return undefined;
    try {
      return toCents(s);
    } catch {
      return undefined;
    }
  };
  const gte = parse(str(sp, min));
  const lte = parse(str(sp, max));
  return gte != null || lte != null ? { ...(gte != null ? { gte } : {}), ...(lte != null ? { lte } : {}) } : undefined;
}

export function pageOf(sp: SP, size = 25) {
  const page = Math.max(1, Math.floor(Number(str(sp, "page"))) || 1);
  return { page, skip: (page - 1) * size, take: size };
}

/** sort=field_dir restricted to an allow-list */
export function sortOf<T extends string>(sp: SP, allowed: readonly T[], fallback: `${T}_${"asc" | "desc"}`) {
  const m = (str(sp, "sort") ?? "").match(/^(.+)_(asc|desc)$/);
  const [field, dir] =
    m && (allowed as readonly string[]).includes(m[1]) ? [m[1], m[2]] : (fallback.split(/_(?=asc$|desc$)/) as [string, string]);
  return { [field]: dir } as Record<T, "asc" | "desc">;
}

export const flat = (sp: SP) =>
  Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
