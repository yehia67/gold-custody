import { describe, expect, it } from "vitest";
import { CoSignConflictError, WeightCoSignTracker, type AttestationHalf } from "../src/coSign";

function half(overrides: Partial<AttestationHalf> = {}): AttestationHalf {
  return {
    role: "human",
    operatorId: "Weighmaster",
    evidenceHash: "hash-1",
    submittedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("WeightCoSignTracker", () => {
  it("returns undefined until both a human and device half arrive, then returns the pair", () => {
    const tracker = new WeightCoSignTracker({ ttlSeconds: 3600 });
    const humanHalf = half({ role: "human" });
    const deviceHalf = half({ role: "device", operatorId: "WeighDevice", evidenceHash: "hash-2" });

    const afterHuman = tracker.submit("BAR-1", humanHalf);
    expect(afterHuman).toBeUndefined();
    expect(tracker.pendingRoleFor("BAR-1")).toEqual(["human"]);

    const pair = tracker.submit("BAR-1", deviceHalf);
    expect(pair).toEqual({ human: humanHalf, device: deviceHalf });
    expect(tracker.pendingRoleFor("BAR-1")).toEqual([]);
    expect(tracker.pendingCount).toBe(0);
  });

  it("rejects a second half from the same role with a different evidenceHash", () => {
    const tracker = new WeightCoSignTracker({ ttlSeconds: 3600 });
    tracker.submit("BAR-1", half({ role: "human", evidenceHash: "hash-1" }));

    expect(() => tracker.submit("BAR-1", half({ role: "human", evidenceHash: "hash-2" }))).toThrow(
      CoSignConflictError,
    );
    // The original half is still pending (not overwritten by the rejected conflict).
    expect(tracker.pendingRoleFor("BAR-1")).toEqual(["human"]);
  });

  it("allows the same role to idempotently resubmit an identical evidenceHash", () => {
    const tracker = new WeightCoSignTracker({ ttlSeconds: 3600 });
    tracker.submit("BAR-1", half({ role: "human", evidenceHash: "hash-1" }));

    expect(() => tracker.submit("BAR-1", half({ role: "human", evidenceHash: "hash-1" }))).not.toThrow();
    expect(tracker.pendingRoleFor("BAR-1")).toEqual(["human"]);
  });

  it("evicts a pending half once it is older than the configured TTL", () => {
    let now = new Date("2026-07-18T10:00:00.000Z");
    const tracker = new WeightCoSignTracker({ ttlSeconds: 60, now: () => now });

    tracker.submit("BAR-1", half({ role: "human", submittedAt: now.toISOString() }));
    expect(tracker.pendingRoleFor("BAR-1")).toEqual(["human"]);

    // Advance the clock past the 60s TTL and trigger eviction via another submit call.
    now = new Date("2026-07-18T10:01:01.000Z");
    tracker.submit("BAR-2", half({ role: "human", submittedAt: now.toISOString() }));

    expect(tracker.pendingRoleFor("BAR-1")).toEqual([]);
    expect(tracker.pendingCount).toBe(1);
  });

  it("does not evict a pending half that is still within the TTL window", () => {
    let now = new Date("2026-07-18T10:00:00.000Z");
    const tracker = new WeightCoSignTracker({ ttlSeconds: 3600, now: () => now });

    tracker.submit("BAR-1", half({ role: "human", submittedAt: now.toISOString() }));

    now = new Date("2026-07-18T10:30:00.000Z");
    tracker.submit("BAR-2", half({ role: "human" }));

    expect(tracker.pendingRoleFor("BAR-1")).toEqual(["human"]);
  });

  it("allows a fresh half to be submitted for a barSerial whose prior half expired", () => {
    let now = new Date("2026-07-18T10:00:00.000Z");
    const tracker = new WeightCoSignTracker({ ttlSeconds: 60, now: () => now });

    tracker.submit("BAR-1", half({ role: "human", evidenceHash: "stale-hash", submittedAt: now.toISOString() }));

    now = new Date("2026-07-18T10:02:00.000Z");
    const pair = tracker.submit(
      "BAR-1",
      half({ role: "device", operatorId: "WeighDevice", evidenceHash: "fresh-hash", submittedAt: now.toISOString() }),
    );

    // The expired human half was evicted, so this device half is the only
    // pending half rather than completing a pair with the stale one.
    expect(pair).toBeUndefined();
    expect(tracker.pendingRoleFor("BAR-1")).toEqual(["device"]);
  });
});
