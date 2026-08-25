import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AGENTS, INDUSTRIES } from '@/lib/catalog';
import { Logo } from './Logo';

/**
 * Подвал.
 *
 * Полный каталог ссылками — это и навигация для человека, дочитавшего
 * страницу, и внутренняя перелинковка для поиска. Страница индустрии,
 * на которую нет ссылки ниоткуда, кроме выпадающего меню, для поисковика
 * почти не существует.
 */
export function Footer() {
  const t = useTranslations('footer');
  const tNav = useTranslations('nav');
  const tAgents = useTranslations('agents');
  const tIndustries = useTranslations('industries');
  const tBrand = useTranslations('brand');

  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t border-white/8">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Logo className="h-5 text-chalk" />
            <p className="mt-4 text-sm leading-relaxed text-chalk-faint">{t('note')}</p>
          </div>

          <FooterColumn title={t('productsTitle')}>
            {AGENTS.map((a) => (
              <FooterLink key={a.slug} href={`/agents/${a.slug}`}>
                {tAgents(`${a.slug}.name`)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title={t('industriesTitle')}>
            {INDUSTRIES.map((i) => (
              <FooterLink key={i.slug} href={`/industries/${i.slug}`}>
                {tIndustries(`${i.slug}.name`)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title={t('companyTitle')}>
            <FooterLink href="/pricing">{tNav('pricing')}</FooterLink>
            <FooterLink href="/about">{tNav('about')}</FooterLink>
            <FooterLink href="/contact">{tNav('contact')}</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/8 pt-6 text-xs text-chalk-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {tBrand('name')}. {t('rights')}</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-chalk-dim">{t('privacy')}</Link>
            <Link href="/terms" className="transition-colors hover:text-chalk-dim">{t('terms')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-4 grid gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-chalk-dim transition-colors hover:text-chalk">
        {children}
      </Link>
    </li>
  );
}
