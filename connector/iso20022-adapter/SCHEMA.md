# iso20022-adapter message schema

This adapter exchanges two hand-rolled, intentionally minimal message
shapes inspired by the ISO 20022 **setr.010** (subscription order) and
**setr.012** (subscription order confirmation) message families. They are
**not** full ISO 20022 conformant documents — real setr.010.001.xx /
setr.012.001.xx schemas carry dozens of optional blocks (multi-leg orders,
intermediary parties, settlement instructions, regulatory reporting, etc.)
that this prototype has no use for. Instead, each message implements only
the field subset the gold-custody LocalNet prototype actually produces and
consumes, under a project-local XML namespace (`urn:gold-custody:iso20022:*`)
so it is never mistaken for a real ISO 20022 payload.

Minimal XSDs for both subsets are bundled alongside this document:
[`xsd/setr.010.subset.xsd`](./xsd/setr.010.subset.xsd) and
[`xsd/setr.012.subset.xsd`](./xsd/setr.012.subset.xsd).

## setr.010 subset — Subscription order (outbound + inbound)

Emitted to `outbox/` whenever a `SubscriptionRequest` contract is created on
the ledger, and accepted from `inbox/` as an inbound order to submit as a
ledger command.

Namespace: `urn:gold-custody:iso20022:setr.010.subset:1`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:gold-custody:iso20022:setr.010.subset:1">
  <SubscriptionBulkOrder>
    <MsgId>SUB-<contractId></MsgId>
    <CreDtTm><ISO-8601 timestamp></CreDtTm>
    <OrdrRef>
      <SubscriptionRequestId><ledger contract id></SubscriptionRequestId>
    </OrdrRef>
    <InvstmtAcctDtls>
      <InvestorParty><investor party id></InvestorParty>
      <FinInstrmId><fund id></FinInstrmId>
    </InvstmtAcctDtls>
    <OrdrDtls>
      <Amt Ccy="<ISO 4217 currency code>"><decimal amount></Amt>
    </OrdrDtls>
  </SubscriptionBulkOrder>
</Document>
```

| Field | Path | Type | Description |
| --- | --- | --- | --- |
| Message id | `SubscriptionBulkOrder/MsgId` | string | `SUB-<contractId>`; unique per message. |
| Creation time | `SubscriptionBulkOrder/CreDtTm` | ISO-8601 datetime | When the SubscriptionRequest was created (outbound) or when the order was raised (inbound). |
| Subscription request id | `SubscriptionBulkOrder/OrdrRef/SubscriptionRequestId` | string | The `SubscriptionRequest` ledger contract id this order corresponds to (outbound: the freshly created contract; inbound: the contract the counterparty is referencing). |
| Investor party | `SubscriptionBulkOrder/InvstmtAcctDtls/InvestorParty` | string (party id) | The investor submitting the subscription (`config.parties.investor1`/`investor2`, etc.). |
| Fund id | `SubscriptionBulkOrder/InvstmtAcctDtls/FinInstrmId` | string | Identifies the target fund/share class. |
| Amount | `SubscriptionBulkOrder/OrdrDtls/Amt` (text) | decimal string | Subscription amount, in `Ccy` currency. |
| Currency | `SubscriptionBulkOrder/OrdrDtls/Amt/@Ccy` | ISO 4217 code | Currency of `Amt`. |

Not implemented (deliberately out of scope): multi-tranche orders, fee
schedules, intermediary/omnibus account chains, cancellation/amendment
indicators, and regulatory/tax reporting blocks present in the full ISO
20022 setr.010 message.

## setr.012 subset — Subscription order confirmation (outbound)

Emitted to `outbox/` whenever a subscription settles on the ledger.

Namespace: `urn:gold-custody:iso20022:setr.012.subset:1`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:gold-custody:iso20022:setr.012.subset:1">
  <SubscriptionOrderConfirmation>
    <MsgId>CONF-<contractId></MsgId>
    <CreDtTm><ISO-8601 timestamp></CreDtTm>
    <RltdRef>
      <SubscriptionRequestId><originating SubscriptionRequest contract id></SubscriptionRequestId>
      <SettlementId><settlement contract id></SettlementId>
    </RltdRef>
    <ConfDtls>
      <FinInstrmId><fund id></FinInstrmId>
      <InvestorParty><investor party id></InvestorParty>
      <UnitsIssued><decimal units></UnitsIssued>
    </ConfDtls>
  </SubscriptionOrderConfirmation>
</Document>
```

| Field | Path | Type | Description |
| --- | --- | --- | --- |
| Message id | `SubscriptionOrderConfirmation/MsgId` | string | `CONF-<settlementContractId>`. |
| Creation time | `SubscriptionOrderConfirmation/CreDtTm` | ISO-8601 datetime | When the settlement occurred on the ledger. |
| Subscription request id | `SubscriptionOrderConfirmation/RltdRef/SubscriptionRequestId` | string | Links back to the setr.010 order this confirms. |
| Settlement id | `SubscriptionOrderConfirmation/RltdRef/SettlementId` | string | The settlement ledger contract id. |
| Fund id | `SubscriptionOrderConfirmation/ConfDtls/FinInstrmId` | string | Fund/share class settled into. |
| Investor party | `SubscriptionOrderConfirmation/ConfDtls/InvestorParty` | string (party id) | The investor the units were issued to. |
| Units issued | `SubscriptionOrderConfirmation/ConfDtls/UnitsIssued` | decimal string | Fund units issued at settlement. |

Not implemented (deliberately out of scope): partial-fill confirmations,
NAV-per-unit breakdowns, fee/charge breakdowns, and statement-of-holding
attachments present in the full ISO 20022 setr.012 message.

## File exchange contract

- **Outbound** (`outbox/`): filenames `setr010-<contractId>.xml` and
  `setr012-<contractId>.xml`, one message per file, written atomically via a
  single `writeFile` call.
- **Inbound** (`inbox/`): any `*.xml` file is treated as a setr.010 order.
  After a successful ledger submission the file is moved to
  `inbox/processed/` so it is never re-submitted.
- Directory locations come from `config.connectors.iso20022.{inboxDir,outboxDir}`
  (see `config/localnet.yaml`) — never hardcoded in the adapter itself.
