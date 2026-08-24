import Image from 'next/image';
import { useTranslations } from 'next-intl';
import heroHome from '@/../public/images/hero-home.webp';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';

/**
 * Первый экран.
 *
 * Текст выровнен по вертикали и держится в левой половине: свет в кадре
 * стоит справа, и это единственное место, где заголовок ложится на
 * нетронутый чёрный, а не спорит с лучом.
 */
export function Hero() {
  const t = useTranslations('home.hero');

  return (
    <section className="relative isolate flex min-h-dvh items-center overflow-hidden px-6 py-32 sm:px-8">
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
        /* На узком экране кадр 21:9 режется по центру, и щель света —
           единственное, ради чего кадр существует — уходит за правый край.
           Поэтому на телефоне кадрируем по ней. */
        className="-z-10 object-cover object-[70%_50%] sm:object-center"
      />
      <div className="hero-scrim -z-10" aria-hidden />
      {/* Только для телефона. На широком экране текст и свет стоят в разных
          половинах и не мешают друг другу; на узком щель света оказывается
          прямо под абзацем, и без этого затемнения строка теряет контраст.
          На десктопе такой градиент был бы вредом — он съел бы луч. */}
      <div
        className="absolute inset-0 -z-10 bg-linear-to-r from-ink-950 via-ink-950/75 to-transparent sm:hidden"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <h1 className="text-display font-medium">{t('title')}</h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-chalk-dim">
            {t('lead')}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <DemoButton>{t('ctaPrimary')}</DemoButton>
            <Cta href="/agents" variant="ghost">
              {t('ctaSecondary')}
            </Cta>
          </div>

        </div>
      </div>
    </section>
  );
}
