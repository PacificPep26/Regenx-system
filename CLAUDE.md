# RegenX Partner Hub

Read [HANDOFF.md](HANDOFF.md) first: business rules, roles, money model, file map, UI rules and gotchas. Setup and demo logins are in [README.md](README.md).

Non-negotiables:
- Money is integer cents in the append-only `LedgerEntry`; mutate it only through `lib/orders.ts`, inside a transaction that locks the store row.
- Scope every store query through `requireStore` / `requireStoreById` in `lib/auth.ts`.
- UI: white-dominant, red + navy accents, no border radius, mobile-first, lucide icons, in-app dialogs (never `window.confirm/prompt`).
- After changing `prisma/schema.prisma`: migrate, `pnpm prisma generate`, restart the dev server.
- The user speaks Vietnamese; reply in Vietnamese.
