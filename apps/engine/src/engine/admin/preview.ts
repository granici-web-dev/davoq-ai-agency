import { CSS } from '../widget/styles.js';
import { toCssVars, type Theme } from '../shared/theme.js';

/**
 * Статичное превью виджета для экрана Appearance (§10). Стили и переменные берутся
 * из тех же модулей, что и у живого виджета, поэтому цвета в превью не могут разойтись
 * с тем, что увидит посетитель.
 *
 * Переписки здесь нет намеренно: экран настраивает внешний вид, а живой чат из админки
 * потребовал бы внести домен панели в allowlist тенанта — дыру ради демонстрации.
 */
export function previewSrcDoc(opts: {
  theme: Theme;
  botName: string;
  welcome: string;
  disclosure: string;
  placeholder: string;
  send: string;
}): string {
  const vars = Object.entries(toCssVars(opts.theme))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:transparent}${CSS.replace(':host', ':root')}
.root{position:static;display:flex;justify-content:center;padding:12px}</style>
<div class="root" style="${escapeAttr(vars)}">
  <div class="panel">
    <div class="header"><span class="name">${escapeHtml(opts.botName)}</span><span class="iconbtn">×</span></div>
    <div class="log">
      <div class="msg bot">${escapeHtml(opts.welcome)}</div>
      <div class="msg user">${escapeHtml(opts.placeholder)}</div>
      <div class="msg bot">Lorem ipsum — un exemplu de răspuns al asistentului în tema aleasă.</div>
    </div>
    <div class="form"><input placeholder="${escapeAttr(opts.placeholder)}"><span class="send">${escapeHtml(opts.send)}</span></div>
    <div class="disclosure">${escapeHtml(opts.disclosure)}</div>
  </div>
</div>`;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const escapeAttr = escapeHtml;
