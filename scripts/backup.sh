#!/usr/bin/env bash
# Backup do PostgreSQL com rotação. Uso: DATABASE_URL=... ./scripts/backup.sh [diretório] [dias de retenção]
# Agende no cron, ex.: 15 3 * * * cd /app && ./scripts/backup.sh /backups 14 >> /var/log/prospecta-backup.log 2>&1
set -euo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL}"
DIR="${1:-./backups}"
KEEP_DAYS="${2:-14}"
mkdir -p "$DIR"
FILE="$DIR/prospecta-$(date +%Y%m%d-%H%M%S).dump"
URL="${DATABASE_URL%%\?*}" # pg_dump não aceita o parâmetro ?schema=
pg_dump --format=custom --no-owner --file="$FILE" "$URL"
pg_restore --list "$FILE" > /dev/null # valida que o arquivo é legível
echo "Backup criado: $FILE ($(du -h "$FILE" | cut -f1))"
find "$DIR" -name 'prospecta-*.dump' -mtime +"$KEEP_DAYS" -print -delete
