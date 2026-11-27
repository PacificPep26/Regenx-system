// inventory orders reuse the status badge, but APPROVED means "waiting for GP to stock it", not "received"
export const invBadge = (s: string) => (s === "APPROVED" ? "TO_STOCK" : s === "RECEIVED" ? "STOCKED" : s);
