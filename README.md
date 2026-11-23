# RegenX Partner Hub

Central order and prepaid-credit management for RegenXLabs distribution partners (stores), GP fulfillment and RegenX admin.

## Run locally

```bash
docker compose up -d                 # Postgres on localhost:5434
cp .env.example .env                 # then set SESSION_SECRET / CRON_SECRET
pnpm install
pnpm prisma migrate deploy
pnpm db:seed                         # 313 SKUs from the PDF + demo users (SEED_DEMO=0 to skip demo)
pnpm dev
```

Demo logins (password `ChangeMe123!`, change after first login):

| Email | Role |
|---|---|
| admin@regenx.local | Admin (RegenX) |
| gp@regenx.local | GP Fulfillment manager |
| alpha@partner.local | Owner, Alpha Peptides (Starter) |
| beta@partner.local | Owner, Beta Wellness (Premium) |

## Roles

- **Admin**: everything: stores, users, catalog prices, payments, adjustments, overage approval, statements.
- **GP (FULFILLMENT)**: GP dashboard (queue, aging/SLA, pick list, per-store order inventory), fulfillment board, read-only view of every store's orders and customers, chat with stores. Never sees money.
- **Partner owner / staff**: only their own store: customers, orders (form or CSV), chat, ledger, statements. Staff can be blocked from seeing $ per store.

## Money rules (`lib/ledger.ts`, `lib/orders.ts`)

- Amounts are integer cents in an append-only `LedgerEntry` table with three buckets: `CREDIT` (prepaid), `OUTSTANDING` (overage owed), `SHIPPING` (owed). Balance = sum of entries.
- Submit re-prices from the catalog, applies the tier discount (5% / 10%) and locks the store row, so concurrent orders cannot overspend. Any amount over credit goes to `OUTSTANDING` and the order is put `ON_HOLD` until an admin approves it.
- Shipping fees are billed to `SHIPPING` and never reduce credit.
- Payments are applied in this order: outstanding, then shipping, then credit.
- A Monday cron (`/api/cron/weekly-statements`, `vercel.json`) closes the previous Mon–Sun week in New York time and issues statements. Statements past due become `OVERDUE`, which blocks new orders.

## Program rules (RegenXLabs partnership terms)

- Starter $10,000 / 5% and Premium $50,000 / 10%; credit is deducted at submit; shipping is billed separately.
- Orders above available credit are held for admin approval and the excess is an *outstanding* balance, paid separately from replenishment.
- With an **overdue** statement only fulfillment *beyond* the prepaid credit is paused; orders within credit still go through.
- Weekly statements run **every Monday 11:00 UTC** from a Railway cron service (`statements-cron`) calling `/api/cron/weekly-statements` with `CRON_SECRET`.
- Premium extras: order/tracking **REST API** (`/api/v1/orders`, key per store in the store's **Plan** tab), priority queue/inbox, insurance request. Per product: UPC and documentation links (admin Catalog). Per store: branding/labeling instructions shown to GP.

## Tests

```bash
pnpm test                                                       # unit tests (money rules)
TEST_DATABASE_URL=postgresql://regenx:regenx@localhost:5434/regenx_test pnpm test   # + DB integration
```

Create the test DB once: `docker compose exec db psql -U regenx -c "CREATE DATABASE regenx_test;"`, then run `DATABASE_URL=<test url> pnpm prisma migrate deploy`.

## Catalog data

The real wholesale price list (`Individual_Vial_Pricing.pdf`, `prisma/seed/products.csv`, `duplicates-report.csv`) is **confidential and gitignored**: keep your copy locally; without it `pnpm db:seed` loads `products.example.csv` sample rows only. `products.csv` is transcribed from the PDF. The source has shared, missing and conflicting item codes. `prisma/seed/duplicates-report.csv` lists them for review. SKUs are generated (`NAME-STRENGTH`, with `-B` added on collision), and the original code is kept as `sourceCode`. Rx/controlled-looking items are flagged `restricted` by default. Review these flags in Catalog; the flags are a control, not legal advice.
