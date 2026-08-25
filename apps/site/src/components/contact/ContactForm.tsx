'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { contactErrors, EMPTY, LIMITS, type ContactField, type ContactInput } from '@/lib/contact';

type State = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * Форма заявки.
 *
 * Четыре поля, из них обязательных два. Каждое лишнее поле — это люди,
 * которые начали заполнять и бросили; спрашивать бюджет и «откуда узнали»
 * можно на созвоне, когда разговор уже идёт.
 *
 * Проверка та же, что на сервере, из `lib/contact`. Ошибки показываются
 * только после первой попытки отправки: подсвечивать «неверный e-mail»
 * человеку, который набрал две буквы из десяти, — значит ругать его за
 * то, что он ещё печатает.
 */
export function ContactForm({ bare = false }: { bare?: boolean } = {}) {
  const t = useTranslations('contact.form');
  const id = useId();

  const [values, setValues] = useState<ContactInput>(EMPTY);
  const [state, setState] = useState<State>('idle');
  const [showErrors, setShowErrors] = useState(false);

  const errors = contactErrors(values);
  const set = (field: keyof ContactInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;

    setState('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('sent');
      setValues(EMPTY);
      setShowErrors(false);
    } catch {
      setState('failed');
    }
  }

  if (state === 'sent') {
    return (
      <div className={bare ? 'flex flex-col items-start py-4' : 'card flex min-h-80 flex-col items-start justify-center p-7 sm:p-8'}>
        <span
          className="size-2 rounded-full bg-aurora-warm shadow-[0_0_12px_var(--color-aurora-warm)]"
          aria-hidden
        />
        <h3 className="mt-5 text-h3 font-medium">{t('sentTitle')}</h3>
        <p className="mt-3 max-w-sm leading-relaxed text-chalk-dim">{t('sentText')}</p>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="mt-6 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors hover:text-chalk"
        >
          {t('sendAnother')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={bare ? '' : 'card p-7 sm:p-8'}>
      <div className="flex flex-col gap-5">
        <Field
          id={`${id}-name`}
          label={t('name')}
          value={values.name}
          onChange={set('name')}
          error={showErrors ? errors.name : undefined}
          maxLength={LIMITS.name}
          autoComplete="name"
          required
          t={t}
        />
        <Field
          id={`${id}-contact`}
          label={t('contact')}
          hint={t('contactHint')}
          value={values.contact}
          onChange={set('contact')}
          error={showErrors ? errors.contact : undefined}
          maxLength={LIMITS.contact}
          autoComplete="email"
          required
          t={t}
        />
        <Field
          id={`${id}-site`}
          label={t('site')}
          value={values.site}
          onChange={set('site')}
          error={showErrors ? errors.site : undefined}
          maxLength={LIMITS.site}
          autoComplete="url"
          t={t}
        />
        <Field
          id={`${id}-message`}
          label={t('message')}
          value={values.message}
          onChange={set('message')}
          error={showErrors ? errors.message : undefined}
          maxLength={LIMITS.message}
          multiline
          t={t}
        />

        {/* Ловушка для ботов. Скрыта от глаз и от скринридеров, но не
            через display:none — часть автозаполнителей такие поля
            пропускает, а нам нужно, чтобы бот его нашёл и заполнил. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={`${id}-company`}>Company</label>
          <input
            id={`${id}-company`}
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={values.company}
            onChange={set('company')}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={state === 'sending'}
        className="mt-7 inline-flex w-full items-center justify-center rounded-pill bg-chalk px-6 py-3.5 text-sm font-medium text-ink-950 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'sending' ? t('sending') : t('submit')}
      </button>

      {/* aria-live: отправка ничего не двигает на экране, и без объявления
          человек со скринридером не узнает, что что-то произошло. */}
      <p aria-live="polite" className="min-h-5">
        {state === 'failed' && (
          <span className="mt-3 block text-sm text-aurora-warm">{t('failed')}</span>
        )}
      </p>

      <p className="mt-4 text-xs leading-relaxed text-chalk-faint">
        {t('privacy')}{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-chalk-dim">
          {t('privacyLink')}
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  maxLength,
  multiline,
  required,
  autoComplete,
  t,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  error?: string;
  maxLength: number;
  multiline?: boolean;
  required?: boolean;
  autoComplete?: string;
  t: (key: string) => string;
}) {
  const errorId = `${id}-error`;
  const base =
    'w-full rounded-xl border bg-white/3 px-4 py-3 text-sm text-chalk placeholder:text-chalk-faint transition-colors focus:bg-white/5 focus:outline-none';
  const border = error ? 'border-aurora-warm' : 'border-field hover:border-chalk-faint';

  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm text-chalk-dim">
        {label}
        {!required && (
          <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('optional')}
          </span>
        )}
      </label>

      {multiline ? (
        <textarea
          id={id}
          rows={4}
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`mt-2 resize-y ${base} ${border}`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`mt-2 ${base} ${border}`}
        />
      )}

      {hint && !error && <p className="mt-1.5 text-xs text-chalk-faint">{hint}</p>}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-aurora-warm">
          {t(`errors.${error as ContactField | 'tooLong' | 'contactFormat'}`)}
        </p>
      )}
    </div>
  );
}
