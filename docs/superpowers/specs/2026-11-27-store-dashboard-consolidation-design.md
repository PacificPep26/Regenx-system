# Store dashboard: one place per fact (short design, approved)

## Intent
The store dashboard shows the same facts several times (replenish amount, outstanding, top-up action, order pipeline, inventory, shipping). A partner should see each fact once and know what to do next.

## Goals
- One **balance card**: deposit vs required with a bar, the single "restore $X by <date>" line with the **Request top-up** button, owed amounts only when above zero, and the two add buttons (customer order, inventory).
- One **summary row**: Inventory (units, value), Goods this week, Shipping this week.
- One **status row** (On hold, Received, Packing, Shipped, Delivered), each linking to the filtered Customer orders; On hold is red when above zero.
- Keep Recent orders (5, with Goods and Ship columns) and the collapsed Sales & product stats.

## Non-goals
No change to money rules, statements or the other tabs. Admin and GP dashboards are not touched in this change (they were not named).

## Removed on purpose
The yellow "Replenish" banner, the red "Outstanding" banner, the red "On hold" banner, the To replenish / Outstanding / Shipping due tile trio, and the Request top-up button in the store header (it stays on the dashboard card; the held-order page keeps its own).

## Approaches
1. Re-arrange the existing page (chosen): same data and queries, fewer blocks. Lowest risk, fastest.
2. New component per block: more reusable but nothing else needs the blocks.
3. Move everything to Reports: loses the at-a-glance purpose.

## Builder decisions
- Owed amounts shown as small chips under the replenish line only when `> 0` (outstanding over credit, shipping due).
- Header top-up button removed from `app/(app)/s/[slug]/layout.tsx`; the dashboard card gets `TopUpButton` (owner only) and the pending state.
- Mobile 360px: card stacks, summary row and status row keep their columns with 9-10px labels.
