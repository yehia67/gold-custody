# Verification Report — Gold Custody

Date: 2026-07-18  
SDK: Daml 3.5.2 via DPM 1.0.21

## Gate results

| Gate | Result |
|------|--------|
| `dpm build` | PASS (warnings explained in DECISIONS.md; upgrade-interfaces / daml-script co-location silenced) |
| `dpm test` | PASS — **50/50** scripts |
| Hard-rule grep `TODO\|FIXME\|not implemented\|XXX\|HACK` in `daml/` | PASS — empty |
| Hard-rule grep placeholders in `daml/` for `undefined` | PASS — empty in Daml |
| TypeScript `undefined` | Documented in DECISIONS.md as optional-typing idiom (not stubs) |
| Magic-literal scan | Hits only in test fixtures (`TestEscrow` 3600s expiry, `TestCompliance` LimitCheck 100000) — documented |
| `npm test` (connectors) | PASS — 34 passed, 1 skipped (LocalNet); 35 with `LOCALNET=1` |
| `make demo` / `scripts/demo.sh` | PASS — genesisToRedemption + selfFreezingToken |
| README | Present with prereqs, setup, tests, demo, diagram |

## C1 — Config

| Script | Path |
|--------|------|
| `testConfigUpdateAndObserve` | positive — update + consumer observes new minPurity |
| `testConfigUnauthorizedUpdateFails` | negative — non-operator `submitMustFail` |

File: `daml/Scripts/TestConfig.daml`

## C2 — Vault

| Script | Path |
|--------|------|
| `testRegisterBarHappy` | positive |
| `testDuplicateSerialFails` | negative |
| `testSubThresholdPurityFails` | negative |
| `testNonCustodianCannotRegister` | negative auth |

File: `daml/Scripts/TestVault.daml`

## C3 — Operators

| Script | Path |
|--------|------|
| `testAppointAndAttestHappy` | positive |
| `testExpiredRoleFails` | negative |
| `testRevokedRoleFails` | negative |
| `testPermissionMismatchFails` | negative |
| `testNonOperatorCannotSubmit` | negative auth |

File: `daml/Scripts/TestOperators.daml`

## C4 — Attestations / Compliance

| Script | Path |
|--------|------|
| `testKYCPassAndFail` | KYC +/− |
| `testSanctionsPassAndFail` | Sanctions +/− |
| `testLimitPassAndFail` | Limit +/− |
| `testConfirmedWeightHappyAndMismatch` | dual-sig +/− |
| `testConfirmedWeightSameAttestorFails` | negative |
| `testChecksAreDataEscrow` | data-driven checks; Presence stale fails without Escrow.daml change |
| Movement / Discrepancy / E2E | Assay, Presence, MovementCheck, NoOpenDiscrepancy, ProofOfReserve via integration |

File: `daml/Scripts/TestCompliance.daml` (+ Movement/Discrepancy/E2E)

## C5 — Token

| Script | Path |
|--------|------|
| `testOverMintFails` | negative |
| `testCumulativeOverMintFails` | negative |
| `testMintWithoutFreshAssayFails` | negative |
| `testTransferGoldRoundTrip` | positive CIP-56 transfer path |
| `testBurnReducesIssuanceLedger` | positive |
| `testNonCustodianMintFails` | negative auth |

File: `daml/Scripts/TestToken.daml`

## C6 — Escrow

| Script | Path |
|--------|------|
| `testHappySettle` | positive |
| `testCheckFailureBlocksSettle` | negative |
| `testExpiryCancel` | positive cancel path |
| `testUnauthorizedSettleFails` | negative auth |
| `testFailedSettleLeavesHoldingsUnchanged` | partial-state impossibility |

File: `daml/Scripts/TestEscrow.daml`

## C7 — Movement

| Script | Path |
|--------|------|
| `testOutOfOrderFails` | negative |
| `testWrongRoleFails` | negative |
| `testMovementCheckBlocksThenUnblocksEscrow` | integration |

File: `daml/Scripts/TestMovement.daml`

## C8 — Discrepancy

| Script | Path |
|--------|------|
| `testCustodianCannotUnilaterallyResolve` | negative auth |
| `testWriteDownReducesHoldingsAndLedger` | positive |
| `testEscrowBlockedWhileDiscrepancyOpen` | integration |

File: `daml/Scripts/TestDiscrepancy.daml`

## C9 — Oracle

| Script | Path |
|--------|------|
| `testNormalPricePublish` | positive |
| `testDivergenceProposeAndConfirm` | divergence path |
| `testNonNavAgentCannotPublish` | negative auth |
| `testStaleNavRejectedByFundConsumerHelper` | stale consumer |

File: `daml/Scripts/TestOracle.daml`

## C10 — Fund

| Script | Path |
|--------|------|
| `testSubscribeRedeemHappy` | positive atomic |
| `testStaleNavBlocksRedemption` | negative |
| `testGateAcrossPassTime` | gate + period boundary |
| `testInKindRedemption` | in-kind path |
| `testFeeArithmetic` | fee to unit precision |
| `testBankersRound6Boundary` | half-even boundary |

File: `daml/Scripts/TestFund.daml`

## C11 — End-to-end

| Script | Scenario |
|--------|----------|
| `genesisToRedemption` | full lifecycle |
| `selfFreezingToken` | stale presence freezes / fresh unfreezes |
| `transitLockdown` | movement blocks settlement |
| `auditCrisis` | discrepancy → write-down → resume |
| `privacyAssertions` | per-party query visibility |

File: `daml/Scripts/TestEndToEnd.daml`

## C12 — Connectors

| Package | Coverage |
|---------|----------|
| `nav-publisher` | fixture + JSON sources; divergence refuse; LocalNet integration (skip unless LOCALNET=1) |
| `attestation-service` | schema / missing evidence / unknown operator / happy + co-sign |
| `iso20022-adapter` | XML build/parse; round-trip inbox→ledger→setr.012 |
| `shared` | config loader + MockLedgerClient |

Command: `cd connector && npm test` → 34 passed / 1 skipped.
