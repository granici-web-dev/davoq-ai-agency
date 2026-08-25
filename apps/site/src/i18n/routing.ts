import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * Языки сайта.
 *
 * Румынский — основной и без префикса в адресе: сайт продаёт в Румынии,
 * и `/preturi` должен читаться как адрес, а не как перевод. Английский
 * живёт под `/en` — это версия для тех, кто пришёл извне.
 */
export const routing = defineRouting({
  locales: ['ro', 'en'],
  defaultLocale: 'ro',
  // Префикс только у неосновного языка: `/en/pricing`, но `/pricing`.
  localePrefix: 'as-needed',
  /**
   * Язык НЕ определяется по браузеру.
   *
   * Автоопределение уводит с `/` на `/en` у всех, чей браузер по-английски, —
   * включая Googlebot, который ходит именно так. Румынская версия при этом
   * перестаёт быть той, которую индексируют, хотя продаём мы в Румынии.
   *
   * Корень всегда румынский, английский — осознанный выбор переключателем.
   */
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
