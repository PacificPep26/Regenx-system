import { Prisma } from "@prisma/client";
import { db } from "./db";

export type Unit = "day" | "month";
export type Scope = { storeId?: string; storeQ?: string };
export type PeriodRow = { period: Date; orders: number; units: number; wholesale: number; shipping: number };
export type TopProduct = { name: string; strength: string; sku: string; units: number; orders: number };

const TZ = "America/New_York"; // same business timezone as statements

/** Default window: 30 days for daily view, 12 months for monthly view. `to` is exclusive. */
export function defaultRange(unit: Unit, now = new Date()) {
  const to = new Date(now.getTime() + 86400000);
  const from = unit === "day" ? new Date(now.getTime() - 29 * 86400000) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { from, to };
}

const scopeSql = (s: Scope) => [
  s.storeId ? Prisma.sql`AND o."storeId" = ${s.storeId}` : Prisma.empty,
  s.storeQ ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Store" st WHERE st.id = o."storeId" AND (st.name ILIKE ${`%${s.storeQ.replace(/[\\%_]/g, "\\$&")}%`} OR st.slug ILIKE ${`%${s.storeQ.replace(/[\\%_]/g, "\\$&")}%`}))` : Prisma.empty,
];

/** Orders, units, wholesale and shipping per day or month (submitted, not cancelled), in New York time. */
export async function salesByPeriod(unit: Unit, from: Date, to: Date, scope: Scope): Promise<PeriodRow[]> {
  const u = Prisma.raw(unit === "day" ? "'day'" : "'month'"); // whitelisted literal, never user text
  const [a, b] = scopeSql(scope);
  return db.$queryRaw<PeriodRow[]>`
    WITH x AS (
      SELECT date_trunc(${u}, (o."submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS period,
             o."totalCents" AS total, COALESCE(o."shippingFeeCents", 0) AS ship,
             (SELECT COALESCE(SUM(i.qty), 0) FROM "OrderItem" i WHERE i."orderId" = o.id) AS units
      FROM "Order" o
      WHERE o.status NOT IN ('DRAFT', 'CANCELLED') AND o."submittedAt" >= ${from} AND o."submittedAt" < ${to} ${a} ${b}
    )
    SELECT period, COUNT(*)::int AS orders, SUM(units)::int AS units, SUM(total)::int AS wholesale, SUM(ship)::int AS shipping
    FROM x GROUP BY period ORDER BY period DESC`;
}

export async function topProducts(from: Date, to: Date, scope: Scope, limit = 10): Promise<TopProduct[]> {
  const [a, b] = scopeSql(scope);
  return db.$queryRaw<TopProduct[]>`
    SELECT p.name, p.strength, p.sku, SUM(i.qty)::int AS units, COUNT(DISTINCT o.id)::int AS orders
    FROM "OrderItem" i
    JOIN "Order" o ON o.id = i."orderId"
    JOIN "Product" p ON p.id = i."productId"
    WHERE o.status NOT IN ('DRAFT', 'CANCELLED') AND o."submittedAt" >= ${from} AND o."submittedAt" < ${to} ${a} ${b}
    GROUP BY p.id, p.name, p.strength, p.sku ORDER BY units DESC, p.name LIMIT ${limit}`;
}

export const periodLabel = (d: Date, unit: Unit) =>
  unit === "day"
    ? d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : d.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
