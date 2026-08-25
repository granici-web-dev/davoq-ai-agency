#!/usr/bin/env bash
#
# Учебное восстановление: развернуть последнюю копию и убедиться, что в ней
# то, что должно быть.
#
#   ./scripts/restore-check.sh              # последняя копия
#   ./scripts/restore-check.sh backups/db-20260821-030000.dump
#
# Копия, которую ни разу не разворачивали, — это не копия, а надежда.
# Гонять раз в месяц; занимает минуту.
#
# Восстанавливается в ОТДЕЛЬНУЮ базу с именем restore_check_<время>, рабочая
# при этом не трогается вовсе. База удаляется в конце — и удаляется даже если
# проверка провалилась на середине.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env.prod | cut -d= -f2-)"
SCRATCH="restore_check_$(date -u +%H%M%S)"

# Имя файла, а не путь: каталог копий примонтирован в контейнер базы как
# /backups, и читает файл она сама.
DUMP="${1:-$(ls -t backups/db-*.dump 2>/dev/null | head -1)}"
if [[ -z "${DUMP:-}" || ! -f "$DUMP" ]]; then
  echo "не нашёл ни одной копии в backups/ — сначала ./scripts/backup.sh" >&2
  exit 1
fi
DUMP_NAME="$(basename "$DUMP")"

cleanup() {
  $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $SCRATCH" > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "── проверка восстановления: $DUMP ──"

$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $SCRATCH" > /dev/null
$COMPOSE exec -T db pg_restore -U "$POSTGRES_USER" -d "$SCRATCH" --no-owner "/backups/$DUMP_NAME" > /dev/null

# Пустая база восстанавливается без единой ошибки и выглядит успехом. Поэтому
# проверяем не «прошло без ошибок», а содержимое: клиенты, их материалы,
# переписки и заявки. Ноль клиентов или ноль фрагментов — негодная копия.
read -r tenants chunks convs leads docs <<< "$(
  $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$SCRATCH" -tA -F' ' -c "
    SELECT (SELECT count(*) FROM tenants),
           (SELECT count(*) FROM chunks),
           (SELECT count(*) FROM conversations),
           (SELECT count(*) FROM leads),
           (SELECT count(*) FROM documents)"
)"

printf 'клиентов %s · документов %s · фрагментов %s · переписок %s · заявок %s\n' \
  "$tenants" "$docs" "$chunks" "$convs" "$leads"

fail=0
[[ "$tenants" -gt 0 ]] || { echo "ПРОВАЛ: ни одного клиента" >&2; fail=1; }
[[ "$chunks"  -gt 0 ]] || { echo "ПРОВАЛ: ни одного фрагмента — база знаний пуста" >&2; fail=1; }

# Проверка, что восстановились не только данные, но и защита. Без FORCE RLS
# восстановленная база отдаёт всем всё — и заметить это по числу строк нельзя.
unprotected="$($COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$SCRATCH" -tA -c "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relrowsecurity AND NOT c.relforcerowsecurity")"
if [[ "$unprotected" -gt 0 ]]; then
  echo "ПРОВАЛ: в $unprotected таблицах RLS восстановился без FORCE" >&2
  fail=1
else
  echo "изоляция: FORCE ROW LEVEL SECURITY на месте"
fi

if [[ "$fail" -ne 0 ]]; then
  echo; echo "КОПИЯ НЕГОДНАЯ"; exit 1
fi

echo; echo "КОПИЯ ГОДНАЯ — восстанавливается и содержит данные"
