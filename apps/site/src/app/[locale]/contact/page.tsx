import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { ContactForm } from "@/components/contact/ContactForm";
import { Reveal } from "@/components/ui/Reveal";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage" });
  const path = "/contact";
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: locale === routing.defaultLocale ? path : `/${locale}${path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          l === routing.defaultLocale ? path : `/${l}${path}`,
        ]),
      ),
    },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      type: "website",
    },
  };
}

interface Step {
  when: string;
  text: string;
}

/**
 * Страница контакта.
 *
 * Форма на сайте уже есть — она открывается окном по кнопке «демонстрация».
 * Страница нужна не ради второй формы, а ради того, чего окно сказать не
 * может: что произойдёт после отправки. Сюда приходят по трём разным
 * ссылкам — «нужен другой агент», «моей ниши нет в списке», «хочу
 * поговорить с человеком», — и у всех троих один и тот же страх: что
 * письмо уйдёт в воронку.
 *
 * Поэтому первым же экраном стоят три шага со сроками, а ниже — то, чего
 * НЕ произойдёт. Обещание «не запишем в рассылку» стоит дороже любого
 * призыва к действию: оно снимает единственную причину не писать.
 *
 * Форма стоит в первом экране справа, а не под текстом. Человек, который
 * уже решил написать, не должен ради этого прокручивать страницу.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("contactPage");
  const steps = t.raw("steps") as Step[];
  const useful = t.raw("useful") as string[];
  const never = t.raw("never") as string[];

  return (
    <>
      <section className="relative isolate overflow-hidden px-6 pt-40 pb-section sm:px-8">
        <div className="aurora" aria-hidden />

        {/* Три ячейки, а не две: на телефоне форма встаёт сразу после
            заголовка, до трёх шагов. Человек, пришедший написать, не
            должен ради этого прокручивать экран — а обещание «отвечает
            человек в тот же день» он к этому моменту уже прочитал,
            оно стоит в лиде. На широком экране порядок обычный:
            текст слева, форма справа. */}
        <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1fr_27rem] lg:items-start lg:gap-x-20 lg:gap-y-14">
          <div className="order-1 lg:col-start-1 lg:row-start-1">
            <p className="enter eyebrow" style={{ animationDelay: "120ms" }}>
              {t("eyebrow")}
            </p>
            <h1
              className="enter mt-6 max-w-2xl text-h1 font-medium"
              style={{ animationDelay: "220ms" }}
            >
              {t("title")}
            </h1>
            <p
              className="enter mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim"
              style={{ animationDelay: "360ms" }}
            >
              {t("lead")}
            </p>
          </div>

          <div
            className="enter order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-32"
            style={{ animationDelay: "260ms" }}
          >
            <ContactForm />
          </div>

          {/* Три шага со сроками. Срок здесь важнее описания: «ответим»
              без «когда» человек читает как «когда-нибудь», и именно это
              заставляет его закрыть страницу, не написав. */}
          <div
            className="enter order-3 max-w-xl lg:col-start-1 lg:row-start-2"
            style={{ animationDelay: "480ms" }}
          >
            <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
              {t("stepsLabel")}
            </p>

            <ol className="mt-6">
              {steps.map((step, i) => {
                const last = i === steps.length - 1;
                return (
                  <li
                    key={i}
                    className="relative grid grid-cols-[1.4rem_1fr] gap-x-4"
                  >
                    {!last && (
                      <span
                        className="absolute top-5 bottom-0 left-[0.59rem] w-px bg-white/10"
                        aria-hidden
                      />
                    )}
                    <span className="flex h-5 items-center justify-center">
                      <span
                        className={
                          i === 0
                            ? "size-2.5 rounded-full bg-aurora-warm shadow-[0_0_10px_var(--color-aurora-warm)]"
                            : "size-2.5 rounded-full border border-white/25"
                        }
                      />
                    </span>
                    <div className={last ? "pb-0" : "pb-7"}>
                      <p className="font-mono text-[10px] tracking-wider text-chalk-dim uppercase">
                        {step.when}
                      </p>
                      <p className="mt-1.5 leading-relaxed text-chalk">
                        {step.text}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            {/* Тот же приём, что на страницах агентов: слева — что делаем,
                справа — чего не делаем. Второй столбец здесь и есть
                причина, по которой человек решается написать. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-7 sm:p-8">
                <h2 className="font-mono text-[11px] tracking-wider text-chalk-dim uppercase">
                  {t("usefulTitle")}
                </h2>
                <ul className="mt-6 flex flex-col gap-4">
                  {useful.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-3.5 leading-relaxed text-chalk-dim"
                    >
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card p-7 sm:p-8">
                <h2 className="font-mono text-[11px] tracking-wider text-chalk-dim uppercase">
                  {t("neverTitle")}
                </h2>
                <ul className="mt-6 flex flex-col gap-4">
                  {never.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-3.5 leading-relaxed text-chalk-dim"
                    >
                      <CrossIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Ссылка на вопросы стоит в конце, а не в начале: отправить
                человека читать раньше, чем он написал, — значит потерять
                половину. Но письмо с вопросом, у которого уже есть
                написанный ответ, тоже не нужно ни ему, ни нам. */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-6">
              <p className="max-w-xl text-sm leading-relaxed text-chalk-dim">
                {t("faqText")}
              </p>
              <Link
                href="/pricing"
                className="group shrink-0 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors hover:text-chalk"
              >
                {t("faqLink")}{" "}
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="mt-1 shrink-0 text-aurora-warm"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="mt-1 shrink-0 text-chalk-faint"
    >
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
