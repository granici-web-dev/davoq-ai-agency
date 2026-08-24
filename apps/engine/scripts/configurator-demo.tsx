/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { LeadForm } from '../src/engine/widget/App.js';
import { OfferModal } from '../src/engine/widget/configurator/OfferModal.js';
import { CONFIGURATOR_STRINGS, STRINGS, type Locale } from '../src/engine/shared/i18n.js';
import { PRESETS, normalizeTheme, resolveTheme, toCssVars } from '../src/engine/shared/theme.js';
import { CSS } from '../src/engine/widget/styles.js';

/**
 * Точка входа предпросмотра. В прод-сборку не входит: её собирает
 * `npm run configurator:preview`, чтобы посмотреть на окно живьём
 * до того, как появятся тенанты, база и маршруты.
 */
const root = document.getElementById('root')!;
const locale = (root.dataset.locale ?? 'ro') as Locale;
const name = root.dataset.name ?? '';
// Тема берётся из конфига клиента: предпросмотр в синей теме по умолчанию
// показывал бы не тот виджет, который встанет к нему на сайт.
const preset = PRESETS.find((p) => p.id === root.dataset.preset);
const theme = normalizeTheme(preset?.theme);

function Demo(): preact.JSX.Element {
  const [open, setOpen] = useState(false);
  // Кнопка на странице клиента: слушатель делегированный, как в embed.tsx.
  useEffect(() => {
    const onClick = (e: Event): void => {
      if ((e.target as Element | null)?.closest?.('[data-assistwidget-offer]')) setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!open) return <div />;
  return (
    <div class="root" style={toCssVars(resolveTheme(theme, false))}>
      <OfferModal
        base="" publicKey="preview" visitorId="preview" conversationId={undefined}
        botName={name} locale={locale}
        t={CONFIGURATOR_STRINGS[locale]} s={STRINGS[locale]}
        onClose={() => setOpen(false)}
        quoteForm={
          <LeadForm
            base="" publicKey="preview" conversationId={undefined}
            t={STRINGS[locale]} intro={CONFIGURATOR_STRINGS[locale].gateHumanHint}
          />
        }
      />
    </div>
  );
}

const shadow = root.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = CSS;
shadow.appendChild(style);
const mount = document.createElement('div');
shadow.appendChild(mount);
render(<Demo />, mount);
