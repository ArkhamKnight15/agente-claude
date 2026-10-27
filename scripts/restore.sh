#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh. ATENÇÃO: substitui os dados do banco de destino.
# Uso: DATABASE_URL=... ./scripts/restore.sh backups/prospecta-AAAAMMDD-HHMMSS.dump
set -euo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL}"
FILE="${1:?Informe o arquivo .dump}"
URL="${DATABASE_URL%%\?*}"
SAFE_URL="$(echo "$URL" | sed -E 's#//[^@]+@#//***@#')"
echo "Restaurar $FILE em: $SAFE_URL — os dados atuais serão substituídos."
read -r -p "Digite RESTAURAR para continuar: " CONFIRM
[ "$CONFIRM" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$URL" "$FILE"
echo "Restauração concluída. Reinicie a aplicação e o worker."
