/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConfiguratorStrings, Strings } from '../../shared/i18n.js';
import { Configurator } from './Configurator.js';
import { fetchConfigurator, flushEvents, track, type Answers, type ConfiguratorConfig } from './api.js';

/**
 * Окно конфигуратора.
 *
 * Открывается СВОЕЙ кнопкой на странице товара — рядом с «Cere ofertă»,
 * которая у клиента уже есть и остаётся его собственной. Две кнопки, два
 * понятных исхода: запросить оферту у продавца или собрать самому.
 *
 * Промежуточного экрана «что вы хотите» здесь нет намеренно. Он был:
 * посетитель нажимал кнопку и попадал не в конфигуратор, а в вопрос
 * о том, хочет ли он в конфигуратор. Выбор, уже сделанный кнопкой,
 * переспрашивать не надо.
 *
 * Форма заявки остаётся ровно на один случай — когда конфигуратор
 * не отдался. Пустое окно тогда хуже отказа: посетитель пришёл за ценой,
 * и способ её получить у него должен остаться.
 */

type Screen = 'configure' | 'quote';

interface Props {
  base: string;
  publicKey: string;
  visitorId: string;
  conversationId: string | undefined;
  botName: string;
  locale: string;
  t: ConfiguratorStrings;
  s: Strings;
  onClose: () => void;
  /** Форма заявки — та же, что у чата: контакт продавцу собирается одинаково. */
  quoteForm: preact.JSX.Element;
}

export function ConfiguratorModal(props: Props): preact.JSX.Element {
  const { base, publicKey, botName, locale, t, s, onClose } = props;
  const [screen, setScreen] = useState<Screen>('configure');
  const [config, setConfig] = useState<ConfiguratorConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    track(base, publicKey, 'open');
    fetchConfigurator(base, publicKey, locale)
      .then(setConfig)
      .catch(() => { setFailed(true); setScreen('quote'); });
    // Досылка при закрытии: события, накопленные за последние секунды,
    // иначе уходят вместе с окном.
    return () => { void flushEvents(base, publicKey); };
  }, [base, publicKey, locale]);

  // Esc закрывает, Tab не уходит на страницу под окном — то же правило,
  // что у панели чата.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const focusable = box.current.querySelectorAll<HTMLElement>(
        'button, input, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const root = box.current.getRootNode() as ShadowRoot;
      if (e.shiftKey && root.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && root.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    box.current?.addEventListener('keydown', onKey);
    const node = box.current;
    return () => node?.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      class="ofr-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="ofr" data-screen={screen} ref={box} role="dialog" aria-modal="true" aria-label={botName}>
        <div class="ofr-head">
          <span class="name">{botName}</span>
          <button class="iconbtn" aria-label={s.close} onClick={onClose}>×</button>
        </div>

        {screen === 'quote' && <div class="ofr-fallback">{props.quoteForm}</div>}

        {screen === 'configure' && !failed && (
          config && (
              <div class="ofr-split">
                <div class="ofr-main">
                  <Configurator
                    base={base} publicKey={publicKey} visitorId={props.visitorId}
                    conversationId={props.conversationId} config={config}
                    locale={locale} t={t} s={s} onAnswers={setAnswers}
                  />
                </div>
                <aside class="ofr-rail">
                  <h4>{t.summary}</h4>
                  <dl>
                    {config.flow.steps.map((step) => {
                      const value = answers[step.id];
                      const shown = describe(step, value);
                      return (
                        <div key={step.id} class={shown ? undefined : 'pending'}>
                          <dt>{step.title}</dt>
                          <dd>{shown || '—'}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </aside>
              </div>
            )
        )}
      </div>
    </div>
  );
}

function describe(
  step: ConfiguratorConfig['flow']['steps'][number], value: Answers[string] | undefined,
): string {
  if (value === undefined || value === '') return '';
  if (typeof value === 'number') return `${value}${step.input?.unit ? ' ' + step.input.unit : ''}`;
  const ids = Array.isArray(value) ? value : [value];
  return ids.map((id) => step.options?.find((o) => o.id === id)?.label ?? id).join(', ');
}
