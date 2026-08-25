import { useTranslations } from 'next-intl';

interface Section {
  title: string;
  intro?: string;
  list?: string[];
  outro?: string;
  /** Секция подставляет реквизиты из `legal.entity` вместо абзаца. */
  entity?: boolean;
}

/**
 * Юридическая страница.
 *
 * Один шаблон на политику и условия: у них одинаковая работа — дать
 * прочитать, а не произвести впечатление. Разделы приходят из `messages`,
 * поэтому третий документ не потребует ни строки кода.
 *
 * Режим чтения, а не продажи: узкая колонка текста, оглавление слева
 * липким столбцом, нумерация разделов. Ширина держится около 65 знаков —
 * юридический текст и так читают через силу, и строка во весь экран
 * добивает последних.
 *
 * Дата обновления стоит в первом экране, а не в подвале. Человек, который
 * открыл политику, первым делом хочет знать, не читает ли он документ
 * трёхлетней давности.
 */
export function LegalPage({ namespace }: { namespace: string }) {
  const t = useTranslations(namespace);
  const tLegal = useTranslations('legal');
  const sections = t.raw('sections') as Section[];
  const entity = tLegal.raw('entity') as { label: string; value: string }[];

  return (
    <>
      <section className="relative isolate overflow-hidden px-6 pt-40 pb-16 sm:px-8">
        <div className="aurora" aria-hidden />
        <div className="relative mx-auto max-w-7xl">
          <p className="enter eyebrow" style={{ animationDelay: '120ms' }}>
            {tLegal('eyebrow')}
          </p>
          <h1 className="enter mt-6 max-w-3xl text-h1 font-medium" style={{ animationDelay: '220ms' }}>
            {t('title')}
          </h1>
          <p
            className="enter mt-6 max-w-xl leading-relaxed text-chalk-dim"
            style={{ animationDelay: '360ms' }}
          >
            {t('lead')}
          </p>
          <p
            className="enter mt-8 font-mono text-[10px] tracking-wider text-chalk-faint uppercase"
            style={{ animationDelay: '460ms' }}
          >
            {tLegal('updated')}: {tLegal('updatedDate')}
          </p>
        </div>
      </section>

      <section className="px-6 pb-section sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(13rem,17rem)_1fr] lg:gap-20">
          {/* Оглавление — обычные якорные ссылки, без подсветки текущего
              раздела. Отслеживание прокрутки потребовало бы клиентского
              компонента на странице, которая иначе целиком статическая,
              и дало бы ровно одну подсвеченную строку. */}
          <nav aria-label={tLegal('tocLabel')} className="lg:sticky lg:top-32 lg:self-start">
            <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
              {tLegal('tocLabel')}
            </p>
            <ol className="mt-5 flex flex-col gap-3">
              {sections.map((section, i) => (
                <li key={i}>
                  <a
                    href={`#s-${i + 1}`}
                    className="flex gap-3 text-sm text-chalk-dim transition-colors hover:text-chalk"
                  >
                    <span className="font-mono text-[11px] text-chalk-faint tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="max-w-2xl">
            {sections.map((section, i) => (
              <section
                key={i}
                id={`s-${i + 1}`}
                /* Отступ сверху при переходе по якорю: без него заголовок
                   уезжает под липкую шапку и человек попадает в середину
                   предыдущего раздела. */
                className="scroll-mt-32 border-t border-white/8 py-10 first:border-t-0 first:pt-0"
              >
                <p className="font-mono text-[11px] text-chalk-faint tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h2 className="mt-3 text-h3 font-medium">{section.title}</h2>

                {section.intro && (
                  <p className="mt-5 leading-relaxed text-chalk-dim">{section.intro}</p>
                )}

                {section.entity && (
                  <dl className="mt-6 flex flex-col gap-3 border-l-2 border-white/12 pl-5">
                    {entity.map((row) => (
                      <div key={row.label} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
                        <dt className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase sm:pt-1">
                          {row.label}
                        </dt>
                        <dd className="text-chalk-dim">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {section.list && (
                  <ul className="mt-6 flex flex-col gap-3">
                    {section.list.map((item, j) => (
                      <li key={j} className="flex gap-3.5 leading-relaxed text-chalk-dim">
                        <span
                          className="mt-2.5 size-1 shrink-0 rounded-full bg-chalk-faint"
                          aria-hidden
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {section.outro && (
                  <p className="mt-6 leading-relaxed text-chalk-dim">{section.outro}</p>
                )}
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
