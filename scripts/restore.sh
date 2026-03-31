#!/usr/bin/env bash
# =============================================================================
#  Batutynas – MongoDB atsarginės kopijos atkūrimas
#  Naudojimas: bash scripts/restore.sh backups/backup_20260201_020000.gz
# =============================================================================
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Naudojimas: bash scripts/restore.sh <kopijos_failas.gz>"
  echo ""
  echo "Turimos kopijos:"
  ls -lh "$COMPOSE_DIR/backups/"*.gz 2>/dev/null || echo "  (kopijų nerasta)"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  # Try relative to COMPOSE_DIR
  FILE="$COMPOSE_DIR/$FILE"
fi

if [ ! -f "$FILE" ]; then
  echo "KLAIDA: failas nerastas: $FILE"
  exit 1
fi

echo "[$(date '+%F %T')] Atkuriama iš: $FILE"
echo "DĖMESIO: Esami duomenys bus pakeisti. Tęsti? (taip/ne)"
read -r CONFIRM
if [ "$CONFIRM" != "taip" ]; then
  echo "Atšaukta."
  exit 0
fi

cd "$COMPOSE_DIR"
docker compose exec -T mongo mongorestore \
  --db batutynas_db \
  --drop \
  --archive \
  --gzip < "$FILE"

echo "[$(date '+%F %T')] Atkūrimas sėkmingas."
