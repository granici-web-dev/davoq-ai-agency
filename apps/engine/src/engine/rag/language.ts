/**
 * Определение языка ответа.
 *
 * Нужно ровно для одного: поймать, когда бот отвечает на языке своих
 * инструкций, а не на языке посетителя. Замерено контрольным набором —
 * после всех правок промпта это случается примерно раз из пятидесяти,
 * и инструкцией дальше не давится: промпт задаёт вероятность, а не гарантию.
 *
 * Определитель нарочно грубый и осторожный. Его задача — не классифицировать
 * текст, а не ошибиться: ложное срабатывание выбросит правильный ответ
 * и заставит модель отвечать заново, а это хуже, чем пропущенная протечка.
 * Поэтому при малейшем сомнении возвращается null — «не знаю».
 */

export type DetectedLocale = 'ro' | 'ru' | 'de' | 'en';

/**
 * Служебные слова, которых нет в соседних языках. Общие для нескольких языков
 * («contact», «manager», «in») сюда не попадают: на них и строятся ошибки.
 */
const MARKERS: Record<DetectedLocale, string[]> = {
  ro: [
    'și', 'si', 'este', 'sunt', 'pentru', 'dacă', 'daca', 'care', 'dvs',
    'dumneavoastră', 'dumneavoastra', 'nostru', 'noastră', 'noastre', 'despre',
    'putem', 'avem', 'aveți', 'aveti', 'foarte', 'către', 'catre', 'vă', 'într',
    'nu', 'cu', 'mai', 'poate', 'produsele', 'livrare',
  ],
  en: [
    'the', 'and', 'is', 'are', 'you', 'your', 'we', 'our', 'for', 'with',
    'that', 'this', 'have', 'not', 'can', 'will', 'would', 'about', 'please',
    'need', 'sorry', 'apologies', 'information', 'delivery', 'knowledge',
  ],
  de: [
    'der', 'die', 'das', 'und', 'ist', 'sind', 'nicht', 'für', 'mit', 'wir',
    'sie', 'ihre', 'kann', 'wird', 'aber', 'auch', 'bei', 'von', 'zum',
  ],
  ru: [],
};

/** Ниже этого числа слов судить не о чем: «Da.» — законный ответ на любом языке. */
const MIN_WORDS = 6;

/** Отрыв победителя от второго места. Без него «cu» против «with» решает случай. */
const MIN_MARGIN = 2;

export function detectLocale(text: string): DetectedLocale | null {
  const cyrillic = (text.match(/[а-яА-ЯёЁ]/g) ?? []).length;
  // Кириллица однозначна: её нет ни в одном другом языке, на котором мы работаем.
  if (cyrillic > 3) return 'ru';

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}'’]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  if (words.length < MIN_WORDS) return null;

  const counts = new Map<DetectedLocale, number>();
  for (const [locale, markers] of Object.entries(MARKERS) as Array<[DetectedLocale, string[]]>) {
    const set = new Set(markers);
    counts.set(locale, words.filter((w) => set.has(w)).length);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] === 0) return null;
  if (second && best[1] - second[1] < MIN_MARGIN) return null;
  return best[0];
}

/**
 * Ответ написан не на том языке?
 *
 * Допустимых языков может быть несколько, и это важно. Язык реплики посетителя
 * определяется не всегда: «Ce garanție oferiți?» — шесть слов, из них служебное
 * одно, и честный ответ определителя здесь «не знаю». Если в такой момент
 * настаивать на языке из настроек виджета, охрана начнёт отвергать правильные
 * ответы: браузер у посетителя может быть русский, а пишет он по-румынски.
 *
 * Поэтому отклоняем, только когда язык ответа не совпадает НИ С ОДНИМ
 * допустимым. Ровно тот случай, ради которого всё затевалось: инструкции
 * английские, а по-английски посетитель не писал и виджет не просил.
 *
 * «Не знаю» трактуется в пользу ответа: выбросить правильный текст дороже,
 * чем пропустить один неправильный.
 */
export function wrongLanguage(text: string, expected: string | string[]): boolean {
  const accepted = new Set(
    (Array.isArray(expected) ? expected : [expected]).map((l) => l.toLowerCase().split('-')[0]),
  );
  const detected = detectLocale(text);
  return detected !== null && !accepted.has(detected);
}
