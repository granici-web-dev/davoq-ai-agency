-- Акции: скидка попадает в оферту только после решения человека.
--
-- Таблица, а не поле конфига, по двум причинам сразу. Первая: у акции есть
-- СОСТОЯНИЕ, и оно меняется без участия разработчика — клиент подтверждает
-- в панели, срок истекает сам. Вторая: скрейп заводит черновики, и им нужно
-- где-то лежать до решения.
BEGIN;

CREATE TABLE promotions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- `config` — акция заведена руками в конфиге, это уже решение человека.
  -- `scrape` — вычитана с сайта, решения ещё не было.
  source      text NOT NULL,
  state       text NOT NULL,

  label       jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope       text NOT NULL,
  model_ids   text[] NOT NULL DEFAULT '{}',
  -- {percent: 1800} — сотые доли процента, либо {bani: 50000}. Целые числа,
  -- как везде в деньгах: «18.5%» в jsonb — это тот же float в цене.
  discount    jsonb NOT NULL,
  valid_until date,

  /**
   * Отпечаток условий: scope + модели + скидка + срок.
   *
   * По нему повторный проход узнаёт ТУ ЖЕ акцию и не трогает её состояние.
   * Отклонённая не возвращается каждые шесть часов: подтверждение, которое
   * показывают снова и снова, перестают читать, а потом подтверждают не глядя.
   *
   * Название в отпечаток не входит намеренно: подтверждение относится
   * к условиям, а не к тому, как маркетолог назвал распродажу.
   */
  fingerprint text NOT NULL,
  source_url  text,

  decided_by  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT promo_state  CHECK (state  IN ('pending', 'active', 'rejected', 'expired')),
  CONSTRAINT promo_source CHECK (source IN ('config', 'scrape')),
  CONSTRAINT promo_scope  CHECK (scope  IN ('sitewide', 'models')),
  -- Выборочная акция без списка моделей применилась бы ко всему каталогу.
  CONSTRAINT promo_models CHECK (scope <> 'models' OR cardinality(model_ids) > 0)
);

CREATE UNIQUE INDEX promotions_fingerprint ON promotions (tenant_id, fingerprint);
CREATE INDEX ON promotions (tenant_id, state);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON promotions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON promotions TO assistwidget_app;

-- Письмо о новых черновиках — не чаще раза в сутки. Отметка нужна, чтобы
-- частый проход скрейпа не превращался в частые письма: клиент, которому
-- пишут шесть раз в день, заводит правило «в архив».
ALTER TABLE tenants ADD COLUMN promo_notified_at timestamptz;

COMMENT ON COLUMN tenants.promo_notified_at IS
  'Когда последний раз писали о новых черновиках акций. Не чаще раза в сутки.';

COMMIT;
