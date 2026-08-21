#!/usr/bin/env bash
#
# Резервная копия: база и файлы клиентов.
#
#   ./scripts/backup.sh                 # положить копию в ./backups
#   BACKUP_DIR=/mnt/x ./scripts/backup.sh
#
# Ставится в cron раз в сутки:
#   15 3 * * *  cd /opt/assistwidget && ./scripts/backup.sh >> backups/backup.log 2>&1
#
# Копируется два хранилища, и оба обязательны. В базе — материалы клиента,
# переписки, заявки и зашифрованные токены коннекторов. В var/uploads —
# сами загруженные файлы: без них переиндексация невозможна, а без базы
# файлы никому не принадлежат.
#
# Отдельно: SECRETS_KEY в копию НЕ попадает и попасть не должен. Копия базы
# рядом с ключом от неё — это одна украденная папка вместо двух. Ключ хранится
# там же, где остальные пароли установки, и без него зашифрованные токены
# в копии нечитаемы — так и задумано.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

# Пользователь базы читается из того же файла, что и у самого приложения:
# два места для одного значения однажды разойдутся.
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env.prod | cut -d= -f2-)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env.prod | cut -d= -f2- || echo assistwidget)"
POSTGRES_DB="${POSTGRES_DB:-assistwidget}"

echo "── копия $STAMP ──"

# Формат custom, а не текстовый: он сжат, восстанавливается выборочно
# и параллельно, и на нём работает pg_restore --list для проверки целостности.
# Файл пишется внутрь контейнера, в примонтированный ./backups: сам pg_dump,
# без перегонки через stdout докера. И проверяется там же — на сервере клиента
# никакого Postgres, кроме этого контейнера, нет, а значит нет и pg_restore.
DUMP="db-$STAMP.dump"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --file="/backups/$DUMP"
echo "база: $(du -h "$BACKUP_DIR/$DUMP" | cut -f1)"

# Проверка на месте, а не когда-нибудь. Дамп, который не читается, обнаруживают
# в тот единственный день, когда он нужен.
if ! $COMPOSE exec -T db pg_restore --list "/backups/$DUMP" > /dev/null 2>&1; then
  echo "ОШИБКА: дамп не читается pg_restore — копия негодная" >&2
  rm -f "$BACKUP_DIR/$DUMP"
  exit 1
fi
echo "база: оглавление читается"

FILES="$BACKUP_DIR/uploads-$STAMP.tar.gz"
$COMPOSE exec -T api tar -czf - -C /app/var uploads > "$FILES"
echo "файлы: $(du -h "$FILES" | cut -f1)"

# Старое удаляется ПОСЛЕ успешной новой копии, а не до: иначе неудачная ночь
# оставляет и без новой копии, и без старой.
#
# Дампы удаляются ИЗНУТРИ контейнера, а не с хоста. Их туда и записал процесс
# контейнера — на Linux это root, и файлы на хосте принадлежат root. Удаление
# с хоста молча не сработало бы, а место кончилось бы через месяц.
# Архив файлов создан перенаправлением на хосте, поэтому его чистит хост.
$COMPOSE exec -T db find /backups -name 'db-*.dump' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "готово. хранится копий: $(find "$BACKUP_DIR" -name 'db-*.dump' | wc -l | tr -d ' ')"
echo
echo "Копия на том же диске, что и база, спасает от испорченных данных,"
echo "но не от смерти диска. Отвезите $BACKUP_DIR куда-нибудь ещё."
