#!/usr/bin/env bash
# =============================================================================
#  Batutynas – MongoDB atsarginė kopija
#  Paleidimas rankiniu būdu: bash scripts/backup.sh
#  Automatinis paleidimas (cron): žiūrėkite README.md → "Atsarginės kopijos"
# =============================================================================
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$COMPOSE_DIR/backups"
DATE="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/backup_$DATE.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] Pradedama atsarginė kopija..."

cd "$COMPOSE_DIR"
docker compose exec -T mongo mongodump \
  --db batutynas_db \
  --archive \
  --gzip > "$FILE"

SIZE="$(du -sh "$FILE" 2>/dev/null | cut -f1)"
echo "[$(date '+%F %T')] Sukurta: $FILE ($SIZE)"

# Palikti tik paskutines 30 kopijų
DELETED=$(ls -t "$BACKUP_DIR"/backup_*.gz 2>/dev/null | tail -n +31 | wc -l)
ls -t "$BACKUP_DIR"/backup_*.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
[ "$DELETED" -gt 0 ] && echo "[$(date '+%F %T')] Ištrinta senų kopijų: $DELETED"

echo "[$(date '+%F %T')] Kopija sėkminga."
