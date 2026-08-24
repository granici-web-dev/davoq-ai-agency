/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ConfiguratorStrings, Strings } from '../../shared/i18n.js';
import {
  askAgent, fetchPrice, money, submitOffer,
  type Answers, type ConfiguratorConfig, type PriceView, type PublicStep,
} from './api.js';

/**
 * Конфигуратор в виджете.
 *
 * Шагами управляет виджет, а не модель. Агент отвечает на вопросы и советует,
 * но «показать шаг» и «выпустить оферту» — детерминированные действия кнопки:
 * модель можно уговорить пропустить согласие или выставить документ раньше
 * времени, кнопку — нет. Цена приходит с сервера и здесь только форматируется.
 *
 * Выбор живёт в sessionStorage. Посетитель уходит мерить стену и возвращается
 * на ту же вкладку — конфигурация на месте; вкладка закрылась — выбор ушёл
 * вместе с ней, и согласия на куки не потребовалось. Тот же выбор, что
 * у переписки чат-бота, и по той же причине.
 */

type Screen = 'steps' | 'summary' | 'sent';

interface Props {
  base: string;
  publicKey: string;
  visitorId: string;
  conversationId: string | undefined;
  config: ConfiguratorConfig;
  locale: string;
  t: ConfiguratorStrings;
  /** Подписи полей контакта общие с формой заявки чат-бота: поле «Телефон» одно на продукт. */
  s: Strings;
  /** Выбор наружу: боковая сводка живёт в окне оферты, а не внутри шагов. */
  onAnswers?: (answers: Answers) => void;
}

function restore(publicKey: string): Answers {
  try {
    const raw = sessionStorage.getItem(`cw_cfg_${publicKey}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Answers) : {};
  } catch {
    return {};
  }
}

export function Configurator(props: Props): preact.JSX.Element {
  const { base, publicKey, config, locale, t } = props;
  const steps = config.flow.steps;

  const [restored] = useState<Answers>(() => restore(publicKey));
  const [answers, setAnswers] = useState<Answers>(restored);
  // Возврат туда, где посетитель остановился. Восстановить один выбор мало:
  // он вернулся бы на первый шаг с уже отмеченными ответами и решал, что
  // всё придётся проходить заново.
  const resumeAt = useMemo(() => {
    const i = steps.findIndex((s) => !s.optional && !filled(restored[s.id]));
    return i === -1 ? steps.length : i;
    // Считается один раз, от восстановленного выбора: дальше шагами
    // управляет сам посетитель.
  }, [steps, restored]);
  const [index, setIndex] = useState(Math.min(resumeAt, steps.length - 1));
  const [screen, setScreen] = useState<Screen>(resumeAt >= steps.length ? 'summary' : 'steps');
  const [price, setPrice] = useState<PriceView | null>(null);
  const [pricing, setPricing] = useState(false);

  const { onAnswers } = props;
  useEffect(() => {
    onAnswers?.(answers);
    try { sessionStorage.setItem(`cw_cfg_${publicKey}`, JSON.stringify(answers)); }
    catch { /* приватный режим */ }
  }, [publicKey, answers, onAnswers]);

  // Цена запрашивается, только когда отвечены все обязательные шаги. Показывать
  // её раньше значит называть сумму, которая на следующем шаге вырастет вдвое:
  // посетитель запоминает первую.
  const complete = useMemo(
    () => steps.every((s) => s.optional || filled(answers[s.id])),
    [steps, answers],
  );

  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    abort.current?.abort();
    if (!complete) { setPrice(null); return; }
    const controller = new AbortController();
    abort.current = controller;
    setPricing(true);
    // Небольшая задержка: посетитель перебирает варианты подряд, и каждый
    // тап без неё уходил бы отдельным запросом.
    const timer = setTimeout(() => {
      fetchPrice(base, publicKey, answers, controller.signal)
        .then((p) => { if (!controller.signal.aborted) setPrice(p); })
        .catch(() => { if (!controller.signal.aborted) setPrice(null); })
        .finally(() => { if (!controller.signal.aborted) setPricing(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, publicKey, answers, complete]);

  const step = steps[index];
  const answered = step ? filled(answers[step.id]) : false;

  const set = (id: string, value: Answers[string] | undefined): void => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const forward = (): void => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else setScreen('summary');
  };

  const choose = (option: string): void => {
    if (!step) return;
    if (step.multiple) {
      const current = Array.isArray(answers[step.id]) ? (answers[step.id] as string[]) : [];
      set(step.id, current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option]);
      return;
    }
    set(step.id, option);
    // Одиночный выбор ведёт дальше сам: тап по карточке и есть ответ,
    // и требовать после него ещё тап по «Далее» — лишний шаг на каждом шаге.
    forward();
  };

  if (screen === 'sent') {
    return <div class="cfg-done"><span class="hint">{t.offerSent}</span></div>;
  }

  if (screen === 'summary') {
    return (
      <Summary
        {...props}
        answers={answers}
        price={price}
        pricing={pricing}
        onEdit={(id) => { setIndex(Math.max(0, steps.findIndex((s) => s.id === id))); setScreen('steps'); }}
        onSent={() => setScreen('sent')}
      />
    );
  }

  if (!step) return <div class="cfg" />;

  return (
    <div class="cfg">
      <div class="cfg-top">
        <span class="cfg-count">
          {t.step.replace('{n}', String(index + 1)).replace('{total}', String(steps.length))}
        </span>
        <div class="cfg-bar"><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      </div>

      <div class="cfg-body">
        <h3 class="cfg-title">{step.title}</h3>
        <StepBody step={step} value={answers[step.id]} onChoose={choose} onSet={(v) => set(step.id, v)} t={t} />
        {/* key по шагу: без него ответ про наполнитель оставался на экране
            размеров — вопрос забыт, ответ висит, и он теперь не о том. */}
        <Ask key={step.id} base={base} publicKey={publicKey} locale={locale}
             stepId={step.id} answers={answers} t={t} />
      </div>

      <div class="cfg-nav">
        <button class="cfg-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {t.back}
        </button>
        <Price price={price} pricing={pricing} config={config} locale={locale} t={t} />
        <button class="send" disabled={!answered && !step.optional} onClick={forward}>
          {answered || !step.optional ? t.next : t.skip}
        </button>
      </div>
    </div>
  );
}

/**
 * Вопрос агенту, не выходя из шага.
 *
 * Свёрнут по умолчанию. Поле ввода, открытое на каждом шаге, читается как
 * «здесь надо что-то написать» и сбивает с выбора — а выбор здесь и есть
 * работа. Кто хочет спросить, спросит.
 */
function Ask({
  base, publicKey, locale, stepId, answers, t,
}: {
  base: string;
  publicKey: string;
  locale: string;
  stepId: string;
  answers: Answers;
  t: ConfiguratorStrings;
}): preact.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: Event): Promise<void> => {
    e.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setBusy(true);
    setDraft('');
    const answer = await askAgent(base, { publicKey, locale, stepId, selections: answers, question });
    setReply(answer ?? t.askError);
    setBusy(false);
  };

  if (!open) {
    return (
      <button type="button" class="cfg-link cfg-ask-open" onClick={() => setOpen(true)}>
        {t.ask}
      </button>
    );
  }

  return (
    <form class="cfg-ask" onSubmit={send}>
      {reply && <p class="cfg-answer">{reply}</p>}
      {busy && <p class="cfg-answer pending">{t.calculating}</p>}
      <div class="cfg-ask-row">
        <input
          value={draft}
          placeholder={t.askPlaceholder}
          aria-label={t.askPlaceholder}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        />
        <button class="send" type="submit" disabled={busy || !draft.trim()}>›</button>
      </div>
    </form>
  );
}

const filled = (v: Answers[string] | undefined): boolean =>
  v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

function StepBody({
  step, value, onChoose, onSet, t,
}: {
  step: PublicStep;
  value: Answers[string] | undefined;
  onChoose: (id: string) => void;
  onSet: (v: Answers[string] | undefined) => void;
  t: ConfiguratorStrings;
}): preact.JSX.Element {
  if (step.type === 'number-input') {
    const input = step.input;
    return (
      <div class="cfg-number">
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={input?.min}
          max={input?.max}
          step={input?.step}
          aria-label={step.title}
          onInput={(e) => {
            const raw = (e.target as HTMLInputElement).value;
            onSet(raw === '' ? undefined : Number(raw));
          }}
        />
        {input?.unit && <span class="cfg-unit">{input.unit}</span>}
      </div>
    );
  }

  if (step.type === 'text') {
    return (
      <textarea
        class="cfg-text"
        value={typeof value === 'string' ? value : ''}
        placeholder={t.notePlaceholder}
        aria-label={step.title}
        onInput={(e) => onSet((e.target as HTMLTextAreaElement).value)}
      />
    );
  }

  const chosen = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return (
    <div class={step.type === 'color-grid' ? 'cfg-swatches' : 'cfg-cards'} role="group" aria-label={step.title}>
      {(step.options ?? []).map((o) => (
        <button
          key={o.id}
          type="button"
          class={`cfg-opt${chosen.includes(o.id) ? ' on' : ''}`}
          aria-pressed={chosen.includes(o.id)}
          onClick={() => onChoose(o.id)}
        >
          {o.image && <img src={o.image} alt="" loading="lazy" />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Price({
  price, pricing, config, locale, t,
}: {
  price: PriceView | null;
  pricing: boolean;
  config: ConfiguratorConfig;
  locale: string;
  t: ConfiguratorStrings;
}): preact.JSX.Element {
  if (!price) return <span class="cfg-price">{pricing ? t.calculating : ''}</span>;
  const { code, decimals } = config.currency;
  // Старая цена зачёркнутой: «дешевле» без «чем было» ничего не сообщает.
  // Пересчитывается от общей суммы, чтобы зачёркнутое и новое были одной
  // природы — обе с НДС, а не одна с ним, другая без.
  const wasBani = price.discountBani > 0
    ? Math.round(price.totalBani * (price.listPriceBani / (price.listPriceBani - price.discountBani)))
    : 0;
  const promoLabel = price.promo?.label[locale] ?? (price.promo && Object.values(price.promo.label)[0]);
  // Показывается СУММА К ОПЛАТЕ, и она содержит НДС в обоих режимах: при
  // `add` он к ней прибавлен, при `included` уже сидел внутри. Первая версия
  // подписывала её «plus TVA» — то есть посетитель ждал бы сверху ещё 21%
  // от числа, в котором эти 21% уже есть.
  return (
    <span class="cfg-price">
      <span class="cfg-sum">
        {wasBani > 0 && <s>{money(wasBani, code, locale, decimals)}</s>}
        <b>{money(price.totalBani, code, locale, decimals)}</b>
      </span>
      {promoLabel && <i class="cfg-promo">{promoLabel}</i>}
      {config.vat.rate > 0 && <i>{t.vatIncluded}</i>}
    </span>
  );
}

function Summary({
  base, publicKey, visitorId, conversationId, config, locale, t, s,
  answers, price, pricing, onEdit, onSent,
}: Props & {
  answers: Answers;
  price: PriceView | null;
  pricing: boolean;
  onEdit: (stepId: string) => void;
  onSent: () => void;
}): preact.JSX.Element {
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'error' | 'noConsent'>('idle');

  const label = (step: PublicStep): string => {
    const value = answers[step.id];
    if (value === undefined) return '—';
    if (typeof value === 'number') return `${value}${step.input?.unit ? ' ' + step.input.unit : ''}`;
    const ids = Array.isArray(value) ? value : [value];
    const names = ids.map((id) => step.options?.find((o) => o.id === id)?.label ?? id);
    return names.length > 0 ? names.join(', ') : String(value);
  };

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (state === 'sending') return;
    if (!consent) { setState('noConsent'); return; }
    setState('sending');
    const ok = await submitOffer(base, {
      publicKey, visitorId, conversationId, selections: answers,
      contact, consentMarketing: marketing, locale,
    });
    if (ok) onSent(); else setState('error');
  };

  return (
    <form class="cfg cfg-summary" onSubmit={submit}>
      <div class="cfg-body">
        <h3 class="cfg-title">{t.summary}</h3>
        <dl class="cfg-list">
          {config.flow.steps.map((step) => (
            <div key={step.id}>
              <dt>{step.title}</dt>
              <dd>
                {label(step)}
                <button type="button" class="cfg-link" onClick={() => onEdit(step.id)}>{t.change}</button>
              </dd>
            </div>
          ))}
        </dl>

        <p class="cfg-total">
          <span>{t.price}</span>
          <Price price={price} pricing={pricing} config={config} locale={locale} t={t} />
        </p>

        <p class="hint">{t.contactIntro}</p>
        <input value={contact.name} placeholder={s.leadName} aria-label={s.leadName}
          onInput={(e) => setContact({ ...contact, name: (e.target as HTMLInputElement).value })} />
        <input type="email" value={contact.email} placeholder={s.leadEmail} aria-label={s.leadEmail}
          onInput={(e) => setContact({ ...contact, email: (e.target as HTMLInputElement).value })} />
        <input type="tel" value={contact.phone} placeholder={s.leadPhone} aria-label={s.leadPhone}
          onInput={(e) => setContact({ ...contact, phone: (e.target as HTMLInputElement).value })} />

        <label class="cfg-check">
          <input type="checkbox" checked={consent}
            onChange={(e) => { setConsent((e.target as HTMLInputElement).checked); setState('idle'); }} />
          <span>{t.consentRequired}</span>
        </label>
        <label class="cfg-check">
          <input type="checkbox" checked={marketing}
            onChange={(e) => setMarketing((e.target as HTMLInputElement).checked)} />
          <span>{t.consentMarketing}</span>
        </label>
        {state === 'noConsent' && <span class="err">{t.needConsent}</span>}
      </div>

      <div class="cfg-nav">
        <button type="submit" class="send wide" disabled={state === 'sending'}>{t.getOffer}</button>
      </div>
    </form>
  );
}
