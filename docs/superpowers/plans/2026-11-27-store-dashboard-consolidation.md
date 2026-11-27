# Store dashboard consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, one session) to implement this plan task-by-task.

**Goal:** Each fact appears once on the store dashboard; the page tells the partner what to do next.

**Architecture:** Re-arrange `app/(app)/s/[slug]/dashboard/page.tsx` (same queries, fewer blocks); move the top-up button from the store layout into the dashboard card.

**Tech Stack:** Next.js 15 server components, Tailwind v4, existing `TopUpButton`, `Money`, `Badge`.

**Spec:** `docs/superpowers/specs/2026-11-27-store-dashboard-consolidation-design.md`

## Global Constraints
- White, red + navy, no border radius, mobile-first (360px, no horizontal page scroll), labels 9-10px on phones.
- Money rules and other tabs unchanged; admin/GP dashboards untouched.

## Review Focus
- Held order (ON_HOLD): the dashboard still makes it obvious (red On hold tile linking to filtered orders).
- Store with nothing owed and full deposit: no "restore" line, no chips.
- Staff with amounts hidden (`canSeeMoney` false): no balance card, still gets the status row and add-order button.
- Pending top-up request: the button shows "Requested" and is disabled.

---

### Task 1: Rebuild the dashboard top section

**Files:**
- Modify: `app/(app)/s/[slug]/dashboard/page.tsx` (alerts block, deposit panel, fact grids)
- Modify: `app/(app)/s/[slug]/layout.tsx` (remove header `TopUpButton` and its query)

**Interfaces:**
- Consumes: `TopUpButton({ storeId, suggested, pending, className? })`, `bal`, `replenish`, `dueDate`, `counts`, `weekGoods`, `weekShipping`, `invUnits`, `invValue` (already computed in the page).
- Produces: the dashboard now renders `topUpPending: boolean` from a `db.topUpRequest.count` query (owner only).

- [ ] **Step 1: Remove the `alerts` array and its `<ul>` render; drop the To replenish / Outstanding / Shipping due `Fact` grid.**
- [ ] **Step 2: In the deposit card render, under the bar: one line "Restore {replenish} by {dueDate}" with `TopUpButton` (owner only) when `replenish > 0`; small red chips for `bal.OUTSTANDING > 0` ("Over credit $X") and `bal.SHIPPING > 0` ("Shipping due $X") linking to the ledger.**
- [ ] **Step 3: Keep the summary row (Inventory, Goods / week, Shipping / week); make the status row tiles `Link`s to `${base}/orders?status=<STATUS>`, red number when `ON_HOLD > 0`.**
- [ ] **Step 4: Remove the `TopUpButton`, its import and the `topUps` count from the store layout.**
- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `TEST_DATABASE_URL=... npx vitest run` 66 pass; screenshots at 360px and 1280px as alpha (owner) and as staff-like view show one balance card, no banners, one top-up button.
- [ ] **Step 6: Commit locally** (`git add -A && git commit`), no push.
