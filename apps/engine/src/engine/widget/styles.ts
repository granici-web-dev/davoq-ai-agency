/**
 * Стили виджета. Живут строкой, потому что попадают в Shadow DOM (§9): страница клиента
 * не может их переопределить, а они не могут поломать страницу клиента.
 * Всё цветное берётся из CSS-переменных — их считает contrast guard, а не тенант.
 */
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: var(--cw-font); }

.root { position: fixed; bottom: 20px; z-index: 2147483000; }
.root[data-pos="bottom-right"] { right: 20px; }
.root[data-pos="bottom-left"]  { left: 20px; }

.launcher {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px; border: 0; cursor: pointer;
  border-radius: 999px; font-size: 15px; font-weight: 500;
  background: var(--cw-primary); color: var(--cw-on-primary);
  box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
  /* То же имя стоит и на кнопке запуска: без потолка она уезжает за экран. */
  max-width: calc(100vw - 40px);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.launcher:focus-visible, .iconbtn:focus-visible, .send:focus-visible,
input:focus-visible, button:focus-visible {
  outline: 2px solid var(--cw-primary); outline-offset: 2px;
}

.panel {
  display: flex; flex-direction: column;
  width: min(380px, calc(100vw - 40px));
  height: min(560px, calc(100vh - 120px));
  background: var(--cw-bg); color: var(--cw-text);
  border-radius: var(--cw-radius); overflow: hidden;
  box-shadow: 0 12px 48px rgb(0 0 0 / 24%);
}

.header {
  display: flex; align-items: center; gap: 10px; padding: 14px 16px;
  background: var(--cw-primary); color: var(--cw-on-primary);
}
/* Имя бота задаёт клиент, и оно бывает длинным. Без обрезки длинное имя
   выдавливало крестик за границу панели — посетитель не мог закрыть чат. */
.header .name {
  font-weight: 600; font-size: 15px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.header .iconbtn { flex: none; }
.avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.iconbtn {
  background: transparent; border: 0; cursor: pointer; padding: 4px;
  color: inherit; font-size: 20px; line-height: 1;
}

.log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 82%; padding: 10px 13px; border-radius: 14px; font-size: 14px;
       line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.bot  { align-self: flex-start; background: var(--cw-bot-bubble);  color: var(--cw-on-bot-bubble); }
.msg.user { align-self: flex-end;   background: var(--cw-user-bubble); color: var(--cw-on-user-bubble); }
.msg.note { align-self: center; background: transparent; font-size: 13px; opacity: .75; text-align: center; }

.typing { display: flex; gap: 4px; align-self: flex-start; padding: 12px 14px;
          background: var(--cw-bot-bubble); border-radius: 14px; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: currentColor;
            opacity: .45; animation: cw-blink 1.2s infinite; }
.typing i:nth-child(2) { animation-delay: .2s; }
.typing i:nth-child(3) { animation-delay: .4s; }
@keyframes cw-blink { 0%,60%,100% { opacity: .25 } 30% { opacity: .9 } }
@media (prefers-reduced-motion: reduce) { .typing i { animation: none } }

.form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgb(128 128 128 / 22%); }
input {
  flex: 1; padding: 10px 12px; font-size: 14px;
  border: 1px solid rgb(128 128 128 / 35%); border-radius: 10px;
  background: transparent; color: inherit;
}
.send {
  border: 0; cursor: pointer; padding: 10px 16px; border-radius: 10px;
  font-size: 14px; font-weight: 500;
  background: var(--cw-primary); color: var(--cw-on-primary);
}
.send[disabled] { opacity: .5; cursor: default; }

.lead { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.lead .hint { font-size: 13px; opacity: .8; }
.lead .err  { font-size: 13px; color: #b91c1c; }

/* AI Act Art. 50(1): постоянная надпись, а не подсказка по наведению. */
.disclosure { padding: 7px 12px 10px; font-size: 11px; opacity: .7; text-align: center; }
.retry { background: transparent; border: 1px solid currentColor; border-radius: 8px;
         padding: 6px 12px; font-size: 13px; cursor: pointer; color: inherit; }

/* Конфигуратор. Цвета — те же переменные, что у чата: у тенанта одна марка,
   и второй набор ручек означал бы два разных виджета на одном сайте. */
.cfg { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cfg-top { padding: 12px 16px 0; }
.cfg-count { font-size: 12px; opacity: .7; }
.cfg-bar { height: 3px; margin-top: 6px; border-radius: 2px; background: rgb(128 128 128 / 22%); }
.cfg-bar i { display: block; height: 100%; border-radius: 2px; background: var(--cw-primary);
             transition: width .2s ease; }
@media (prefers-reduced-motion: reduce) { .cfg-bar i { transition: none } }

.cfg-body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex;
            flex-direction: column; gap: 10px; }
.cfg-title { margin: 0 0 2px; font-size: 15px; font-weight: 600; }

.cfg-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cfg-swatches { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cfg-opt {
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
  padding: 10px; cursor: pointer; text-align: left; font: inherit; font-size: 13px;
  color: inherit; background: transparent;
  border: 1px solid rgb(128 128 128 / 30%); border-radius: 12px;
}
.cfg-opt img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }
.cfg-swatches .cfg-opt { padding: 6px; align-items: center; text-align: center; font-size: 11px; }
.cfg-swatches .cfg-opt img { aspect-ratio: 1; }
/* Выбранное отмечено рамкой И заливкой: одна рамка в цвете марки неразличима
   на монохромной палитре, а такую палитру выбрал первый же клиент. */
.cfg-opt.on { border-color: var(--cw-primary); box-shadow: inset 0 0 0 1px var(--cw-primary);
              background: color-mix(in srgb, var(--cw-primary) 10%, transparent); }

.cfg-number { display: flex; align-items: center; gap: 8px; }
.cfg-number input { flex: 1; }
.cfg-unit { font-size: 13px; opacity: .7; }
.cfg-text {
  min-height: 84px; padding: 10px 12px; font: inherit; font-size: 14px; resize: vertical;
  border: 1px solid rgb(128 128 128 / 35%); border-radius: 10px;
  background: transparent; color: inherit;
}

.cfg-nav { display: flex; align-items: center; gap: 8px; padding: 12px;
           border-top: 1px solid rgb(128 128 128 / 22%); }
.cfg-ghost { background: transparent; border: 1px solid rgb(128 128 128 / 35%);
             border-radius: 10px; padding: 10px 14px; font-size: 14px; cursor: pointer;
             color: inherit; }
.cfg-ghost[disabled] { opacity: .4; cursor: default; }
.cfg-price { flex: 1; display: flex; flex-direction: column; align-items: center;
             font-size: 14px; line-height: 1.2; }
.cfg-price i { font-style: normal; font-size: 11px; opacity: .7; }
.cfg-sum { display: flex; align-items: baseline; gap: 6px; }
.cfg-sum s { font-size: 12px; opacity: .55; }
.cfg-promo { color: var(--cw-primary); opacity: 1; }
.send.wide { flex: 1; }

.cfg-list { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.cfg-list div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.cfg-list dt { opacity: .7; }
.cfg-list dd { margin: 0; text-align: right; }
.cfg-link { background: transparent; border: 0; padding: 0 0 0 8px; cursor: pointer;
            font: inherit; font-size: 12px; color: var(--cw-primary); text-decoration: underline; }
.cfg-total { display: flex; justify-content: space-between; align-items: center; margin: 6px 0 2px;
             padding-top: 10px; border-top: 1px solid rgb(128 128 128 / 22%); font-size: 14px; }
.cfg-total .cfg-price { flex: none; align-items: flex-end; }
.cfg-total b { font-size: 17px; }
.cfg-check { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.4; }
.cfg-check input { flex: none; width: 16px; height: 16px; margin-top: 1px; }
.cfg-summary .hint { font-size: 13px; opacity: .8; margin-top: 4px; }
.cfg-summary .err { font-size: 12px; color: #b91c1c; }
.cfg-ask-open { align-self: flex-start; margin-top: 4px; padding: 0; font-size: 12px; }
.cfg-ask { display: flex; flex-direction: column; gap: 8px; margin-top: 8px;
           padding-top: 12px; border-top: 1px solid rgb(128 128 128 / 20%); }
.cfg-ask-row { display: flex; gap: 8px; }
.cfg-ask-row input { flex: 1; }
.cfg-ask-row .send { padding: 10px 14px; }
.cfg-answer { margin: 0; padding: 10px 13px; border-radius: 14px; font-size: 13px;
              line-height: 1.5; background: var(--cw-bot-bubble); color: var(--cw-on-bot-bubble); }
.cfg-answer.pending { opacity: .6; }
.cfg-done { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;
            text-align: center; font-size: 14px; }

/* Окно оферты.
   Намеренно НЕ похоже на чат: чат — это угловой пузырь на 380 px, который
   ведёт разговор; здесь посетитель собирает изделие и смотрит на цену, и
   ему нужны крупные карточки, картинки и вся конфигурация перед глазами.
   Один и тот же прямоугольник в углу под обе задачи означал бы, что вторая
   задача просто не влезла. */
.ofr-overlay {
  position: fixed; inset: 0; z-index: 2147483001; padding: 16px;
  display: flex; align-items: center; justify-content: center;
  background: rgb(0 0 0 / 45%);
}
.ofr {
  display: flex; flex-direction: column;
  width: min(760px, 100%);
  /* Высота от содержимого: на развилке две карточки, и растянутое до 660 px
     окно выглядело бы недогрузившимся. Полную высоту берёт только
     конфигуратор — там шаги должны стоять на месте от шага к шагу. */
  height: auto; max-height: min(660px, 100%);
  background: var(--cw-bg); color: var(--cw-text);
  border-radius: var(--cw-radius); overflow: hidden;
  box-shadow: 0 24px 64px rgb(0 0 0 / 32%);
}
.ofr[data-screen="configure"] { height: min(660px, 100%); }
.ofr-head { display: flex; align-items: center; gap: 10px; padding: 16px 20px;
            background: var(--cw-primary); color: var(--cw-on-primary); }
.ofr-head .name { flex: 1; min-width: 0; font-weight: 600; font-size: 16px;
                  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ofr-split { flex: 1; min-height: 0; display: flex; }
.ofr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ofr-rail { width: 232px; flex: none; overflow-y: auto; padding: 16px;
            border-left: 1px solid rgb(128 128 128 / 20%); font-size: 13px; }
.ofr-rail h4 { margin: 0 0 10px; font-size: 12px; font-weight: 600; opacity: .6;
               text-transform: uppercase; letter-spacing: .04em; }
.ofr-rail dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ofr-rail dt { font-size: 11px; opacity: .6; }
.ofr-rail dd { margin: 0; }
.ofr-rail .pending { opacity: .35; }
@media (max-width: 720px) { .ofr-rail { display: none } }

/* Запасной ход: конфигуратор не отдался — остаётся форма заявки. */
.ofr-fallback { flex: 1; display: flex; flex-direction: column; justify-content: center;
                gap: 14px; padding: 28px 24px; }

/* В широком окне карточек помещается больше двух — сетка считает сама. */
.ofr .cfg-cards { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.ofr .cfg-swatches { grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); }
.ofr .cfg-body { padding: 18px 20px; }
.ofr .cfg-top { padding: 14px 20px 0; }
.ofr .cfg-nav { padding: 14px 20px; }
.ofr .cfg-title { font-size: 17px; }
`;
