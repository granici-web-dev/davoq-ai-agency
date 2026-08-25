/**
 * Язык панели.
 *
 * Ключ — сам румынский текст, а не выдуманный идентификатор вроде `save_button`.
 * Причина практическая: панель писалась по-румынски, строк под сотню, и перевод
 * их в абстрактные ключи — это сотня возможностей ошибиться молча. С текстом
 * в роли ключа непереведённая строка показывается по-румынски, а не ломается
 * и не превращается в `save_button` на экране у клиента.
 *
 * Обратная сторона известна: правка румынского текста рвёт связь с переводами.
 * Для панели на сотню строк это дешевле, чем альтернатива; если строк станет
 * втрое больше, менять схему придётся, и это будет отдельная работа.
 */
import { RO } from './i18n/ro.js';
import { RU } from './i18n/ru.js';
import { EN } from './i18n/en.js';

export const PANEL_LOCALES = ['ro', 'ru', 'en'] as const;
export type PanelLocale = (typeof PANEL_LOCALES)[number];

const DICTS: Record<PanelLocale, Record<string, string>> = { ro: RO, ru: RU, en: EN };

let current: PanelLocale = 'ro';

/**
 * Язык берётся из настроек тенанта. Если языка панели у нас нет — остаёмся
 * на румынском, а не показываем клиенту наполовину переведённый экран.
 */
export function setPanelLocale(locale: string | undefined): PanelLocale {
  const base = locale?.toLowerCase().split('-')[0];
  current = (PANEL_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as PanelLocale)
    : 'ro';
  document.documentElement.lang = current;
  return current;
}

export const panelLocale = (): PanelLocale => current;

/** Перевод. Отсутствие перевода — не ошибка: показываем исходный текст. */
export const t = (ro: string): string => DICTS[current][ro] ?? ro;

/**
 * Строка с подстановкой: `tf('Găsite {n} rezultate', { n: 12 })`.
 * Числа и имена файлов не переводятся, а вставляются — иначе перевод
 * распадается на куски, которые в другом языке не собираются обратно.
 */
export const tf = (ro: string, values: Record<string, string | number>): string =>
  t(ro).replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m));
