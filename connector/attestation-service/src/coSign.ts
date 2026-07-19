export type AttestationSignerRole = "human" | "device";

export interface AttestationHalf {
  role: AttestationSignerRole;
  operatorId: string;
  evidenceHash: string;
  deviceId?: string;
  submittedAt: string;
}

export interface CoSignedPair {
  human: AttestationHalf;
  device: AttestationHalf;
}

/** Thrown when a role resubmits a half for a still-pending barSerial with a different evidenceHash than its existing half. */
export class CoSignConflictError extends Error {
  constructor(barSerial: string, role: AttestationSignerRole) {
    super(
      `Conflicting ${role} evidence for barSerial "${barSerial}": a different evidenceHash is already ` +
        `pending co-signature (rejecting to avoid silently overwriting evidence).`,
    );
    this.name = "CoSignConflictError";
  }
}

export interface WeightCoSignTrackerOptions {
  /** How long a lone half is retained awaiting its co-signature before being evicted (config.connectors.attestationService.weightCosignTtlSeconds). */
  ttlSeconds: number;
  /** Injectable clock for tests; defaults to the wall clock. */
  now?: () => Date;
}

/**
 * Weight attestations require both a human (weighmaster) and a device
 * (weighDevice) signature before they are submitted to the ledger. Tracks
 * whichever half arrives first per barSerial, and returns the completed
 * pair once both halves are present (consuming/removing the pending entry).
 *
 * Pending halves are TTL-bounded (evicted on every `submit()` call) so a
 * lone half that never receives its co-signature does not linger in memory
 * forever, and a role resubmitting a *different* evidenceHash while a half
 * is still pending is rejected as a conflict rather than silently
 * overwriting the earlier evidence.
 */
export class WeightCoSignTracker {
  private readonly pendingByBarSerial = new Map<string, Partial<CoSignedPair>>();
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(options: WeightCoSignTrackerOptions) {
    this.ttlMs = options.ttlSeconds * 1000;
    this.now = options.now ?? (() => new Date());
  }

  submit(barSerial: string, half: AttestationHalf): CoSignedPair | undefined {
    this.evictExpired();

    const pending = this.pendingByBarSerial.get(barSerial) ?? {};
    const existing = pending[half.role];
    if (existing && existing.evidenceHash !== half.evidenceHash) {
      throw new CoSignConflictError(barSerial, half.role);
    }
    pending[half.role] = half;

    if (pending.human && pending.device) {
      this.pendingByBarSerial.delete(barSerial);
      return { human: pending.human, device: pending.device };
    }

    this.pendingByBarSerial.set(barSerial, pending);
    return undefined;
  }

  pendingRoleFor(barSerial: string): AttestationSignerRole[] {
    const pending = this.pendingByBarSerial.get(barSerial);
    if (!pending) return [];
    const roles: AttestationSignerRole[] = [];
    if (pending.human) roles.push("human");
    if (pending.device) roles.push("device");
    return roles;
  }

  /** Number of barSerials currently awaiting a co-signature; exposed for tests. */
  get pendingCount(): number {
    return this.pendingByBarSerial.size;
  }

  private evictExpired(): void {
    const cutoffMs = this.now().getTime() - this.ttlMs;
    for (const [barSerial, pending] of this.pendingByBarSerial) {
      const halves = [pending.human, pending.device].filter((h): h is AttestationHalf => h !== undefined);
      const isExpired = halves.some((half) => new Date(half.submittedAt).getTime() <= cutoffMs);
      if (isExpired) {
        this.pendingByBarSerial.delete(barSerial);
      }
    }
  }
}
