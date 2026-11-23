# HANDOFF: RegenX Partner Hub

Written for an AI agent or developer picking this project up. The user writes in Vietnamese; reply in Vietnamese unless asked otherwise. For setup see [README.md](README.md). Do not commit `.env` (it holds secrets; `.env.example` is the template).

## 1. What this is

RegenXLabs runs a drop-ship distribution program with Global Pharmaceutical (GP). Partner **stores** (websites) prepay a deposit and receive wholesale pricing. Customers order on the partner's own site; the partner then enters the order here. Wholesale cost is deducted from prepaid credit, GP packs and ships to the customer, and shipping is billed separately. Every Monday the system issues a statement: the partner replenishes credit back to its deposit, and any overage is billed separately.

This app is the central control plane: stores, customers, orders, ledger, statements, GP fulfillment, chat, notifications.

Program rules (from the original brief):
- **Starter**: $10,000 deposit, 5% off standard wholesale. **Premium**: $50,000 deposit, 10% off.
- Credit must be kept at the deposit level; weekly replenishment = deposit − remaining credit.
- Orders above available credit may be fulfilled **subject to approval**; the excess is an *outstanding* balance, due the following week and paid separately from replenishment.
- Shipping is paid by the partner and never reduces credit.
- Shipping destinations must be legally authorized. Everything is subject to regulatory approval.

Source catalog: `Individual_Vial_Pricing.pdf` (10 pages, about 313 SKUs, USD per vial). Transcribed into `prisma/seed/products.csv`.

## 2. Roles

| Role | Can | Cannot |
|---|---|---|
| `ADMIN` | Everything: stores, users, catalog, payments, adjustments, approve overage holds, statements, CSV export | n/a |
| `FULFILLMENT` (GP) | GP dashboard, fulfillment queue, read-only view of every store's orders and customers, chat and inbox, cross-store customers list (no money) | Any money, creating or editing orders and customers, settings, ledger |
| `PARTNER_OWNER` | Own store only: customers, orders, CSV import, chat, ledger, statements | Anything outside their store |
| `PARTNER_STAFF` | Same as owner, but cannot cancel submitted orders and can be blocked from seeing $ (`Store.hideAmountsFromStaff`) | |

All store scoping goes through **`lib/auth.ts`**:
- `requireStore(slug)` for pages. Returns `{ user, store, canSeeMoney, canEdit, isAdmin }`. GP gets `canEdit=false`, `canSeeMoney=false`.
- `requireStoreById(storeId, { ops?: true })` for server actions. GP is rejected unless `ops: true` (used only by chat and saved views).
- Never trust a `storeId` from the client without going through these.

Demo accounts (all password `ChangeMe123!`): `admin@regenx.local`, `gp@regenx.local`, `alpha@partner.local` (Starter), `beta@partner.local` (Premium).

## 3. Stack

Next.js 15.5 (App Router, server actions, Turbopack), React 19, TypeScript, Tailwind v4, Prisma 6 + PostgreSQL 16 (docker compose, **host port 5434**), zod, bcryptjs, jose (JWT session cookie `rx_session`), papaparse (CSV import), lucide-react (icons), vitest. Package manager: pnpm (build scripts approved in `pnpm-workspace.yaml`).

Dev server used so far: `pnpm dev -p 3100` (port 3000 was occupied on the user's machine).

## 4. Money model (most important, do not break)

All money is **integer cents**. `LedgerEntry` is append-only; balances are `SUM(amountCents)` per bucket, never stored.

Buckets: `CREDIT` (prepaid, positive = available), `OUTSTANDING` (overage owed), `SHIPPING` (owed).

- Pure rules live in `lib/ledger.ts` (`priceOrder`, `splitCharge`, `refundEntries`, `allocatePayment`, `statementFigures`, `statementPeriod`). Transactional flows live in `lib/orders.ts` and `lib/statements.ts`.
- Every money mutation locks the store row (`SELECT ... FOR UPDATE`) inside a transaction, so concurrent submits cannot overspend.
- `submitOrder`: re-prices from the current catalog, applies the tier discount, checks destination (`Store.allowedRegions`), restricted SKUs (`Product.restricted` vs `Store.allowRestricted`) and overdue statements. Fully covered by credit becomes `APPROVED`; otherwise credit is drained, the rest goes to `OUTSTANDING`, and the order becomes `ON_HOLD` until an admin runs `approveHold`.
- `markShipped`: GP enters carrier, tracking and shipping fee. The fee goes to `SHIPPING` only.
- `recordPayment` allocation order: OUTSTANDING, then SHIPPING, then CREDIT. Then `settleStatements`.
- Weekly cron `GET /api/cron/weekly-statements` (Bearer `CRON_SECRET`, `vercel.json`: Mondays 11:00 UTC) closes the previous Mon-Sun week in `America/New_York`, creates one statement per store (idempotent via unique `storeId+periodStart`), and flips unpaid past-due statements to `OVERDUE`, which blocks new orders.

Order lifecycle: `DRAFT -> (ON_HOLD) -> APPROVED -> PACKING -> SHIPPED -> DELIVERED`, plus `CANCELLED` (reverses exactly what the order charged).

## 5. Feature map (where things are)

```
app/
  login, forgot-password, reset-password     auth pages (public)
  (app)/                                     authenticated shell (layout loads nav, unread counts)
    overview            admin dashboard
    gp                  GP dashboard: queue, SLA aging, pick list, per-store inventory
    fulfillment[/id]    queue (table/board), pack/ship/deliver
    inbox, notifications
    customers           cross-store customer stats + filters (+ /api/customers/export CSV, admin only)
    stores, users, statements, catalog, search, account
    s/[slug]/           per-store: orders (+new, import, [id], [id]/edit), customers (+new, [id]),
                        chat, ledger, statements (+[id] printable), settings (admin: payments, adjustments, users)
  actions/              server actions: auth, reset, orders, customers, ops, chat, notifications, views, import
  api/cron/..., api/customers/export
components/             Nav, NotificationBell (in-page panel), FilterBar (search/filters/saved views),
                        OrderForm + ProductBrowser (Shopee-style product grid), Dialog (useDialog),
                        OrderViews (table + board), Chat, etc.
lib/                    auth, session, db, ledger, orders, statements, balances, notify, newOrders,
                        query (URL param parsing helpers), orderQuery, customerQuery, schemas, money, views
prisma/                 schema.prisma, migrations, seed.ts (catalog + demo), seed/products.csv,
                        seed/duplicates-report.csv, demo-orders.ts
tests/                  ledger.test.ts (unit), flow.test.ts + reset.test.ts (DB integration)
```

Other behaviors worth knowing:
- **Notifications** (`Notification`, audience STORE/ADMIN/FULFILLMENT) plus per-user "seen" timestamps. Sidebar shows a red badge with the count of new orders next to each store (`lib/newOrders.ts`, cleared by opening that store's Orders via `StoreSeen`).
- **Chat**: one channel per store, `Message`, optional `orderId` tag. Client polls every 4s (not realtime). Participants: store users, admin, GP.
- **Saved views**: `SavedView.config.query` stores the URL query string per user and page.
- **Password reset**: user requests -> `PasswordReset` (SHA-256 of token only, 1h, single use) + admin notification; admin can also reset from `/users` (temp password shown once, sessions revoked via `User.sessionVersion`). Email via Resend only if `RESEND_API_KEY` is set.
- **Create store** (`/stores`) also creates the owner login and shows the credentials once.
- Catalog edits (name, strength, source code, price, flags) and "New product" are admin-only and audited. SKU is generated (`NAME-STRENGTH`, `-B` suffix on collision) and immutable.

### Added later (read before touching these areas)
- **Store dashboard** `/s/[slug]/dashboard` is the partner landing page: deposit bar and replenish due, orders by status, 7/30-day sales, per-product ordered/pending/shipped/delivered (activity from orders; physical stock is the separate Stock control below). Layout is priority-ordered: alerts, deposit + pipeline, recent orders, then a collapsed "Sales & product stats".
- **Stock control (GP warehouse)** `lib/stock.ts`, pages `/stock` and `/stock/history`, actions `app/actions/stock.ts`. Append-only `StockMovement` (RECEIPT, ADJUST, RESERVE, RELEASE, SHIP) with `onHandDelta` / `reservedDelta`; on hand = sum of the first, reserved = sum of the second, available = on hand - reserved. Hooked into `lib/orders.ts`: an order that becomes APPROVED reserves its units (`submitOrder`, `approveHold`), cancel releases them, shipping calls `shipFromStock` which **refuses to ship** (rolls back, clear error) if a *tracked* product (`Product.trackStock`) lacks physical stock, then consumes on hand + the reservation. Untracked products are never checked; receiving stock turns tracking on. Orders are never blocked at submit (overselling shows as "short" to GP). Low/out alerts (`Product.reorderLevel`) notify GP and admin and appear on the GP dashboard. Partners only see an "out/low stock" tag in the product picker, never quantities. `prisma/backfill-stock.ts` reserves stock for orders approved before this existed (idempotent). Only GP and admin can change stock.
- **Reports** `/reports` (admin, all stores, filter by store) and `/s/[slug]/reports` tab (a store, money-visible users only): sales by **day or month** (New York time) with orders, units, wholesale, shipping, top products, date range, CSV export (`/api/reports`). Logic in `lib/reports.ts`, covered by `tests/reports.test.ts` (timezone boundaries, cancelled/drafts excluded).
- **Scale design** (verified with 10,000 orders / 200 stores / 5,000 products, then the test data was deleted): `Store.creditCents/outstandingCents/shippingCents` and `Product.onHand/reserved` are **trigger-maintained caches** of the ledger / stock journals (migration `scale_counters_indexes`; never write them directly; `tests/stock.test.ts` asserts they equal the journals). All big lists are paginated/filtered in SQL; dashboards show bounded top-N with links and CSV exports; order form searches products/customers through `/api/store/[slug]/products|customers` (one page at a time, so catalog size never reaches the browser); sidebar shows at most 8 stores for admin/GP. Trigram (pg_trgm) indexes serve ILIKE search. Notifications older than 90 days are pruned by the weekly cron. `/api/unread` has a 4s per-instance cache.
- **Running at scale**: one Node process saturates one core (~30 req/s of this app's pages on the dev machine under non-stop load; 4 instances behind a load balancer roughly doubled that on the same box, which also hosted the DB and the load generator). Run several instances (JWT sessions are stateless) and give each `?connection_limit=N` in `DATABASE_URL` so instances x N stays below Postgres `max_connections` (or use PgBouncer). The in-memory throttles/caches are per instance.
- **Live notifications**: `GET /api/unread` is polled every 8s by `components/Nav.tsx` (bell count, Inbox and per-store Chat badges, new-order badge, toast). `lib/notify.ts` `unreadCounts` is the source. Chat itself polls every 4s.
- **Addresses**: country is a select (`lib/countries.ts`); US requires a 2-letter state, other countries take free text. Shipping is allowed only for `Store.allowedRegions` (e.g. `US, VN, US-TX`), checked at submit. Phone is required everywhere.
- **Product picking** is a modal (`components/ProductPicker.tsx`), most-ordered products first (`popularProducts` in `lib/pickers.ts`).
- **Password reset**: `/forgot-password`, `/reset-password`, admin `/users`.
- **Dev tools** (`scripts/`, need the dev server on :3100, run with `node --env-file=.env`): `mobile-audit.mjs` (overflow + console errors at 390px), `e2e-stock.mjs` (GP receives/ships, cleans up its own rows), `hydration-diff.mjs`, `e2e-order.mjs`, `e2e-chat-notify.mjs`, `hover-check.mjs`, `console-errors.mjs`, `shot.mjs`, `html-to-pdf.mjs`. They drive headless Chrome (playwright-core) with signed session cookies. Git Bash rewrites `/s/...` paths, so prefix `MSYS_NO_PATHCONV=1`.
- **Never write binary files through shell redirection / PowerShell text cmdlets**: `RegenX_Order_Flow_User_Guide.pdf` was once saved that way and every stream was corrupted (UTF-8 replacement chars). Use `scripts/html-to-pdf.mjs` (Chrome writes the bytes) or a binary-safe writer. The HTML sources that were in `.audit/` were deleted during cleanup; only the (fixed) PDF remains, so edit it by recreating the HTML and running `scripts/html-to-pdf.mjs`.
- After a Prisma schema change stop the dev server before `prisma generate` (Windows locks the engine DLL), then clear `.next` and restart. Running `pnpm build` in the same folder as a running dev server corrupts the dev cache (stale pages/hydration errors): restart dev after building.
- Docker Desktop must be running for Postgres (`docker compose up -d`).

## 6. UI rules (user's explicit preferences)

White-dominant, **red (`#c8102e`) and navy (`#1b2a41`) accents**, flat with **no border radius** (global `* { border-radius: 0 !important }`), minimal helper text, **mobile-first**, Notion-like organization (sidebar per store, table/board, full filters and search on every list). Use in-app modals (`components/Dialog.tsx` `useDialog`), **never** `window.confirm/prompt/alert`. Icons: lucide-react only. Shared classes (`btn`, `btn-primary`, `btn-danger`, `input`, `label`, `panel`, `th`, `td`) are Tailwind v4 `@utility` blocks in `app/globals.css`.

## 7. Gotchas

- **After any `schema.prisma` change**: `pnpm prisma migrate dev`, `pnpm prisma generate`, then **restart the dev server**, otherwise pages 500 with "Cannot read properties of undefined".
- Tailwind v4: component classes must be `@utility`, not `@layer components` + `@apply` of other custom classes; `--radius-*: 0` is invalid.
- `"server-only"` is aliased to a stub in `vitest.config.ts` so lib code can be tested.
- React effects must not return a value (`useEffect(() => { fn(); }, ...)`, not `useEffect(() => fn(), ...)`). This broke the chat page once.
- On the user's Windows machine, very long bash heredocs with quotes fail; write large patch scripts to a file and run them, or use the Write/Edit tools.
- Date filters in `lib/query.ts` assume a fixed UTC-5 offset (marked `shortcut:`), so they are off by one hour during daylight saving.
- In-memory throttles (login attempts, reset requests) are per server instance. Move to DB/Redis if you run more than one instance.

## 8. Testing

`pnpm test` runs the unit tests. DB integration needs `TEST_DATABASE_URL` pointing at a **separate** database (the tests TRUNCATE tables): `postgresql://regenx:regenx@localhost:5434/regenx_test`, migrated with `prisma migrate deploy`. Current state: 25 tests, all passing (money rules, concurrent submits, overage and cancel/refund, shipping bucket, statement idempotency and settlement, overdue block, password reset). `pnpm tsc --noEmit`, `pnpm lint` and `pnpm build` were clean at last check.

Pages were smoke-tested over HTTP per role (including partner isolation 404s) with signed session cookies. **Client-side interactions were not driven in a real browser by the agent**; the user reported UI problems from screenshots (all fixed so far: chat effect error, bell opening a page instead of a panel, native dialogs, clipped "New order" button).

## 9. Known gaps and ideas

- Catalog data from the PDF is messy (shared/missing codes, same product at different prices); see `prisma/seed/duplicates-report.csv`. Admin must review before going live. Restricted flags were set by name pattern and need human review (not legal advice).
- Stock has no per-warehouse / lot / expiry tracking, no purchase orders, and the stock list is computed in memory (fine for hundreds of SKUs).
- No product images or categories (the PDF has none). The product grid groups by name only.
- The 4 balance cards in the store layout duplicate the dashboard's deposit panel on the dashboard tab (harmless; could be hidden there).
- No automatic order ingestion (REST API or Shopify/WooCommerce plugin). Orders are entered manually or via CSV.
- Chat is polling, not realtime. Statement PDF is browser print. Email only through Resend if configured.
- No UI to edit Store `requiredBalance`/discount independently of tier; no per-store price overrides.
- Not deployed anywhere. Only the local dev environment exists.
