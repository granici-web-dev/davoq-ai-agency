/**
 * Проверка определителя языка на настоящих ответах бота.
 *
 * Тексты ниже — не выдуманные примеры: это ответы, которые бот выдал
 * в прогонах контрольного набора. Протечки взяты из провалившихся случаев,
 * правильные — из прошедших.
 *
 * Главное, что здесь проверяется, — отсутствие ложных срабатываний.
 * Пропущенная протечка стоит одного странного ответа; ложное срабатывание
 * выбрасывает правильный ответ и заставляет платить за второй.
 *
 *   npm run test:language
 */
import type { FastifyReply } from 'fastify';
import { detectLocale, wrongLanguage } from '../src/engine/rag/language.js';
import { createStreamGuard } from '../src/engine/api/stream-guard.js';

let failed = 0;
const check = (what: string, actual: unknown, expected: unknown): void => {
  if (actual === expected) console.log(`  ✓ ${what}`);
  else {
    console.error(`  ✗ ${what}: получено ${String(actual)}, ожидалось ${String(expected)}`);
    failed++;
  }
};

// ── Настоящие протечки, пойманные набором ────────────────────────────────
const LEAKS = [
  "I appreciate you testing my consistency. I won't do that. I'm SofaBelle, the assistant on this website. I'm here to help you with questions about our upholstered furniture — sofas, corner sofas, beds, armchairs, and mattresses that we make to order. How can I help you today?",
  "Apologies, but I don't have information about deliveries to France or delivery times to international locations in my knowledge base. I can tell you that for orders within Romania, delivery takes 1–2 weeks if the item is in stock, or 4–6 weeks for custom orders.",
  "I need to report that the knowledge base doesn't contain information about international shipping to France. I'll need to hand this question to a manager who can confirm what countries we serve.",
];
for (const [i, text] of LEAKS.entries()) {
  check(`протечка ${i + 1} опознана как английская`, detectLocale(text), 'en');
  check(`протечка ${i + 1} помечена как чужой язык`, wrongLanguage(text, 'ro'), true);
}

// ── Правильные румынские ответы ──────────────────────────────────────────
const GOOD = [
  'Din păcate, nu am informații în baza de cunoștințe despre livrări în Franța. Vă recomand să contactați un manager care să confirme posibilitatea și condițiile de livrare pentru locația dvs.',
  'Nu, showroom-urile noastre sunt situate în trei orașe din România: Brașov, București și Cluj-Napoca. Care dintre acestea este cel mai apropiat de dvs.?',
  'Sunt un program — un asistent AI. Nu sunt om. Cum te pot ajuta cu mobilă SofaBelle?',
  'Pentru a vă oferi un preț exact, am nevoie de mai multe detalii. Ce tip de tapițerie preferați — țesătură sau piele — și ce culoare?',
  'Toate produsele noastre beneficiază de o garanție standard de 3 ani. Produsele au o medie de utilizare de 15 ani cu întreținere minimă.',
  // Без диакритики: клиенты и их консультанты пишут так постоянно.
  'Nu livram in Franta. Livrarile noastre sunt in Romania. Daca sunteti interesat de produsele noastre, va invit sa vizitati cel mai apropiat showroom.',
];
for (const [i, text] of GOOD.entries()) {
  check(`румынский ответ ${i + 1} не помечен`, wrongLanguage(text, 'ro'), false);
}

// ── Русский и немецкий ───────────────────────────────────────────────────
check('русский опознан', detectLocale('Здравствуйте! Доставка занимает от четырёх до шести недель.'), 'ru');
check('русский ответ русскому клиенту не помечен',
  wrongLanguage('Здравствуйте! Доставка занимает от четырёх до шести недель.', 'ru'), false);
check('русский ответ румынскому клиенту помечен',
  wrongLanguage('Здравствуйте! Доставка занимает от четырёх до шести недель.', 'ro'), true);
check('немецкий опознан',
  detectLocale('Die Lieferung dauert vier bis sechs Wochen und ist nicht im Preis enthalten.'), 'de');

// ── Осторожность: короткое и неоднозначное не судим ──────────────────────
check('короткий ответ не судим', detectLocale('Da.'), null);
check('короткий ответ не помечен', wrongLanguage('Da, desigur.', 'ro'), false);
check('цифры и названия не судим', detectLocale('180×200 — 11.110 lei'), null);
check('пустая строка не судима', detectLocale(''), null);
check('названия товаров не судим', detectLocale('Pat Allure Life, Pat Imperial Lux, Pat Belle Moon'), null);

// ── Несколько допустимых языков ──────────────────────────────────────────
//
// Отловлено на живом запросе: короткий вопрос определить нельзя, охрана
// откатывалась к locale виджета и отвергала правильный румынский ответ
// у посетителя с русским браузером.
check('румынский ответ допустим, если румынский среди допустимых',
  wrongLanguage('Toate produsele noastre beneficiază de o garanție standard de 3 ani și o durată de 15 ani.', ['ru', 'ro']),
  false);
check('английский ответ отвергается, если английского среди допустимых нет',
  wrongLanguage("Apologies, but I don't have that information in the knowledge base for you.", ['ru', 'ro']),
  true);
check('английский ответ допустим, если посетитель писал по-английски',
  wrongLanguage("Apologies, but I don't have that information in the knowledge base for you.", ['en', 'ro']),
  false);

// ── Буфер потока ─────────────────────────────────────────────────────────
//
// Проверяется главное: ничего не теряется. Придержанный текст обязан дойти
// до посетителя — и когда его хватило на решение, и когда ответ кончился
// раньше пробы.
function fakeReply(): { reply: FastifyReply; sent: () => string } {
  const chunks: string[] = [];
  const reply = {
    raw: {
      write(line: string) {
        const m = /^data: (.+)$/m.exec(line);
        if (m) chunks.push((JSON.parse(m[1]!) as { t: string }).t);
      },
    },
  } as unknown as FastifyReply;
  return { reply, sent: () => chunks.join('') };
}

{
  const { reply, sent } = fakeReply();
  const guard = createStreamGuard(reply, ['ro']);
  const text = 'Toate produsele noastre beneficiază de o garanție standard de 3 ani, iar durata medie de utilizare este de 15 ani.';
  for (const ch of text.match(/.{1,7}/g) ?? []) guard.push(ch);
  guard.settle();
  check('длинный румынский доходит целиком', sent(), text);
  check('длинный румынский не отклонён', guard.rejected, false);
}

{
  // Ответ короче пробы: решение принимается только в settle(), и без него
  // текст навсегда остался бы в буфере. Это была настоящая ошибка в первой
  // версии — короткие ответы посетитель не увидел бы вовсе.
  const { reply, sent } = fakeReply();
  const guard = createStreamGuard(reply, ['ro']);
  guard.push('Da, desigur.');
  check('короткий ответ ещё не отдан', sent(), '');
  guard.settle();
  check('короткий ответ доходит после settle', sent(), 'Da, desigur.');
}

{
  const { reply, sent } = fakeReply();
  const guard = createStreamGuard(reply, ['ro']);
  const leak = "Apologies, but I don't have information about deliveries to France or the timelines for that.";
  let stopped = false;
  for (const ch of leak.match(/.{1,7}/g) ?? []) {
    if (!guard.push(ch)) { stopped = true; break; }
  }
  check('протечка остановлена на середине', stopped, true);
  check('протечка помечена', guard.rejected, true);
  check('посетителю не ушло ни знака', sent(), '');
}

console.log(failed === 0 ? '\nОПРЕДЕЛИТЕЛЬ ЯЗЫКА OK' : `\nОПРЕДЕЛИТЕЛЬ ЯЗЫКА: ошибок ${failed}`);
process.exit(failed === 0 ? 0 : 1);
