/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Configurator } from '../src/engine/widget/configurator/Configurator.js';
import { fetchConfigurator, type ConfiguratorConfig } from '../src/engine/widget/configurator/api.js';
import { CONFIGURATOR_STRINGS, STRINGS, type Locale } from '../src/engine/shared/i18n.js';
import { PRESETS, normalizeTheme, resolveTheme, toCssVars } from '../src/engine/shared/theme.js';
import { CSS } from '../src/engine/widget/styles.js';

/**
 * Точка входа предпросмотра. В прод-сборку не входит: её собирает
 * `npm run configurator:preview`, чтобы посмотреть на шаги живьём
 * до того, как появятся тенанты, база и маршруты.
 */
const root = document.getElementById('root')!;
const locale = (root.dataset.locale ?? 'ro') as Locale;
// Тема берётся из конфига клиента: предпросмотр в синей теме по умолчанию
// показывал бы не тот виджет, который встанет к нему на сайт.
const preset = PRESETS.find((p) => p.id === root.dataset.preset);
const theme = normalizeTheme(preset?.theme);

function Demo(): preact.JSX.Element | null {
  const [config, setConfig] = useState<ConfiguratorConfig | null>(null);
  useEffect(() => { void fetchConfigurator('', 'preview', locale).then(setConfig); }, []);
  if (!config) return null;
  return (
    <div class="root" data-pos="bottom-right" style={toCssVars(resolveTheme(theme, false))}>
      <div class="panel" role="dialog" aria-label="Configurator">
        <div class="header"><span class="name">{root.dataset.name}</span></div>
        <Configurator
          base="" publicKey="preview" visitorId="preview" conversationId={undefined}
          config={config} locale={locale}
          t={CONFIGURATOR_STRINGS[locale]} s={STRINGS[locale]}
        />
        <div class="disclosure">{root.dataset.disclosure}</div>
      </div>
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
