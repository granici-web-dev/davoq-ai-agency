/**
 * Страница на месте снесённой панели.
 *
 * Заголовком `Location` обойтись нельзя: якорь браузер серверу не посылает,
 * а в каждом уже отправленном письме о заявке стоит `/admin#chats/<id>`.
 * Прочитать якорь может только браузер, поэтому переадресация — несколько
 * строк разметки, и старые письма продолжают открывать нужный разговор.
 *
 * Отдельным модулем ради проверки: содержимое `<script>` собирается строками
 * и компилятором не разбирается вовсе. Первая версия этого кода читала якорь
 * регулярным выражением, оно жило внутри шаблонной строки, прошло два уровня
 * экранирования, и `\w` доехал до браузера как `w` — ссылка из письма молча
 * открывала корень кабинета. Ни типы, ни сборка этого не видели.
 */

/** Куда уводит якорь старой панели или строка запроса. */
export function movedPage(portalBase: string, query: string): string {
  return (
    `<!doctype html><meta charset="utf-8"><title>…</title>` +
    `<script>${redirectScript(portalBase, query)}</script>` +
    `<p>Cabinetul s-a mutat. <a href="${portalBase}">Continuați aici</a>.</p>`
  );
}

/**
 * Тело переадресации. Разбор строками, а не регулярным выражением — см. выше.
 */
export function redirectScript(portalBase: string, query: string): string {
  return (
    `(function(){` +
    `var b=${JSON.stringify(portalBase)},h=location.hash,q=${JSON.stringify(query)};` +
    `var p="#chats/",id=h.indexOf(p)===0?h.slice(p.length):"";` +
    `var to=id?b+"/agents/chatbot/conversations?conversation="+encodeURIComponent(id)` +
    `:h==="#subscription"?b+"/subscription":b+q;` +
    `location.replace(to);})();`
  );
}
