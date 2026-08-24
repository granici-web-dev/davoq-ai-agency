-- Воронка конфигуратора.
--
-- Суточные счётчики, а не журнал событий — по образцу `widget_loads`.
-- Журнал дал бы возможность считать что угодно задним числом, но он же
-- означал бы хранение следа каждого посетителя: кто на каком шаге ушёл.
-- Для вопроса «где отваливаются» это лишние персональные данные, а других
-- вопросов к этой таблице нет.
--
-- Идентификатора посетителя здесь нет вовсе, и это не упущение: воронка
-- отвечает «сколько», а не «кто».
BEGIN;

CREATE TABLE configurator_stats (
  tenant_id uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date      date    NOT NULL DEFAULT current_date,
  event     text    NOT NULL,
  -- Пусто у событий, не привязанных к шагу. Не NULL: он ломал бы первичный ключ.
  step_id   text    NOT NULL DEFAULT '',
  count     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date, event, step_id),
  CONSTRAINT stats_event CHECK (
    event IN ('open', 'step_view', 'step_select', 'price_shown', 'offer_created')
  )
);

/**
 * Событие «ушёл, не закончив» здесь отсутствует НАМЕРЕННО.
 *
 * Его пришлось бы слать маячком при выгрузке страницы, а маячок теряется:
 * закрытая крышка ноутбука, убитая вкладка, спящий телефон не шлют ничего.
 * Метрика, которая занижает сама себя на неизвестную величину, хуже
 * отсутствующей — по ней принимают решения, считая её верной.
 *
 * Уход считается формой воронки: сколько дошло до шага минус сколько дошло
 * до следующего. Это ровно то, что означает «отвалились», и для этого
 * маячок не нужен.
 */

ALTER TABLE configurator_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurator_stats FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON configurator_stats
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON configurator_stats TO assistwidget_app;

COMMIT;
