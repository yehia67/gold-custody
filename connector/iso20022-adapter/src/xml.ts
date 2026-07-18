import { XMLParser } from "fast-xml-parser";

/**
 * Minimal setr.010 (subscription order) and setr.012 (subscription order
 * confirmation) message shapes. See SCHEMA.md for the full field-by-field
 * documentation of this intentionally small subset.
 */

export const SETR_010_NAMESPACE = "urn:gold-custody:iso20022:setr.010.subset:1";
export const SETR_012_NAMESPACE = "urn:gold-custody:iso20022:setr.012.subset:1";

export interface Setr010Message {
  messageId: string;
  createdAt: string;
  subscriptionRequestContractId: string;
  investorParty: string;
  fundId: string;
  amount: string;
  currency: string;
}

export interface Setr012Message {
  messageId: string;
  createdAt: string;
  subscriptionRequestContractId: string;
  settlementContractId: string;
  fundId: string;
  investorParty: string;
  unitsIssued: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSetr010(message: Setr010Message): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Document xmlns="${SETR_010_NAMESPACE}">`,
    `  <SubscriptionBulkOrder>`,
    `    <MsgId>${escapeXml(message.messageId)}</MsgId>`,
    `    <CreDtTm>${escapeXml(message.createdAt)}</CreDtTm>`,
    `    <OrdrRef>`,
    `      <SubscriptionRequestId>${escapeXml(message.subscriptionRequestContractId)}</SubscriptionRequestId>`,
    `    </OrdrRef>`,
    `    <InvstmtAcctDtls>`,
    `      <InvestorParty>${escapeXml(message.investorParty)}</InvestorParty>`,
    `      <FinInstrmId>${escapeXml(message.fundId)}</FinInstrmId>`,
    `    </InvstmtAcctDtls>`,
    `    <OrdrDtls>`,
    `      <Amt Ccy="${escapeXml(message.currency)}">${escapeXml(message.amount)}</Amt>`,
    `    </OrdrDtls>`,
    `  </SubscriptionBulkOrder>`,
    `</Document>`,
    "",
  ].join("\n");
}

export function buildSetr012(message: Setr012Message): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Document xmlns="${SETR_012_NAMESPACE}">`,
    `  <SubscriptionOrderConfirmation>`,
    `    <MsgId>${escapeXml(message.messageId)}</MsgId>`,
    `    <CreDtTm>${escapeXml(message.createdAt)}</CreDtTm>`,
    `    <RltdRef>`,
    `      <SubscriptionRequestId>${escapeXml(message.subscriptionRequestContractId)}</SubscriptionRequestId>`,
    `      <SettlementId>${escapeXml(message.settlementContractId)}</SettlementId>`,
    `    </RltdRef>`,
    `    <ConfDtls>`,
    `      <FinInstrmId>${escapeXml(message.fundId)}</FinInstrmId>`,
    `      <InvestorParty>${escapeXml(message.investorParty)}</InvestorParty>`,
    `      <UnitsIssued>${escapeXml(message.unitsIssued)}</UnitsIssued>`,
    `    </ConfDtls>`,
    `  </SubscriptionOrderConfirmation>`,
    `</Document>`,
    "",
  ].join("\n");
}

// parseTagValue/parseAttributeValue disabled so decimal strings like "10000.00"
// round-trip exactly instead of being coerced into (possibly precision-losing) numbers.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
});

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  throw new Error(`setr message is missing required field "${field}"`);
}

export function parseSetr010(xml: string): Setr010Message {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = doc.Document as Record<string, unknown> | undefined;
  const order = root?.SubscriptionBulkOrder as Record<string, unknown> | undefined;
  if (!order) {
    throw new Error('setr.010 document is missing the "SubscriptionBulkOrder" element');
  }
  const acct = order.InvstmtAcctDtls as Record<string, unknown> | undefined;
  const ordrDtls = order.OrdrDtls as Record<string, unknown> | undefined;
  const ordrRef = order.OrdrRef as Record<string, unknown> | undefined;
  const amt = ordrDtls?.Amt as Record<string, unknown> | undefined;

  return {
    messageId: requireString(order.MsgId, "MsgId"),
    createdAt: requireString(order.CreDtTm, "CreDtTm"),
    subscriptionRequestContractId: requireString(ordrRef?.SubscriptionRequestId, "OrdrRef/SubscriptionRequestId"),
    investorParty: requireString(acct?.InvestorParty, "InvstmtAcctDtls/InvestorParty"),
    fundId: requireString(acct?.FinInstrmId, "InvstmtAcctDtls/FinInstrmId"),
    amount: requireString(amt?.["#text"], "OrdrDtls/Amt"),
    currency: requireString(amt?.["@_Ccy"], "OrdrDtls/Amt/@Ccy"),
  };
}

export function parseSetr012(xml: string): Setr012Message {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = doc.Document as Record<string, unknown> | undefined;
  const confirmation = root?.SubscriptionOrderConfirmation as Record<string, unknown> | undefined;
  if (!confirmation) {
    throw new Error('setr.012 document is missing the "SubscriptionOrderConfirmation" element');
  }
  const rltdRef = confirmation.RltdRef as Record<string, unknown> | undefined;
  const confDtls = confirmation.ConfDtls as Record<string, unknown> | undefined;

  return {
    messageId: requireString(confirmation.MsgId, "MsgId"),
    createdAt: requireString(confirmation.CreDtTm, "CreDtTm"),
    subscriptionRequestContractId: requireString(rltdRef?.SubscriptionRequestId, "RltdRef/SubscriptionRequestId"),
    settlementContractId: requireString(rltdRef?.SettlementId, "RltdRef/SettlementId"),
    fundId: requireString(confDtls?.FinInstrmId, "ConfDtls/FinInstrmId"),
    investorParty: requireString(confDtls?.InvestorParty, "ConfDtls/InvestorParty"),
    unitsIssued: requireString(confDtls?.UnitsIssued, "ConfDtls/UnitsIssued"),
  };
}
