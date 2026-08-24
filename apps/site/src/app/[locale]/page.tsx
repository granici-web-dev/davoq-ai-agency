import { setRequestLocale } from 'next-intl/server';
import { Reveal } from '@/components/ui/Reveal';
import { Hero } from '@/components/home/Hero';
import { Problem } from '@/components/home/Problem';
import { Agents } from '@/components/home/Agents';
import { Industries } from '@/components/home/Industries';
import { Onboarding } from '@/components/home/Onboarding';
import { Portal } from '@/components/home/Portal';
import { Pricing } from '@/components/home/Pricing';
import { Faq } from '@/components/home/Faq';
import { FinalCta } from '@/components/home/FinalCta';

/**
 * Главная — сборка секций, и только.
 *
 * Каждая секция живёт своим файлом: страница из девяти блоков, написанная
 * одним куском, правится потом целиком ради одной строки, и правка задевает
 * соседей.
 *
 * Секция подключения не обёрнута в `Reveal` намеренно: у неё внутри
 * прилипшая панель, а `transform` на родителе создаёт новую систему
 * координат и `position: sticky` перестаёт работать вовсе.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* Герой без `Reveal`: он на экране с первого кадра, и проявлять
          его по прокрутке нечем. Свой вход, по порядку, у него внутри. */}
      <Hero />
      <Reveal>
        <Problem />
      </Reveal>
      <Reveal>
        <Agents />
      </Reveal>
      <Reveal>
        <Industries />
      </Reveal>
      <Onboarding />
      <Reveal>
        <Portal />
      </Reveal>
      <Reveal>
        <Pricing />
      </Reveal>
      <Reveal>
        <Faq />
      </Reveal>
      <Reveal>
        <FinalCta />
      </Reveal>
    </>
  );
}
