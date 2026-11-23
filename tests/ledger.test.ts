import { describe, it, expect } from "vitest";
import {
  priceOrder,
  splitCharge,
  allocatePayment,
  statementFigures,
  statementPeriod,
  refundEntries,
} from "@/lib/ledger";
import { toCents, formatUSD } from "@/lib/money";

describe("money", () => {
  it("parses dollars to integer cents without float drift", () => {
    expect(toCents("128.25")).toBe(12825);
    expect(toCents("14.40")).toBe(1440);
    expect(toCents("$1,234.5")).toBe(123450);
  });
  it("formats cents", () => {
    expect(formatUSD(1000000)).toBe("$10,000.00");
    expect(formatUSD(-500)).toBe("-$5.00");
  });
});

describe("priceOrder", () => {
  const items = [
    { qty: 2, unitPriceCents: 1800 }, // Retatrutide 5mg
    { qty: 1, unitPriceCents: 12825 }, // BB30
  ];
  it("applies Starter 5% discount", () => {
    expect(priceOrder(items, 500)).toEqual({ subtotalCents: 16425, totalCents: 15604 });
  });
  it("applies Premium 10% discount", () => {
    expect(priceOrder(items, 1000)).toEqual({ subtotalCents: 16425, totalCents: 14783 });
  });
  it("rejects non-positive quantities", () => {
    expect(() => priceOrder([{ qty: 0, unitPriceCents: 100 }], 500)).toThrow();
  });
});

describe("splitCharge", () => {
  it("fully covered by credit", () => {
    expect(splitCharge(1000000, 300000)).toEqual({ creditAppliedCents: 300000, overageCents: 0 });
  });
  it("exceeds credit by $500: credit 0, outstanding $500", () => {
    expect(splitCharge(100000, 150000)).toEqual({ creditAppliedCents: 100000, overageCents: 50000 });
  });
  it("credit already negative/zero puts all on overage", () => {
    expect(splitCharge(0, 5000)).toEqual({ creditAppliedCents: 0, overageCents: 5000 });
    expect(splitCharge(-100, 5000)).toEqual({ creditAppliedCents: 0, overageCents: 5000 });
  });
});

describe("refundEntries", () => {
  it("reverses exactly what the order took", () => {
    expect(refundEntries({ creditAppliedCents: 100000, overageCents: 50000 })).toEqual([
      { bucket: "CREDIT", type: "ORDER_REFUND", amountCents: 100000 },
      { bucket: "OUTSTANDING", type: "OVERAGE_REVERSAL", amountCents: -50000 },
    ]);
    expect(refundEntries({ creditAppliedCents: 2000, overageCents: 0 })).toEqual([
      { bucket: "CREDIT", type: "ORDER_REFUND", amountCents: 2000 },
    ]);
  });
});

describe("allocatePayment", () => {
  it("pays outstanding first, then shipping, rest to credit", () => {
    expect(allocatePayment(400000, { outstandingCents: 50000, shippingCents: 2000 })).toEqual({
      outstandingCents: 50000,
      shippingCents: 2000,
      creditCents: 348000,
    });
  });
  it("partial payment only touches outstanding", () => {
    expect(allocatePayment(10000, { outstandingCents: 50000, shippingCents: 2000 })).toEqual({
      outstandingCents: 10000,
      shippingCents: 0,
      creditCents: 0,
    });
  });
});

describe("statementFigures", () => {
  it("matches the program doc example: $10k - $3k => replenish $3k", () => {
    const f = statementFigures({
      requiredBalanceCents: 1000000,
      creditCents: 700000,
      outstandingCents: 0,
      shippingCents: 4500,
    });
    expect(f).toEqual({ replenishDueCents: 300000, outstandingDueCents: 0, shippingDueCents: 4500 });
  });
  it("never asks for negative replenishment", () => {
    expect(
      statementFigures({ requiredBalanceCents: 1000000, creditCents: 1200000, outstandingCents: 0, shippingCents: 0 })
        .replenishDueCents,
    ).toBe(0);
  });
});

describe("statementPeriod (America/New_York)", () => {
  it("Monday morning closes the previous Mon-Sun week", () => {
    // Mon 2026-11-23 11:00 UTC = 06:00 EST
    const p = statementPeriod(new Date("2026-11-23T11:00:00Z"));
    expect(p.periodStart.toISOString()).toBe("2026-11-16T05:00:00.000Z");
    expect(p.periodEnd.toISOString()).toBe("2026-11-23T05:00:00.000Z");
    expect(p.dueAt.toISOString()).toBe("2026-11-30T05:00:00.000Z");
  });
  it("handles DST (EDT) weeks", () => {
    const p = statementPeriod(new Date("2026-07-15T12:00:00Z")); // Wed
    expect(p.periodStart.toISOString()).toBe("2026-07-06T04:00:00.000Z");
    expect(p.periodEnd.toISOString()).toBe("2026-07-13T04:00:00.000Z");
  });
});
