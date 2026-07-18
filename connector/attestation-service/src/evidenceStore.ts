import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface StoredEvidence {
  hash: string;
  filePath: string;
}

/**
 * Computes the SHA-256 hash of the (base64-decoded) evidence artifact and
 * stores the raw bytes under `<evidenceStoreDir>/<hash>`, keyed by hash so
 * identical evidence is content-addressed and re-uploads are idempotent.
 */
export async function storeEvidence(evidenceStoreDir: string, base64Evidence: string): Promise<StoredEvidence> {
  const bytes = Buffer.from(base64Evidence, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  await mkdir(evidenceStoreDir, { recursive: true });
  const filePath = join(evidenceStoreDir, hash);
  await writeFile(filePath, bytes);
  return { hash, filePath };
}
