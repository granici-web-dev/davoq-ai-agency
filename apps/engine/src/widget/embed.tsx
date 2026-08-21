/** @jsxImportSource preact */
import { render } from 'preact';
import { App } from './App.js';
import { CSS } from './styles.js';

/**
 * Точка входа (§9): один <script>. Всё живёт в Shadow DOM — стили страницы клиента
 * не протекают внутрь, наши не протекают наружу.
 */
const script = document.currentScript as HTMLScriptElement | null;
const publicKey = script?.dataset.key ?? '';
// База берётся из адреса самого скрипта: клиенту нечего настраивать, а мы можем
// сменить домен CDN, не трогая вставленный на сайт сниппет.
const base = script?.src ? new URL(script.src).origin : location.origin;

if (!publicKey) {
  console.error('[assistwidget] missing data-key on the <script> tag');
} else {
  const host = document.createElement('div');
  host.setAttribute('data-assistwidget', '');
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const mount = document.createElement('div');
  shadow.appendChild(mount);
  render(<App base={base} publicKey={publicKey} />, mount);
}
