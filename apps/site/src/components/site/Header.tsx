'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Logo } from './Logo';
import { Link, usePathname } from '@/i18n/routing';
import { AGENTS, INDUSTRIES } from '@/lib/catalog';
import { DemoButton } from '@/components/ui/DemoButton';

/**
 * Шапка.
 *
 * Плавающая капсула, а не полоса во всю ширину: полоса режет экран пополам
 * и забирает у героя верхние сто пикселей, которые как раз и делают первое
 * впечатление.
 *
 * Выпадающие меню открываются наведением И фокусом. Только наведение
 * означало бы, что с клавиатуры каталог недоступен, а он — половина сайта.
 */
export function Header() {
  const t = useTranslations('nav');
  const tAgents = useTranslations('agents');
  const tIndustries = useTranslations('industries');
  const tStatus = useTranslations('status');
  const pathname = usePathname();

  const [open, setOpen] = useState<'agents' | 'industries' | null>(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Закрываем всё при переходе: меню, пережившее навигацию, висит поверх
  // новой страницы и выглядит зависшим.
  useEffect(() => { setOpen(null); setMobile(false); }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); setMobile(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const menus = {
    agents: {
      href: '/agents',
      label: t('agents'),
      all: t('allAgents'),
      items: AGENTS.map((a) => ({
        href: `/agents/${a.slug}`,
        name: tAgents(`${a.slug}.name`),
        short: tAgents(`${a.slug}.short`),
        badge: a.status === 'soon' ? tStatus('soon') : null,
      })),
    },
    industries: {
      href: '/industries',
      label: t('industries'),
      all: t('allIndustries'),
      items: INDUSTRIES.map((i) => ({
        href: `/industries/${i.slug}`,
        name: tIndustries(`${i.slug}.name`),
        short: tIndustries(`${i.slug}.short`),
        badge: null,
      })),
    },
  } as const;

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:pt-5">
      {/* Затемнение под шапкой. Капсула висит над страницей, и без него
          содержимое въезжает в верхнюю кромку экрана и режется пополам:
          видно нижнюю половину строки, которой сверху нет.

          Появляется только при прокрутке. На первом экране затемнять
          нечего — там уже стоит своё, под кадром героя. */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 -z-10 h-32 bg-linear-to-b from-ink-950 via-ink-950/80 to-transparent transition-opacity duration-300 ${
          scrolled ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-50 focus:rounded-full focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-sm"
      >
        {t('skipToContent')}
      </a>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="davoq"
          className="text-chalk transition-opacity hover:opacity-70"
        >
          <Logo className="h-[30px]" />
        </Link>

        {/* Капсула с пунктами. Фон уплотняется при прокрутке — до прокрутки
            она висит над героем и не должна его загораживать. */}
        <nav
          aria-label={t('agents')}
          className={`glass hidden items-center rounded-pill px-2 py-1.5 transition-colors duration-300 lg:flex ${
            scrolled ? 'glass-dense' : ''
          }`}
          onMouseLeave={() => setOpen(null)}
        >
          {(['agents', 'industries'] as const).map((key) => (
            <div key={key} className="relative" onMouseEnter={() => setOpen(key)}>
              <Link
                href={menus[key].href}
                className="flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm text-chalk-dim transition-colors hover:text-chalk"
                aria-expanded={open === key}
                onFocus={() => setOpen(key)}
              >
                {menus[key].label}
                <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden className={`transition-transform duration-200 ${open === key ? 'rotate-180' : ''}`}>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </Link>

              {open === key && (
                <div className="absolute left-1/2 top-full w-[min(34rem,86vw)] -translate-x-1/2 pt-3">
                  <div className="glass-panel overflow-hidden rounded-card p-3">
                    <ul className="grid gap-1">
                      {menus[key].items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="group flex flex-col gap-1.5 rounded-xl px-4 py-3.5 transition-colors hover:bg-white/6"
                          >
                            <span className="flex items-center gap-2.5 text-sm text-chalk">
                              {item.name}
                              {item.badge && (
                                <span className="rounded-pill border border-white/15 px-2.5 py-0.5 font-mono text-[10px] tracking-wider uppercase text-chalk-faint">
                                  {item.badge}
                                </span>
                              )}
                            </span>
                            <span className="text-xs leading-relaxed text-chalk-dim">{item.short}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={menus[key].href}
                      className="mt-2 block rounded-xl border-t border-white/8 px-4 pt-4 pb-2 font-mono text-[11px] tracking-wider uppercase text-chalk-dim transition-colors hover:text-chalk"
                    >
                      {menus[key].all} →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}

          {(['pricing', 'about', 'contact'] as const).map((key) => (
            <Link
              key={key}
              href={`/${key}`}
              className="rounded-pill px-4 py-2 text-sm text-chalk-dim transition-colors hover:text-chalk"
            >
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitch />
          {/* Прячем обёрткой, а не классом на самой кнопке: `hidden` из
              пропса конкурировал бы с `inline-flex` внутри компонента,
              и кто победит — решает порядок правил в собранном CSS,
              а не порядок слов в строке классов. */}
          <div className="hidden sm:block">
            <DemoButton size="sm">{t('cta')}</DemoButton>
          </div>
          <button
            type="button"
            aria-label={mobile ? t('closeMenu') : t('openMenu')}
            aria-expanded={mobile}
            onClick={() => setMobile((v) => !v)}
            className="glass flex size-10 items-center justify-center rounded-pill lg:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute inset-x-0 top-0 h-px bg-chalk transition-transform ${mobile ? 'translate-y-1.5 rotate-45' : ''}`} />
              <span className={`absolute inset-x-0 bottom-0 h-px bg-chalk transition-transform ${mobile ? '-translate-y-1 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      {mobile && (
        <div className="mx-auto mt-3 max-w-7xl lg:hidden">
          <div className="glass-panel max-h-[70vh] overflow-y-auto rounded-card p-5">
            {(['agents', 'industries'] as const).map((key) => (
              <div key={key} className="mb-5">
                <p className="eyebrow mb-2">{menus[key].label}</p>
                <ul className="grid gap-1">
                  {menus[key].items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-chalk-dim hover:bg-white/6 hover:text-chalk">
                        {item.name}
                        {item.badge && (
                          <span className="rounded-pill border border-white/12 px-2 py-0.5 font-mono text-[10px] uppercase text-chalk-faint">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="grid gap-1 border-t border-white/8 pt-4">
              {(['pricing', 'about', 'contact'] as const).map((key) => (
                <Link key={key} href={`/${key}`} className="rounded-lg px-3 py-2.5 text-sm text-chalk-dim hover:bg-white/6 hover:text-chalk">
                  {t(key)}
                </Link>
              ))}
            </div>
            <DemoButton className="mt-4 w-full">{t('cta')}</DemoButton>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * Переключатель языка.
 *
 * Держит текущий путь: человек, читающий страницу про мебель, при смене
 * языка должен получить её же по-английски, а не главную.
 */
function LocaleSwitch() {
  const pathname = usePathname();
  const active = useLocale();
  return (
    <div className="glass flex items-center rounded-pill p-0.5 font-mono text-[11px] uppercase">
      {(['ro', 'en'] as const).map((code) => (
        <Link
          key={code}
          href={pathname}
          locale={code}
          aria-current={code === active ? 'true' : undefined}
          /* Активный язык отмечен заливкой, а не только цветом текста:
             разница в оттенке серого на двух буквах не читается вовсе. */
          className={`rounded-pill px-2.5 py-1.5 tracking-wider transition-colors ${
            code === active
              ? 'bg-white/10 text-chalk'
              : 'text-chalk-faint hover:text-chalk'
          }`}
        >
          {code}
        </Link>
      ))}
    </div>
  );
}
