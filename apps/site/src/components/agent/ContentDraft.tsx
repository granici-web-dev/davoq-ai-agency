import { useTranslations } from 'next-intl';

interface Variant {
  /** Где выходит: платформа задаёт и длину, и формат кадра. */
  on: string;
  /** Пропорция кадра — единственное, что видно глазом без картинки. */
  format: string;
  text: string;
}

/**
 * Три варианта из одного материала, ждущие подтверждения.
 *
 * Единственный из шести агентов, который производит, а не обрабатывает,
 * и потому единственный, чей макет обязан показать не результат, а
 * развилку перед результатом. Лента готовых постов обещала бы ровно то,
 * чего мы не продаём: «нагенерируем сто штук». Здесь три штуки, из
 * одного вашего материала, и внизу — кнопка, которой ещё не нажали.
 *
 * Дерево выбрано за форму «один → три»: она читается раньше текста и
 * говорит главное — материал не выдуман, он ваш, просто пересобран под
 * каждую площадку. Столбик точек занят планом возвратов, дорожка —
 * статусом заказа; ветвление ни на что на сайте не похоже.
 *
 * Ствол янтарный, а не серый: он идёт от точки с вашим материалом,
 * и цвет — единственное, чем видно, что все три текста растут из него,
 * а не появились сами по себе.
 *
 * У каждой ветки подписана пропорция. Без неё «адаптировано под
 * площадку» остаётся словами: 4:5 и 9:16 — это и есть адаптация.
 *
 * Собрано вёрсткой, как и остальные макеты интерфейса на сайте.
 */
export function ContentDraft({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.draft`);
  const variants = t.raw('variants') as Variant[];

  return (
    <div className="relative mx-auto w-[24rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="text-sm text-chalk">{t('title')}</span>
          <span className="font-mono text-[11px] tracking-wider text-chalk-faint">{t('count')}</span>
        </div>

        <ol className="px-6 py-5">
          {/* Корень дерева — ваш материал. Он стоит первой строкой, а не
              подписью сверху: из него всё растёт, и это должно быть
              видно, а не сказано. */}
          <li className="relative grid grid-cols-[1.7rem_1fr] pb-5">
            <span
              className="absolute top-[0.55rem] bottom-0 left-[0.55rem] w-px bg-aurora-warm/30"
              aria-hidden
            />
            <span className="mt-[0.3rem]">
              <span className="ml-[0.3rem] block size-2 rounded-full bg-aurora-warm shadow-[0_0_10px_var(--color-aurora-warm)]" />
            </span>
            <div>
              <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {t('sourceLabel')}
              </p>
              <p className="mt-1.5 text-sm text-chalk">{t('source')}</p>
              <p className="mt-1 text-xs leading-relaxed text-chalk-faint">{t('sourceMeta')}</p>
            </div>
          </li>

          {variants.map((variant, i) => {
            const last = i === variants.length - 1;
            return (
              <li
                key={variant.on}
                className={`relative grid grid-cols-[1.7rem_1fr] ${last ? 'pb-0' : 'pb-5'}`}
              >
                {/* Уголок: ствол уходит вниз и заворачивает в ветку.
                    Border-l и border-b одного элемента дают скругление
                    в углу, которого не даст пара отрезков. */}
                <span
                  className="absolute top-0 left-[0.55rem] h-[0.56rem] w-[1rem] rounded-bl-[6px] border-b border-l border-aurora-warm/30"
                  aria-hidden
                />
                {!last && (
                  <span
                    className="absolute top-[0.56rem] bottom-0 left-[0.55rem] w-px bg-aurora-warm/30"
                    aria-hidden
                  />
                )}

                <span aria-hidden />
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-mono text-[10px] tracking-wider text-chalk-dim uppercase">
                      {variant.on}
                    </p>
                    <p className="font-mono text-[10px] text-chalk-faint tabular-nums">
                      {variant.format}
                    </p>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-chalk">{variant.text}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Единственное, ради чего этот макет вообще нарисован: между
            готовым текстом и публикацией стоит человек. */}
        <div className="border-t border-white/8 bg-aurora-warm/6 px-6 py-4">
          <p className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
            {t('holdLabel')}
          </p>
          <p className="mt-1.5 text-sm text-chalk">{t('hold')}</p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}
