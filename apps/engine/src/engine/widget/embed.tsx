/** @jsxImportSource preact */
import { render } from 'preact';
import { App, CONFIGURATOR_EVENT } from './App.js';
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

  /**
   * Вход в конфигуратор с сайта клиента.
   *
   * Кнопка живёт в его вёрстке — на странице товара, рядом с его собственной
   * «Cere ofertă», — поэтому мы даём два способа её связать и ни одного
   * своего элемента:
   *   <button data-assistwidget-configurator>Configurator</button>
   *   assistwidget.configurator()
   *
   * Делегированный слушатель, а не обход элементов при загрузке: карточки
   * товара на их сайте дорисовываются скриптом магазина, и кнопки, которых
   * в момент загрузки не было, иначе не работали бы вовсе.
   */
  const openConfigurator = (): void => {
    document.dispatchEvent(new CustomEvent(CONFIGURATOR_EVENT));
  };
  document.addEventListener('click', (e) => {
    const target = (e.target as Element | null)?.closest?.('[data-assistwidget-configurator]');
    if (!target) return;
    e.preventDefault();
    openConfigurator();
  });
  (window as unknown as { assistwidget?: { configurator: () => void } }).assistwidget = {
    configurator: openConfigurator,
  };
}
