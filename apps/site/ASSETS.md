# ASSETS.md — план визуалов

Составлено на этапе 2, **до генерации**. Ни один кредит не потрачен.
Баланс на момент составления: **185.85 кредитов** (Higgsfield, план starter).

---

## 1. Творческая идея серии

Все фотографии сайта — одна серия с одним сюжетом: **рабочее место после закрытия,
где свет всё ещё горит**.

Пустой шоурум, мастерская, кабинет — ночью, без людей, с одним включённым
источником света. Это буквально то, что продаёт платформа: работа продолжается,
когда сотрудники ушли домой. Ни одного слова об этом писать не нужно — кадр
говорит сам.

Почему не абстрактные 3D-градиенты, как в референсе cosmoq: у cosmoq продукт
абстрактный, и абстрактная графика — честное его изображение. У нас покупатель —
владелец мебельного производства или дилерского центра в Кишинёве. Абстрактный
градиент для него означает «очередной SaaS», а собственный тёмный цех в кадре
означает «это про меня». Ритм, типографику и уровень качества берём у референса;
язык изображений — свой.

Чего в кадрах не будет никогда: голограмм, плат, роботов, светящихся мозгов,
неонового киберпанка, графиков и «данных в воздухе». Это визуальный словарь,
которым пользуются все продавцы ИИ, и именно поэтому он ничего не значит.

**Лиц в кадре нет.** Не из стилистики: сгенерированное лицо на промо-сайте — это
риск получить неживого человека, которого посетитель заметит раньше заголовка.
Люди либо отсутствуют, либо — далёкий неосвещённый силуэт.

**Текста в кадре нет.** Ни вывесок, ни этикеток, ни экранов с интерфейсом.
Генеративный текст выходит с артефактами, и один кривой символ обесценивает
всю страницу.

---

## 2. Базовый стилевой промпт

Дописывается **к каждой** генерации изображения, без изменений.

```
STYLE: Photographic, full-frame camera, 35mm lens, natural optics. Late evening
or pre-dawn darkness; the scene is lit by one or two practical light sources
inside the frame — warm amber, cool blue or soft violet — falling across matte,
real materials. Deep near-black shadows, no lifted blacks, no grey haze, no HDR,
no glossy CGI sheen. Calm, wide, symmetrical-leaning composition with a large
area of empty darkness in the upper third of the frame. Subtle film grain.
Colour of light strictly limited to amber #f0a04b, blue #4d8ff5, violet #7b5cf0
against a near-black #060607 base.
NEGATIVE: no text, no letters, no numbers, no logos, no signage, no brand marks,
no screens, no user interfaces, no charts; no human faces, no people in focus;
no holograms, no circuit boards, no robots, no glowing brains, no neon cyberpunk,
no futuristic sci-fi elements, no data visualisation, no lens flare artefacts.
```

Пустая тёмная зона в верхней трети — не эстетика, а требование вёрстки: там
стоит заголовок. Без неё каждый кадр придётся глушить чёрной плёнкой поверх,
и половина заплаченного за картинку исчезнет.

---

## 3. Модель и цена

**Все изображения — `nano_banana_pro`, 2K, 2 кредита за штуку.**

Одна модель на всю серию сознательно: единство светового почерка между
шестью страницами индустрий важнее, чем максимум качества в одном кадре.
Смешаешь модели — получишь шесть картинок из разных фотобанков.

**Видео — `kling3_0`**, режим `std`, `sound: off`, 5 секунд, стартовый кадр —
уже сгенерированный герой главной. Точная цена в истории транзакций
отсутствует; оценка **20–30 кредитов**. Сверю баланс до и после и укажу факт.

---

## 4. Список визуалов

### 4.1. Главная

| № | Файл | Секция | Назначение | Формат |
|---|---|---|---|---|
| 1 | `hero-home.jpg` | Герой | Первый экран, подложка под заголовок | 21:9, 2K |
| 2 | `hero-loop.mp4` / `.webm` | Герой | Живая версия того же кадра, 5 с, без звука | 16:9, 1280×548 |

**Промпт №1:**
```
A quiet empty street at blue hour, seen from across the road. A single
ground-floor commercial window is still lit from inside with warm amber light —
the only lit window on the whole dark facade. Wet asphalt holds a long soft
reflection of that light. The rest of the building is unlit stone and glass in
deep blue shadow. Wide cinematic framing, the lit window sitting low and slightly
left, the upper half of the frame is dark sky and dark facade.
```

**Видео №2:** стартовый кадр — файл `hero-home.jpg`.
```
Almost imperceptible motion: a very slow push-in, faint drift of rain haze
through the warm light, a subtle shift in the reflection on the wet asphalt.
The camera barely moves. Nothing enters or leaves the frame. Loopable.
```
Видео — единственное на сайте, как и договаривались. Оно даёт первому экрану
жизнь, а `hero-home.jpg` служит ему постером и заменой при `prefers-reduced-motion`.
Отдельный кадр под постер не генерируется.

### 4.2. Страницы индустрий (6)

Один сюжет на шесть кадров: то же место, тот же час, разные ремёсла.

| № | Файл | Страница | Формат |
|---|---|---|---|
| 3 | `industry-mobilier.jpg` | `/industries/mobilier` | 16:9, 2K |
| 4 | `industry-constructii.jpg` | `/industries/constructii` | 16:9, 2K |
| 5 | `industry-imobiliare.jpg` | `/industries/imobiliare` | 16:9, 2K |
| 6 | `industry-auto.jpg` | `/industries/auto` | 16:9, 2K |
| 7 | `industry-energie.jpg` | `/industries/energie` | 16:9, 2K |
| 8 | `industry-clinici.jpg` | `/industries/clinici` | 16:9, 2K |

**№3 — мебель и кухни на заказ:**
```
A custom kitchen showroom after closing time. One warm pendant lamp left on
above a long stone worktop; oak cabinetry and brushed metal handles fall away
into darkness on both sides. Cool blue night light from a window at the far end.
Unbranded, no appliances with visible controls.
```

**№4 — ремонт и дизайн интерьера:**
```
An apartment in the middle of renovation, at dusk. Bare plaster walls, a folded
aluminium ladder, a roll of protective film on the floor. A single work lamp on
a tripod throws warm light across the raw wall; fine dust hangs in its beam.
Cold blue evening light through an uncurtained window.
```

**№5 — застройщики и агентства недвижимости:**
```
The facade of a nearly finished residential building at blue hour, seen from
below. Most windows are dark; three or four on different floors are lit warm
from inside. Bare concrete balconies, clean modern geometry, a construction
crane silhouetted against the deep blue sky at the edge of frame.
```

**№6 — автодилеры:**
```
A car showroom at night. One unbadged modern sedan stands under a single
overhead light; the polished floor holds its reflection. Glass walls behind it
are black with the night outside, a cool blue spill along the far wall. No
badges, no grille emblems, no wheel-centre marks, no price stands.
```

**№7 — солнечные панели и HVAC:**
```
A flat commercial rooftop covered with rows of solar panels, shot at first
light. The sky is still deep blue-black; a narrow warm amber band of sunrise
sits on the horizon and catches the top edge of the nearest panel frames.
Air handling units in silhouette at the far edge of the roof.
```

**№8 — стоматология и эстетическая медицина:**
```
An empty treatment room at night. One soft warm light left on above a clean
seamless work surface; a dental chair in silhouette, cool blue light from a
corridor through the half-open door. Sterile, calm, nothing clinical in focus.
No instruments in close-up, no patient, no staff.
```

### 4.3. Страницы агентов (6)

Здесь фотография работает как фон под содержанием, не как иллюстрация
механизма. Поэтому кадры плотнее, теснее и без глубины — это натюрморты,
а не интерьеры.

| № | Файл | Страница | Формат |
|---|---|---|---|
| 9 | `agent-chatbot.jpg` | `/agents/chatbot` | 16:9, 2K |
| 10 | `agent-configurator.jpg` | `/agents/configurator` | 16:9, 2K |
| 11 | `agent-crm-assistant.jpg` | `/agents/crm-assistant` | 16:9, 2K |
| 12 | `agent-follow-up.jpg` | `/agents/follow-up` | 16:9, 2K |
| 13 | `agent-order-status.jpg` | `/agents/order-status` | 16:9, 2K |
| 14 | `agent-content-engine.jpg` | `/agents/content-engine` | 16:9, 2K |

**№9 — чат-бот:** `An empty reception desk at night, one small lamp still on at
its edge, a dark stone counter, an unoccupied chair behind it, the lobby beyond
in blue darkness.`

**№10 — конфигуратор запроса:** `A designer's worktable under one warm lamp:
fabric swatches, oak and walnut veneer samples and stone tiles fanned out in an
overlapping arc across the dark tabletop. No printed labels on any sample.`

**№11 — ассистент CRM:** `A clean dark desk under a single lamp: one open
notebook with completely blank pages, a closed pen beside it, a shallow tray.
Everything else in shadow.`

**№12 — автоматический follow-up:** `A phone lying face down on a dark table
next to a cup of coffee that has gone cold, late evening. Warm lamp light from
one side, blue window light from the other. The screen is not visible.`

**№13 — статус заказа:** `A wooden crate strapped and ready on a workshop
floor at night, one overhead lamp above it, the rest of the workshop in
darkness. No printed labels, no markings on the crate.`

**№14 — контент-движок:** `A corner of a small photo studio at night: one
softbox glowing, a seamless paper backdrop curving to the floor, an empty stool.
Nothing else lit.`

### 4.4. Резерв — генерируется только по вашему слову

| № | Файл | Страница | Формат |
|---|---|---|---|
| 15 | `about-hero.jpg` | `/about` | 21:9, 2K |

`/about` может обойтись типографикой. Если решим, что нужен кадр — тот же
сюжет, снятый шире: несколько освещённых окон в тёмном квартале.

### 4.5. Чего в списке нет намеренно

**OG-картинки (1200×630) не генерируются.** Их будет рисовать код — через
`ImageResponse` из `next/og`, типографикой по фирменному градиенту. Причины,
в порядке важности: главный элемент OG-картинки — это заголовок страницы, а
текст в генеративной модели выходит с артефактами; таких картинок нужно ~15,
то есть 30 кредитов за то, что код делает бесплатно; и при любой правке
заголовка сгенерированная картинка молча устаревает, а собранная кодом —
обновляется сама. **Экономия: 30 кредитов.**

**Скриншоты интерфейса агентов не генерируются.** Виджет, окно чата, шаги
конфигуратора — это вёрстка на странице, живая и на своём шрифте. Генерировать
изображение интерфейса значит получить нечитаемый текст в кадре.

**Иконки и логотип не генерируются.** Иконки — inline SVG. Логотип — вопрос
отдельный, связанный с названием (см. ниже).

**Фотографии людей, клиентов, команды не генерируются.** Ни одного лица на
сайте не будет, пока не появятся настоящие фотографии настоящих людей.

**Логотипов клиентов, отзывов и цифр вроде «300+ команд» не будет** — их нет.
Вместо них на главной секция «Program pilot»: платформа обкатывается на
пилотном клиенте в производстве мебели на заказ, клиент не назван.

---

## 5. Смета

| Позиция | Кол-во | Цена | Итого |
|---|---|---|---|
| Изображения `nano_banana_pro` 2K | 14 | 2 | **28** |
| Видео `kling3_0` std, 5 с, без звука | 1 | ~20–30 | **~25** |
| **Базовый план** | | | **~53** |
| Запас на перегенерации (макс. 2 на кадр) | до 28 | 2 | до 56 |
| Резерв `about-hero` | 1 | 2 | 2 |
| **Потолок худшего случая** | | | **~111** |

Баланс 185.85. Даже при худшем сценарии остаётся более 70 кредитов.
Реалистичный расход — 55–70: перегенерировать все кадры не придётся.

**Правила расхода, как договаривались:** один вариант на кадр; при неудаче
максимум две перегенерации, дальше останавливаюсь и спрашиваю; генерация
батчами; файл, который уже лежит в `public/`, не перегенерируется никогда;
в конце — отчёт по количеству и фактически списанным кредитам.

---

## 6. Что происходит с файлом после скачивания

1. Оригинал скачивается в `public/images/` под именем из таблицы.
2. `sharp` пережимает: AVIF q50 и WebP q75, ширина 2400 px для героя,
   1600 px для секций. Оригинал остаётся в репозитории как исходник.
3. В вёрстке — `next/image` со статическим импортом: размеры попадают в
   разметку на сборке, и страница не дёргается при загрузке.
4. Видео: H.264 MP4 + VP9 WebM, 1280×548, **звуковая дорожка удаляется
   физически**, не просто `muted`. Цель — до 1.5 МБ.
   `autoplay muted playsinline loop preload="metadata"`, `poster` — герой.
   При `prefers-reduced-motion: reduce` видео не подключается вовсе,
   остаётся постер.

Тёмная картинка под тёмный сайт — редкий случай, когда сжатие работает на нас:
в кадре почти нет высокочастотных деталей, и AVIF ужимает такие сцены сильно.

---

## 7. Один вопрос, который лучше решить до генерации

**Название.** Сейчас в `messages/{ro,en}.json` под `brand.name` стоит
`AssistWidget` — как заглушка. На сгенерированные картинки это не влияет
(текста в них нет, OG рисует код), так что генерации это не блокирует. Но
название стоит в заголовке каждой страницы, в подвале и в шапке, и менять
его после публикации сайта хуже, чем до. Скажите, если оно другое.

---

## Статус

**Ожидает утверждения.** По слову «утверждаю» — генерирую батчами:
сначала герой (№1), после вашего взгляда на него — шесть индустрий (№3–8),
затем шесть агентов (№9–14), последним видео (№2), потому что оно строится
на утверждённом герое.
