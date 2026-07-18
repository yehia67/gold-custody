#!/usr/bin/env bash
# Demo: run Daml Script E2E scenarios 1 and 2 (genesis + self-freezing)
# against the Daml Script interpreter (sandbox). Optionally starts LocalNet
# if DEMO_LOCALNET=1 and sibling cn-quickstart is present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:${HOME}/.dpm/bin:$PATH"

echo "=== Gold Custody Demo ==="
echo "SDK: $(dpm version --active 2>/dev/null || echo unknown)"
echo

echo "[1/4] Building DAR..."
dpm build

if [[ "${DEMO_LOCALNET:-0}" == "1" ]]; then
  QS="${ROOT}/../cn-quickstart/quickstart"
  if [[ -d "$QS" ]]; then
    echo "[2/4] Starting LocalNet (cn-quickstart)..."
    (cd "$QS" && make start) || echo "LocalNet start skipped/failed — continuing with Script runner"
  else
    echo "[2/4] cn-quickstart not found at $QS — skipping LocalNet"
  fi
else
  echo "[2/4] Skipping LocalNet (set DEMO_LOCALNET=1 to enable)"
fi

echo "[3/4] Running E2E scenario 1: genesisToRedemption..."
dpm test --test-pattern genesisToRedemption

echo "[4/4] Running E2E scenario 2: selfFreezingToken..."
dpm test --test-pattern selfFreezingToken

echo
echo "=== Settlement timeline (scenario coverage) ==="
echo "  t0  Bootstrap SystemConfig + parties + registries"
echo "  t1  Register bars, assay + weight attestations, mint GoldHolding"
echo "  t2  Fund setup + NAV publish + investor KYC"
echo "  t3  Subscription settles (cash -> fund units)"
echo "  t4  Secondary escrow transfer / redemption paths"
echo "  t5  (self-freezing) passTime beyond attestationMaxAge"
echo "  t6  Settlements fail on PresenceFreshnessCheck"
echo "  t7  Fresh presence attestation restores settlement"
echo
echo "Demo complete."
