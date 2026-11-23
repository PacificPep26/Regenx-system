/** "$1,234.50" | "12.5" -> integer cents. Throws on garbage. */
export function toCents(input: string | number): number {
  const s = String(input).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) throw new Error(`Invalid amount: ${input}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -cents : cents;
}

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUSD = (cents: number) => fmt.format(cents / 100);
