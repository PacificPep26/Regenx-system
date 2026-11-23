import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { toCents } from "../lib/money";

const prisma = new PrismaClient();

// Default compliance flags: Rx / controlled / unapproved-drug names. Admin reviews in Catalog.
const RESTRICTED =
  /HGH 191AA|^HGH$|Somatropin|Insulin|Semaglutide|Tirzepatide|Retatrutide|Liraglutide|Dulaglutide|Cagri|Mazdutide|Survodutide|Eloralintide|Bioglutide|HCG|HMG|EPO|Dermorphin|Oxytocin|Gonadorelin|Tesamorelin|Tesa10/i;

const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type Row = { sourceCode: string; name: string; strength: string; price: string };

async function seedProducts() {
  const csv = readFileSync(path.join(__dirname, "seed/products.csv"), "utf8");
  const { data, errors } = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
  if (errors.length) throw new Error(`CSV parse errors: ${JSON.stringify(errors.slice(0, 3))}`);

  const usedSku = new Map<string, number>();
  const byCode = new Map<string, number>();
  const byNameStrength = new Map<string, Row[]>();
  const report: string[][] = [["issue", "sourceCode", "name", "strength", "price", "sku"]];

  for (const r of data) {
    const base = `${slug(r.name)}-${slug(r.strength)}`;
    const n = (usedSku.get(base) ?? 0) + 1;
    usedSku.set(base, n);
    const sku = n === 1 ? base : `${base}-${String.fromCharCode(64 + n)}`; // -B, -C...
    const code = r.sourceCode.trim() || null;
    if (code) byCode.set(code, (byCode.get(code) ?? 0) + 1);
    const key = `${r.name.replace(/\s|\(.*?\)/g, "").toUpperCase()}|${r.strength.toUpperCase()}`;
    byNameStrength.set(key, [...(byNameStrength.get(key) ?? []), r]);

    const fields = {
      sourceCode: code,
      name: r.name.trim(),
      strength: r.strength.trim(),
      basePriceCents: toCents(r.price),
      restricted: RESTRICTED.test(r.name),
    };
    // update keeps admin edits to active/restricted/notes; price & names follow the CSV
    await prisma.product.upsert({
      where: { sku },
      create: { sku, ...fields },
      update: { sourceCode: fields.sourceCode, name: fields.name, strength: fields.strength, basePriceCents: fields.basePriceCents },
    });
    if (!code) report.push(["missing-code", "", r.name, r.strength, r.price, sku]);
    if (n > 1) report.push(["sku-collision", code ?? "", r.name, r.strength, r.price, sku]);
  }
  for (const [code, count] of byCode) {
    if (count > 1) {
      for (const r of data.filter((d) => d.sourceCode.trim() === code))
        report.push(["shared-code", code, r.name, r.strength, r.price, ""]);
    }
  }
  for (const rows of byNameStrength.values()) {
    if (rows.length > 1 && new Set(rows.map((r) => r.price)).size > 1)
      for (const r of rows) report.push(["same-product-diff-price", r.sourceCode, r.name, r.strength, r.price, ""]);
  }
  writeFileSync(
    path.join(__dirname, "seed/duplicates-report.csv"),
    Papa.unparse(report),
  );
  console.log(`Products: ${data.length} rows; report lines: ${report.length - 1}`);
}

async function seedDemo() {
  const hash = await bcrypt.hash("ChangeMe123!", 10);
  const stores = [
    { name: "Alpha Peptides", slug: "alpha", tier: "STARTER" as const, requiredBalanceCents: 1_000_000, discountBps: 500 },
    { name: "Beta Wellness", slug: "beta", tier: "PREMIUM" as const, requiredBalanceCents: 5_000_000, discountBps: 1000 },
  ];
  await prisma.user.upsert({
    where: { email: "admin@regenx.local" },
    create: { email: "admin@regenx.local", name: "RegenX Admin", passwordHash: hash, role: "ADMIN" },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: "gp@regenx.local" },
    create: { email: "gp@regenx.local", name: "GP Fulfillment", passwordHash: hash, role: "FULFILLMENT" },
    update: {},
  });
  for (const s of stores) {
    const store = await prisma.store.upsert({
      where: { slug: s.slug },
      create: { ...s, status: "ACTIVE", allowedRegions: ["US"] },
      update: {},
    });
    await prisma.user.upsert({
      where: { email: `${s.slug}@partner.local` },
      create: { email: `${s.slug}@partner.local`, name: `${s.name} Owner`, passwordHash: hash, role: "PARTNER_OWNER", storeId: store.id },
      update: {},
    });
    const hasDeposit = await prisma.ledgerEntry.count({ where: { storeId: store.id, type: "DEPOSIT" } });
    if (!hasDeposit)
      await prisma.ledgerEntry.create({
        data: { storeId: store.id, bucket: "CREDIT", type: "DEPOSIT", amountCents: s.requiredBalanceCents, memo: "Initial deposit (demo)" },
      });
  }
  console.log("Demo users (password ChangeMe123!): admin@regenx.local, gp@regenx.local, alpha@partner.local, beta@partner.local");
}

seedProducts()
  .then(() => (process.env.SEED_DEMO === "0" ? undefined : seedDemo()))
  .finally(() => prisma.$disconnect());
