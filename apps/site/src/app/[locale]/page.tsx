import { setRequestLocale } from 'next-intl/server';
import { Hero } from '@/components/home/Hero';
import { Problem } from '@/components/home/Problem';
import { Agents } from '@/components/home/Agents';

/**
 * Главная — сборка секций, и только.
 *
 * Каждая секция живёт своим файлом: страница из восьми блоков, написанная
 * одним куском, правится потом целиком ради одной строки, и правка задевает
 * соседей.
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
      <Hero />
      <Problem />
      <Agents />
    </>
  );
}
