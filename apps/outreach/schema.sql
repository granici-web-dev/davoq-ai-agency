-- Схема outreach: холодные письма.
--
-- Отдельная схема в ОБЩЕМ инстансе Postgres. Отдельная — потому что это
-- отдельный продукт со своим жизненным циклом; общий инстанс — потому что
-- заводить второй ради одного сервиса значит завести вторые резервные копии,
-- второе наблюдение и второй счёт.
--
-- ── Что здесь закреплено на уровне базы ──
--
-- Правила, нарушение которых стоит дороже всего, стоят ограничениями, а не
-- проверками в коде. Код можно обойти новым вызовом, ограничение — нет.
--
--   * недействительный адрес не может оказаться в очереди на отправку;
--   * отправка не может ссылаться на неутверждённый вариант письма;
--   * один адрес не может попасть в suppression дважды.
--
-- Остальное — статусы, веса, метрики — проверяется кодом и тестами: это
-- правила процесса, а не инварианты данных.
BEGIN;

CREATE SCHEMA IF NOT EXISTS outreach;
SET search_path TO outreach, public;

-- ── Кампании ────────────────────────────────────────────────────────────────

-- lead_gen — ищем клиентов себе. partner_recruiting — вербуем партнёров
-- клиенту. Инфраструктура отправки одна, отличаются источники, шаблоны и цель
-- цепочки: у первой это демо, у второй — назначенная встреча.
CREATE TYPE campaign_type AS ENUM ('lead_gen', 'partner_recruiting');

-- DRAFT → APPROVED — единственный переход, после которого что-то уходит
-- наружу. PAUSED и STOPPED действуют немедленно и различаются возвратом:
-- с паузы можно вернуться, со STOPPED — нет.
CREATE TYPE campaign_status AS ENUM ('DRAFT', 'APPROVED', 'PAUSED', 'STOPPED', 'DONE');

CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text            NOT NULL,
  type          campaign_type   NOT NULL,
  status        campaign_status NOT NULL DEFAULT 'DRAFT',

  -- Всё, что отличает одну кампанию от другой: сегмент, источники, язык,
  -- потолок отправок, условия партнёрской программы, адрес CRM-вебхука.
  -- Составом занимается README; здесь jsonb, потому что набор полей у двух
  -- режимов разный, а таблица одна.
  config        jsonb           NOT NULL DEFAULT '{}'::jsonb,

  -- Утверждение: кто и когда. Нажимается ОДИН раз на кампанию, и без него
  -- не уходит ни одно письмо. Поле, а не флаг: «кто утвердил» — это первый
  -- вопрос, который задают, когда письмо ушло не туда.
  approved_at   timestamptz,
  approved_by   text,

  created_at    timestamptz     NOT NULL DEFAULT now(),
  updated_at    timestamptz     NOT NULL DEFAULT now(),

  -- Утверждённая кампания обязана помнить, кем. Без этого «утверждено»
  -- становится состоянием, которое можно поставить запросом и не оставить следа.
  CONSTRAINT approved_has_author
    CHECK (status = 'DRAFT' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);

-- ── Получатели ──────────────────────────────────────────────────────────────

CREATE TYPE email_status AS ENUM ('unknown', 'valid', 'risky', 'invalid');

-- Статусная модель из задания. SUPPRESSED — конечное состояние: адрес больше
-- не участвует ни в одной кампании, а не только в этой.
CREATE TYPE prospect_status AS ENUM (
  'FOUND', 'ENRICHED', 'VERIFIED', 'QUEUED', 'CONTACTED',
  'REPLIED_INTERESTED', 'REPLIED_NO', 'MEETING_REQUESTED', 'AGREED', 'SUPPRESSED'
);

CREATE TYPE segment_level AS ENUM ('premium', 'mid', 'econom');

CREATE TABLE prospects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid            NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  company        text            NOT NULL,
  website        text,
  city           text,
  language       text,

  contact_name   text,
  contact_role   text,
  email          text,
  email_status   email_status    NOT NULL DEFAULT 'unknown',
  email_checked_at timestamptz,

  -- 2–4 конкретных факта о компании: сырьё для зацепки в первом абзаце.
  -- Массивом строк в jsonb, а не текстом: письмо ссылается на ОДИН факт,
  -- и выбирать его из абзаца пришлось бы разбором.
  evidence       jsonb           NOT NULL DEFAULT '[]'::jsonb,

  -- Признак для lead_gen: виджета на сайте нет — значит есть о чём писать.
  has_chat_widget boolean,

  -- Поля partner_recruiting. NULL у lead_gen — это не пустота, а другой режим.
  portfolio_url    text,
  notable_projects jsonb         NOT NULL DEFAULT '[]'::jsonb,
  segment_level    segment_level,

  -- Откуда взялся. Уезжает в письмо строкой «v-am găsit pe …»: человек вправе
  -- знать, откуда у нас его адрес, и это дешевле любого объяснения потом.
  source         text            NOT NULL,

  status         prospect_status NOT NULL DEFAULT 'FOUND',
  created_at     timestamptz     NOT NULL DEFAULT now(),
  updated_at     timestamptz     NOT NULL DEFAULT now(),

  -- Недействительный адрес не может дойти до отправки. Ограничением, а не
  -- проверкой в коде: проверку обходит любой новый путь к постановке в
  -- очередь, ограничение — ни один.
  CONSTRAINT invalid_email_never_sendable CHECK (
    status IN ('FOUND', 'ENRICHED', 'VERIFIED', 'SUPPRESSED')
    OR email_status IN ('valid', 'risky')
  ),
  -- Дальше VERIFIED без адреса идти некуда.
  CONSTRAINT sendable_has_email CHECK (
    status IN ('FOUND', 'ENRICHED', 'SUPPRESSED') OR email IS NOT NULL
  )
);

CREATE INDEX prospects_campaign_status_idx ON prospects (campaign_id, status);
-- Один и тот же человек не заводится в кампанию дважды.
CREATE UNIQUE INDEX prospects_campaign_email_idx
  ON prospects (campaign_id, lower(email)) WHERE email IS NOT NULL;

-- ── Варианты писем ──────────────────────────────────────────────────────────

CREATE TYPE variant_kind AS ENUM ('first', 'followup_1', 'followup_2');
CREATE TYPE variant_status AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

CREATE TABLE email_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid           NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind         variant_kind   NOT NULL,

  -- Угол захода: чем это письмо отличается от трёх соседних. Нужен человеку
  -- при утверждении и оптимизатору в отчёте.
  angle        text           NOT NULL,
  subject      text           NOT NULL,
  body         text           NOT NULL,

  -- Вес многорукого бандита. Варианты не отключаются, а взвешиваются: при
  -- малых объёмах разница между ними чаще шум, чем сигнал.
  weight       numeric(6,4)   NOT NULL DEFAULT 1.0 CHECK (weight >= 0),

  status       variant_status NOT NULL DEFAULT 'DRAFT',
  approved_at  timestamptz,
  created_at   timestamptz    NOT NULL DEFAULT now(),

  -- Новые варианты от оптимизатора приходят DRAFT и ждут утверждения:
  -- автозамены нет.
  CONSTRAINT approved_variant_has_date
    CHECK (status <> 'APPROVED' OR approved_at IS NOT NULL)
);

CREATE INDEX email_variants_campaign_idx ON email_variants (campaign_id, kind, status);

-- ── Ящики ───────────────────────────────────────────────────────────────────

CREATE TABLE mailboxes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address             text        NOT NULL UNIQUE,
  domain              text        NOT NULL,
  -- Потолок в день. Дефолт из конфига; здесь — фактическое значение ящика.
  daily_limit         integer     NOT NULL DEFAULT 15 CHECK (daily_limit > 0),
  provider_account_id text,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Отправки ────────────────────────────────────────────────────────────────

-- Полный аудит: кому, по какой кампании, каким вариантом, из какого ящика,
-- когда. Без него вопрос «почему этот человек получил письмо» остаётся без
-- ответа, а он задаётся ровно тогда, когда ответ нужен немедленно.
CREATE TABLE sends (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  prospect_id         uuid        NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  variant_id          uuid        NOT NULL REFERENCES email_variants(id),
  mailbox_id          uuid        NOT NULL REFERENCES mailboxes(id),

  provider_message_id text,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  delivered_at        timestamptz,
  bounced_at          timestamptz,
  bounce_reason       text,
  opted_out_at        timestamptz
);

CREATE INDEX sends_prospect_idx  ON sends (prospect_id, sent_at DESC);
CREATE INDEX sends_campaign_idx  ON sends (campaign_id, sent_at DESC);
CREATE INDEX sends_variant_idx   ON sends (variant_id);
-- Потолок «писем на ящик в день» считается этим индексом.
CREATE INDEX sends_mailbox_day_idx ON sends (mailbox_id, sent_at);
-- Повтор вебхука не должен заводить вторую отправку.
CREATE UNIQUE INDEX sends_provider_message_idx
  ON sends (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ── Ответы ──────────────────────────────────────────────────────────────────

CREATE TYPE reply_class AS ENUM ('INTERESTED', 'NOT_NOW', 'NO', 'ANGRY', 'AUTO_REPLY');

CREATE TABLE replies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id        uuid        REFERENCES sends(id) ON DELETE SET NULL,
  prospect_id    uuid        NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,

  received_at    timestamptz NOT NULL DEFAULT now(),
  -- Текст ответа нужен классификатору и разбору возражений. Больше о человеке
  -- здесь не хранится ничего: имя и компания уже есть в prospects.
  body           text        NOT NULL,
  classification reply_class,
  classified_at  timestamptz,

  -- Черновик ответа. Черновик, а не отправка: со слотами встречи и от нашего
  -- имени письмо уходит только после того, как его прочитал человек.
  draft_reply    text,
  notified_at    timestamptz,

  -- Напоминание по NOT_NOW. Тоже черновиком, не автоотправкой.
  remind_at      timestamptz
);

CREATE INDEX replies_prospect_idx ON replies (prospect_id, received_at DESC);
CREATE INDEX replies_pending_idx  ON replies (classification, notified_at)
  WHERE notified_at IS NULL;

-- ── Suppression ─────────────────────────────────────────────────────────────

CREATE TYPE suppression_reason AS ENUM (
  'unsubscribed', 'replied_no', 'angry', 'customer', 'manual'
);

-- Общий на все кампании. Отписка от одной кампании — это отписка, а не
-- отписка от одной кампании.
CREATE TABLE suppressions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Адрес ИЛИ домен: домены действующих клиентов Davoq вносятся целиком.
  email       text,
  domain      text,
  reason      suppression_reason NOT NULL,
  note        text,
  added_at    timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT email_or_domain CHECK (num_nonnulls(email, domain) = 1)
);

CREATE UNIQUE INDEX suppressions_email_idx  ON suppressions (lower(email))  WHERE email  IS NOT NULL;
CREATE UNIQUE INDEX suppressions_domain_idx ON suppressions (lower(domain)) WHERE domain IS NOT NULL;

-- ── Оптимизатор ─────────────────────────────────────────────────────────────

CREATE TABLE optimizer_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  -- Отчёт целиком, как его прочитал человек. Пересчитывать его задним числом
  -- нельзя: цифры менялись, а решение принималось по этим.
  report_md   text        NOT NULL,
  -- Что применилось: новые веса. Предложенные варианты применяются отдельно,
  -- через утверждение.
  applied     jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX optimizer_runs_campaign_idx ON optimizer_runs (campaign_id, ran_at DESC);

-- ── Глобальная пауза ────────────────────────────────────────────────────────

-- Одна строка. Кнопка в шапке кабинета останавливает ВСЁ немедленно, и
-- проверяется этот флаг перед каждой отправкой — как и suppression.
CREATE TABLE system_state (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused        boolean     NOT NULL DEFAULT false,
  paused_at     timestamptz,
  paused_by     text,
  paused_reason text
);

INSERT INTO system_state (id) VALUES (true) ON CONFLICT DO NOTHING;

COMMIT;
