import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LedgerClient, SettlementEvent, SubscriptionRequestEvent, Unsubscribe } from "@gold-custody/shared";
import { buildSetr010, buildSetr012, parseSetr010 } from "./xml";

export interface Iso20022AdapterOptions {
  ledgerClient: LedgerClient;
  inboxDir: string;
  outboxDir: string;
  logger?: Pick<typeof console, "info" | "warn" | "error">;
}

/**
 * Bridges ledger subscription-lifecycle events to a minimal ISO 20022
 * setr.010/setr.012 file exchange:
 *  - SubscriptionRequest created on ledger -> setr.010 written to outbox.
 *  - setr.010 dropped in inbox -> ledger accept-subscription command submitted.
 *  - Subscription settles on ledger -> setr.012 written to outbox.
 */
export class Iso20022Adapter {
  private readonly ledgerClient: LedgerClient;
  private readonly inboxDir: string;
  private readonly outboxDir: string;
  private readonly logger: Pick<typeof console, "info" | "warn" | "error">;

  constructor(options: Iso20022AdapterOptions) {
    this.ledgerClient = options.ledgerClient;
    this.inboxDir = options.inboxDir;
    this.outboxDir = options.outboxDir;
    this.logger = options.logger ?? console;
  }

  /** Subscribes to ledger events; returns an unsubscribe function. */
  start(): Unsubscribe {
    const unsubscribeSubscriptionRequests = this.ledgerClient.onSubscriptionRequestCreated((event) => {
      this.emitSetr010(event).catch((err) => {
        this.logger.error(`Failed to emit setr.010 for ${event.contractId}: ${(err as Error).message}`);
      });
    });
    const unsubscribeSettlements = this.ledgerClient.onSettlement((event) => {
      this.emitSetr012(event).catch((err) => {
        this.logger.error(`Failed to emit setr.012 for ${event.contractId}: ${(err as Error).message}`);
      });
    });

    return () => {
      unsubscribeSubscriptionRequests();
      unsubscribeSettlements();
    };
  }

  /** Writes a setr.010 message describing a newly created SubscriptionRequest to the outbox. */
  async emitSetr010(event: SubscriptionRequestEvent): Promise<string> {
    await mkdir(this.outboxDir, { recursive: true });
    const xml = buildSetr010({
      messageId: `SUB-${event.contractId}`,
      createdAt: event.requestedAt,
      subscriptionRequestContractId: event.contractId,
      investorParty: event.investorParty,
      fundId: event.fundId,
      amount: event.amount,
      currency: event.currency,
    });
    const filePath = join(this.outboxDir, `setr010-${event.contractId}.xml`);
    await writeFile(filePath, xml, "utf8");
    this.logger.info(`Wrote setr.010 to ${filePath}`);
    return filePath;
  }

  /** Writes a setr.012 confirmation message describing a settlement to the outbox. */
  async emitSetr012(event: SettlementEvent): Promise<string> {
    await mkdir(this.outboxDir, { recursive: true });
    const xml = buildSetr012({
      messageId: `CONF-${event.contractId}`,
      createdAt: event.settledAt,
      subscriptionRequestContractId: event.subscriptionRequestContractId,
      settlementContractId: event.contractId,
      fundId: event.fundId,
      investorParty: event.investorParty,
      unitsIssued: event.unitsIssued,
    });
    const filePath = join(this.outboxDir, `setr012-${event.contractId}.xml`);
    await writeFile(filePath, xml, "utf8");
    this.logger.info(`Wrote setr.012 to ${filePath}`);
    return filePath;
  }

  /**
   * Scans the inbox for setr.010 files, submits the corresponding
   * accept-subscription ledger command for each, and moves processed files
   * into `<inboxDir>/processed` so they are not re-submitted on the next scan.
   */
  async processInboxOnce(): Promise<string[]> {
    await mkdir(this.inboxDir, { recursive: true });
    const processedDir = join(this.inboxDir, "processed");
    const entries = await readdir(this.inboxDir);
    const processed: string[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(".xml")) continue;
      const fullPath = join(this.inboxDir, entry);
      const info = await stat(fullPath);
      if (!info.isFile()) continue;

      const xml = await readFile(fullPath, "utf8");
      const message = parseSetr010(xml);
      await this.ledgerClient.submitAcceptSubscription({
        subscriptionRequestContractId: message.subscriptionRequestContractId,
        investorParty: message.investorParty,
        fundId: message.fundId,
        amount: message.amount,
        currency: message.currency,
      });

      await mkdir(processedDir, { recursive: true });
      await rename(fullPath, join(processedDir, entry));
      processed.push(entry);
      this.logger.info(`Processed inbound setr.010 ${entry} -> accept-subscription submitted`);
    }

    return processed;
  }
}
