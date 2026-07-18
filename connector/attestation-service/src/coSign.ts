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

/**
 * Weight attestations require both a human (weighmaster) and a device
 * (weighDevice) signature before they are submitted to the ledger. Tracks
 * whichever half arrives first per barSerial, and returns the completed
 * pair once both halves are present (consuming/removing the pending entry).
 */
export class WeightCoSignTracker {
  private readonly pendingByBarSerial = new Map<string, Partial<CoSignedPair>>();

  submit(barSerial: string, half: AttestationHalf): CoSignedPair | undefined {
    const pending = this.pendingByBarSerial.get(barSerial) ?? {};
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
}
