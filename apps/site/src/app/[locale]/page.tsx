import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import heroHome from '@/../public/images/hero-home.webp';

/**
 * Главная. Пока каркас: полное содержимое приходит на этапе 3, после
 * утверждения направления. Здесь стоит ровно столько, сколько нужно,
 * чтобы оценить кадр героя в настоящих условиях — с затемнением,
 * заголовком поверх и шапкой над ним. Картинка, рассмотренная отдельно
 * от вёрстки, всегда выглядит лучше, чем она есть.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('brand');

  return (
    <section className="relative isolate flex min-h-dvh items-end overflow-hidden px-6 pb-24 pt-40 sm:px-8">
      {/* alt пустой намеренно: кадр атмосферный, он не несёт сведений,
          которых нет в тексте рядом. Описывать его вслух скринридеру
          значит заставить человека выслушать пересказ обоев. */}
      <Image
        src={heroHome}
        alt=""
        fill
        priority
        sizes="100vw"
        placeholder="blur"
        /* Кадр отражён по горизонтали. В оригинале освещённое окно —
           единственное светлое пятно снимка — приходится ровно на левую
           треть, где стоит заголовок, и его приходится глушить затемнением.
           Отражение уводит свет в правую половину: текст ложится на тёмный
           камень, а взгляд после заголовка уходит к окну, а не спорит с ним.
           Текста в кадре нет, отражать нечего испортить. */
        /* На узком экране кадр 21:9 обрезается по вертикали так, что
           освещённое окно уходит за край и остаётся чёрный камень.
           Поэтому на телефоне кадрируем по окну, а не по центру.
           Координата берётся в исходнике (окно стоит на 25% ширины),
           а не на экране: отражение применяется уже после кадрирования. */
        className="-z-10 -scale-x-100 object-cover object-[25%_45%] sm:object-bottom"
      />
      <div className="hero-scrim -z-10" aria-hidden />

      <div className="relative mx-auto w-full max-w-7xl">
        <p className="eyebrow">Etapa 2 · Cadru de probă</p>
        <h1 className="mt-6 max-w-4xl text-display font-medium">{t('tagline')}</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim">
          Conținutul paginii principale vine în etapa 3. Aici se vede doar cum
          se comportă fotografia sub titlu.
        </p>
      </div>
    </section>
  );
}
