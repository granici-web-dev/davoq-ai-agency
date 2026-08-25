# Конкурентный анализ рынка AI-чатботов для сайтов (EU/DACH/Молдова-Румыния), август 2026

## TL;DR
- **Ниша «EU-hosting + живой CRM tool-calling + white-label + €100–400/мес» реально полупустая.** US-реселлеры (Stammer, FastBots, BotPenguin) сильны по white-label, но не гарантируют EU-only residency по DPA; DACH-DSGVO-нативы (moinAI ~790€/мес, BOTfriends от 2 490€/мес, melibo от ~500€/мес) не имеют reseller-модели и дороги; настоящий EU-hosted white-label с tool-calling есть лишь у нишевых WebChatAgent (от €29/мес, хостинг DE) и ConvoCore (регион Frankfurt) — рынок фрагментирован и в точке пересечения всех четырёх критериев не занят.
- **Зрелый function-calling в произвольные API есть у немногих:** Chatbase (Custom Actions, лимит ответа 20KB, но однонаправленно и с жалобами на надёжность), Botpress, Voiceflow (через webhook), Tidio Lyro (Actions), GoHighLevel (Voice AI Custom Actions) — но у большинства DACH-нативов его нет. Комбинация «зрелый tool-calling + EU-hosting + white-label» практически отсутствует — это ядро возможности для нового продукта.
- **EU AI Act Article 50** (в силе с 02.08.2026; Комиссия приняла финальные 51-страничные Guidelines 20.07.2026; штраф до **€15 млн или 3% мирового оборота, что больше**, для SME/стартапов применяется меньшая из сумм) делает обязательным раскрытие «я — ИИ» — это compliance-крючок для продаж, а не проблема для продукта: одна постоянная надпись в виджете закрывает Art. 50(1).

## Key Findings

1. **Единица биллинга — главный фактор экономики.** Рынок раскололся на 5 моделей: кредиты/сообщения (Chatbase, Voiceflow, Botpress), per-conversation (Tidio), per-resolution/outcome (Intercom Fin $0.99), seat-based (Zendesk, Intercom) и flat/wallet (Stammer, GoHighLevel, DACH-нативы). Кредитные модели «наказывают за успех» — чем лучше работает бот, тем выше счёт.
2. **EU-residency по DPA (не по маркетингу) реально гарантируют немногие:** Crisp (NL+DE, DPA публичный), moinAI (Германия, Hetzner/OVHcloud, AVV по Art. 28), melibo (Azure Frankfurt), Lime Connect (Кёльн, EU-хостинг), WebChatAgent (Германия), Robofy (EU/Ireland — self-statement), ConvoCore (Frankfurt-регион). US-платформы (Chatbase, Stammer, FastBots, Botsify, CustomGPT) подпишут DPA/SCC, но по умолчанию хостятся в США и подпадают под CLOUD Act. Tidio — польская, EU-хостинг, но с US-субъектом (Tidio LLC) и DPF/SCC.
3. **White-label reseller-экономика:** платформенные fees $97–497/мес (GoHighLevel $497 SaaS Mode, Stammer $197 Agency/$497 SaaS, FastBots $399, BotPenguin от $1 500/год, ConvoCore ~$220, Insighto $299) против типичных клиентских $99–500/мес; маржа 75–90% после 5 клиентов; setup fees $300–1 500; break-even обычно на 2–3 клиентах.
4. **DACH-нативы дороги и без reseller-модели** — это структурное «белое пятно» для соло-фаундера.
5. **Молдова «Ana» (CNAM):** запущена 15.06.2026 в пилоте на cnam.md; разработчик публично не назван (проверено по тендерам и пресс-релизам).

## Details

### Сегмент 1 — DIY (документы → бот)

Все цены проверены на живых страницах/reviews на дату 19.08.2026, кроме отмеченных unverified:

| Вендор | Входная цена | Ключевые тарифы | Единица | White-label | EU-residency | Live-data | Рейтинг | Флаг |
|---|---|---|---|---|---|---|---|---|
| Chatbase | Free (50 credits) | Hobby $40, Standard $150, Pro $500/мес (annual: $32/$120/$400) | message credits (1–6/ответ по модели) | снятие брендинга $39–199/мес, custom domain $59/мес; WL только Enterprise | ❌ AWS US, SOC2 II, GDPR-processing, no-training | ✅ Custom Actions (любой REST API, ответ ≤20KB) | G2 4.7–4.8, Capterra 4.3–4.6, Trustpilot ~2.1 | verified |
| SiteGPT | $39/мес (annual) | $39/$79/$259 (реально $59/$129/$429 monthly) | сообщения (10x разброс по модели) | WL для агентств на выс. тарифах | ❌ US | ограниченные интеграции, нет native CRM | Capterra малый объём | verified |
| CustomGPT.ai | $99/мес (annual $89) | Standard $99, до $499; Enterprise custom | queries/credits | WL-платформа для агентств | ❌ US, SOC2 II, GDPR, no-training | 100+ интеграций, API | Capterra высокий | verified |
| Botsonic (Writesonic) | от низкого | message caps на low tiers | сообщения | часть Writesonic-сюиты | ❌ US | интеграции | — | unverified |
| Chatling | один из самых дешёвых | — | сообщения | — | ❌ US | лёгкие интеграции | — | unverified |
| Dante AI | — | — | сообщения/credits | — | ❌ US | — | — | unverified |
| SiteSpeak.ai | — | live chat + escalation в комплекте | credits на low tiers | — | ❌ US | — | — | unverified |
| DocsBot AI | — | — | credits | — | ❌ US | — | — | unverified |
| Wonderchat | — | — | сообщения | — | ❌ US | — | — | unverified |
| Chaindesk | — | — | credits | — | EU-опции возможны | tool-calling | — | unverified |
| Tidio (Lyro) | Free (50 convos) | Starter $29, Growth $59, Plus $749, Premium ~$2 999/мес; Lyro AI от $39; Flows от $29 | billable conversations + Lyro AI convos + Flows | снятие брендинга $20/мес (Growth) | ⚠️ EU-хостинг, но Tidio LLC (US), DPF/SCC, CLOUD Act | ✅ Lyro Actions (внешние API) | G2 4.7 (1400+), Capterra 4.7 (500+) | verified |
| Crisp | Free | Pro ~€95/мес | flat/seat | — | ✅ NL (сообщения) + DE (плагины), DPA публичный, DigitalOcean EU | webhooks, интеграции | G2/Capterra высокий | verified |
| eesel AI | — | per-conversation | conversation | — | ❌ преим. US | tool-calling | — | unverified |

**Мини-профиль Chatbase (лидер DIY):** основан 2023, Yasser Elsaid, ~$8M ARR к 2025, 10 000+ клиентов (IHG, Miele, National Grid). Модель — message credits: 1 кредит эконом-модель, 3 — Claude Sonnet, 5–6 — Opus/GPT-4-класс. Эффективная цена ~$12/1 000 доп. кредитов; auto-recharge $40/1 000. Custom Actions (запущены как «AI Actions») — вызов любого REST-эндпоинта (upgrade_subscription, track_shipment), ответ обязан быть JSON ≤20KB, иначе ошибка. Топ-3 сильных: скорость запуска (<10 мин), выбор 15+ моделей, Suggestions (пробелы в базе знаний). Топ-3 жалобы (Trustpilot ~2.1, Product Hunt): биллинг/отказы в возврате, обрыв обслуживания при исчерпании кредитов, галлюцинации/выдуманные URL. Слабости для продаж: US-хостинг (не DSGVO-native), $1 188/год за снятие брендинга, один агент даже на $400-тарифе, обрыв квоты («the agent stops when they run out»).
Источники: chatbase.co/pricing, chatbase.co/docs/.../custom-action, trustpilot.com/review/chatbase.co, G2, sitegpt.ai/blog/chatbase-review.

### Сегмент 2 — White-label / reseller (главные конкуренты по модели)

| Вендор | Входная цена | Ключевые тарифы | Единица | White-label условия | EU-residency | Live-data | Флаг |
|---|---|---|---|---|---|---|---|
| Stammer.ai | Starter $49 | Agency $197 (все WL), Full SaaS $497 (BYO OpenAI key), Enterprise от $2 500/мес | wallet ($/сообщение: GPT-4o $0.02, GPT-4 Turbo $0.05); суб-аккаунты, Stripe passthrough, 0% rev-share | ❌ Made in USA, GDPR-заявление | ✅ function calling (заявлено «future of LLM») | verified |
| FastBots Reseller | $399/мес (annual $333) | Reseller — 30 client slots | shared message pool | суб-аккаунты, WL, 0% rev-share, маржа 75–90% | ❌ US | tool-calling | verified |
| BotPenguin | Reseller $500/год (30% commission); WL от $1 500/год | WL: свой бренд/домен, 100% revenue | per-credit/пулы | суб-аккаунты, Stripe/Razorpay/PayPal, выбор региона US/EU (по запросу) | ⚠️ EU-регион по запросу, GDPR/ISO/SOC2-заявления | native + Zapier | verified |
| Robofy | Free join; WL ~$97/мес (10 licenses) | Accelerator $97, Enterprise $149 (unlimited), annual −33% | flat + per-credit | суб-домен (не свой домен до Enterprise), 0% rev-share, billing USD/GBP | ✅ EU/Ireland (self-statement), DPA, .NET self-host | лид-захват, booking | verified |
| WebChatAgent | WL от €29/мес | self-service от €15/мес | shared message pool | WL на каждом тарифе, свой бренд | ✅ Германия на всех тарифах, DPA готов, no-training | ✅ REST-коннекторы (order status/account in-chat) | verified |
| ConvoCore | базовый $20 + WL add-on $200 (~$220 эфф.) | flat $99–220; 5 client seats, +$15/seat | usage (chat 100–300 msg/$, voice $0.05–0.10/мин + 2¢ markup) | суб-аккаунты, rebilling, 0% rev-share | ✅ регион Frankfurt (EU) выбираемый, GDPR, per-client isolation | ✅ voice+chat, SIP, webhooks | verified |
| Insighto.ai | PAYG; тарифы $24/$99/$499 | Agency Starter $299 (WL + 10 суб-акк.) | unified credits (voice $0.06/мин, chat $0.015/query) | WL, custom domains, branded dashboards, BYOK | ⚠️ не заявлен EU по умолчанию | ✅ voice+chat, Google Calendar, human handover | verified |
| Botsify | Basic $49 | Agency $199 (5 seats); WL от $97/мес | per-credit/seat | WL, 5000+ интеграций, свой бренд/домен/цены | ❌ US | native + Zapier | verified (G2 4.3, 16 reviews) |
| GoHighLevel SaaS Mode | Starter $97 | Unlimited $297, Agency Pro/SaaS $497/мес (annual −20%) | flat + usage rebilling (SMS/email/AI credits, Voice AI ~$0.02/interaction или $49/мес/суб-акк.) | полный WL, unlimited суб-аккаунты, Stripe auto-rebilling, свой домен/моб.приложение | ❌ US | ✅ Voice AI Custom Actions, CRM native | verified |
| Vendasta | — | reseller marketplace | — | WL marketplace | ❌ US/Canada | — | unverified |
| Pickaxe | — | WL portals | — | WL порталы, свой домен | ❌ US | tool-calling | unverified |
| Lety.ai | — | — | — | WL | ⚠️ не подтверждён | — | unverified |
| BotSailor | — | reseller/WL | per-credit | WL, WhatsApp-first | ❌ US | native | unverified |

**Мини-профиль Stammer.ai:** «Made in USA, GDPR Compliant» (footer). Кошельковая модель: агентство платит себестоимость (GPT-4o $0.02/сообщение), клиент платит по цене, которую агентство установило (напр. $0.05) — маржа через Sub-Account Wallet, деньги идут на Stripe агентства. 35K+ ботов, 12M+ разговоров, 1 300+ агентств, типично $300–500 MRR/клиент. Слабость для продаж: только чат/голос-агент, нет CRM/сайта/календаря — агентство само сшивает стек; нет HIPAA; нет EU-only residency.
Источники: stammer.ai/pricing, docs.stammer.ai, stammer.ai/blog-posts/b/new-pricing-15-update.

### Сегмент 3 — Enterprise (ценовой потолок)

| Вендор | Входная цена | Единица | EU-residency | Live-data | Флаг |
|---|---|---|---|---|---|
| Intercom Fin | $0.99/resolution + seat ($29/$85/$132) | per-resolution/outcome (min 50/мес) | US-first, EU-регион по плану | ✅ действия во внешних системах | verified |
| Botpress | Free PAYG ($5 AI credit); Plus $89/$150, Team $495/$750/мес | per-conversation + AI Spend (pass-through) | self-host возможен → EU | ✅ глубокий function calling, дев-платформа | verified |
| Voiceflow | Free; Pro $60, Business $150/editor + $50/seat | credits (жёсткий обрыв) | US, EU по Enterprise | ✅ через webhook в automation-слой | verified |
| Zendesk AI | ~$115/agent + AI $50 | seat + AI | EU-регион (data center) | native CRM | verified |
| Ada | custom (enterprise) | per-resolution | ⚠️ EU-опции ограничены | ✅ | unverified |
| Drift/Salesloft | от $30K/год, sunset под Salesloft | seat/flat | US | native | verified |
| HubSpot Breeze | bundled в Service Hub | seat/credits | EU-регион | native CRM | unverified |
| Kore.ai | custom (enterprise, $150M raised) | conversation/session | EU-опции | ✅ | unverified |
| Yellow.ai | custom ($75M raised 12/2024) | session | EU-опции | ✅ | unverified |

**Ключевое:** Intercom переименовала компанию в Fin (май 2026); **Salesforce покупает Fin примерно за $3.6 млрд** (пресс-релиз Salesforce от 15.06.2026: «Salesforce will acquire Fin for approximately $3.6 billion, subject to customary purchase price adjustments»; закрытие ожидается в Q4 FY2027; сделка приносит 30 000+ клиентов; Irish Times назвал её «крупнейшей в истории для основанной в Ирландии tech-компании», €3.1 млрд). Fin берёт $0.99 за «resolution», включая «assumed resolution» (клиент замолчал) → счёт растёт с улучшением бота; при 5 000 resolutions = $4 950/мес только за AI. **Маркетинговая метрика теперь 76%** («closes out roughly 76% of incoming support requests with no need for a human agent», Salesforce, 15.06.2026), тогда как в независимом 60-дневном тесте на 4 клиентах реальная resolution rate составила 38%. **Cognigy куплена NICE примерно за $955 млн** (пресс-релиз NICE, 08.09.2025: «values Cognigy at approximately $955 million», включая ~$50M holdback; ~25x выручки Cognigy 2024 в $37M; Cognigy основана в Дюссельдорфе в 2016, клиенты Mercedes-Benz, Bosch, Lufthansa). Enterprise-платформы Cognigy/Parloa стартуют ~$300K/год.

### Сегмент 4 — DACH/DSGVO-native + Румыния/Молдова

| Вендор | Входная цена | Единица | EU-residency (проверено) | Live-data | White-label | Флаг |
|---|---|---|---|---|---|---|
| moinAI (knowhere GmbH, Гамбург, 2015) | ~790€/мес; Essential/Starter ~475€ | flat/лицензия | ✅ Германия (Hetzner/OVHcloud DE), AVV по Art. 28, no-training | CRM/API, live chat, 98 языков | ❌ нет reseller | verified |
| melibo (Бенсхайм) | от ~500€/мес (индивид.) | flat по объёму | ✅ Azure Frankfurt, ISO 9001/27001, AVV | Shopware/Shopify/SAP/Zendesk, human handover | ❌ | verified |
| Lime Connect (ex-Userlike, Кёльн) | Free; от €90/мес, multichannel €290/мес | seat/flat + AI | ✅ EU-хостинг, DE-разработка | AI Agent + Copilot, CRM, workflow builder | ❌ | verified |
| BOTfriends (Вюрцбург, 2017) | от 2 490€/мес (Starter) | flat/enterprise | ✅ DE | GPT-4/Gemini, voice, CRM | ❌ | verified |
| chatbits | — | — | ✅ DE (заявлено) | — | ⚠️ | unverified |
| Cognigy (куплена NICE) | ~$300K/год | enterprise | ✅ EU-опции, on-prem | ✅ глубокий | ❌ | verified |
| Parloa (Microsoft-backed) | enterprise contracts | по объёму | ✅ ISO 27001, SOC2 I/II, GDPR, HIPAA, PCI, DORA | ✅ voice-first | ❌ | verified |
| dsgvobot.de | — | — | ✅ DE (заявлено) | — | ⚠️ | unverified |
| Flyweight AI | — | — | ⚠️ | — | ⚠️ | unverified |
| Kauz (DE, Mittelstand) | PoC от 7 500€ | проект | ✅ DE | гибридный | ❌ | verified |
| BotCore | от €24/мес | tier | ✅ DE (заявлено, конкурент-маркетинг) | RAG, multichannel, voice | ⚠️ | unverified |

**Румыния:**
- **DRUID AI** (Бухарест, 2018, осн. Andreea Plesea, Liviu Dragan, Daniel Balaceanu; ~$78.5M привлечено, оценка ~$300M; Gartner MQ Challenger 2025): enterprise conversational AI, Connector Designer (REST/SOAP, SQL, ERP/CRM, RPA/UiPath), 100+ языков вкл. RO/RU/DE. Цены — только custom/по запросу. 300+ клиентов (AXA, Carrefour, NHS).
- **Future WorkForce** (осн. Mihaela Moisa): RPA/автоматизация; построила HR-чатбот «Ana» для Telekom România на технологии DRUID (это НЕ молдавская Ana — не путать).
- **WiseGroup AI, Fluxer.io (FluxerAI)** — локальные игроки, публичных тарифов нет (unverified).

**Молдова — «Ana» на cnam.md:** запущена **15.06.2026** в пилоте Национальной компанией медицинского страхования (CNAM/НКМС). Работает 24/7, отвечает на вопросы об обязательном медстраховании (статус застрахованного, порядок уплаты взносов, покрываемые услуги). **Разработчик/вендор публично не назван** — подтверждено проверкой: пресс-релизы (logos-pres.md, moldova1.md, noi.md) приписывают запуск только CNAM; в портале госзакупок mtender.md CNAM-тендер на чатбот/ИИ за 2025–2026 не найден (портал JS-driven, полностью не индексируется — требуется ручная проверка). Кандидаты из задания (DRUID, Future WorkForce, WiseGroup, Fluxer) — связи с молдавской Ana не обнаружено. Рекомендация: проверить cnam.md/achizitii-publice/contracte/, date.cnam.md, инспектировать домен виджета в network-запросах, запросить Direcția Sisteme Informaționale CNAM.

## Сквозные анализы A–F

**(A) Экономика биллинга — эффективная цена за 1 000 сообщений.**
- Chatbase: эконом-модель ~$12/1 000 доп. кредитов ≈ $12/1 000 ответов; премиум (Sonnet ×3) ≈ $36/1 000; Opus (×5–6) ≈ $60–72/1 000. Auto-recharge $40/1 000.
- Stammer: GPT-4o $0.02/сообщение = $20/1 000 себестоимость; при перепродаже $0.05 = $50/1 000 (маржа $30).
- Voiceflow: ~$56 кредитов на 1 000 шестишаговых разговоров (эконом), жёсткий обрыв при исчерпании.
- Intercom Fin: $0.99/resolution — при типичном 10–20 сообщениях/разговоре ≈ $990/1 000 разговоров-резолюций (несопоставимо дороже для FAQ, но платишь за результат).
- Tidio: Lyro $0.50–$1/AI-разговор сверх квоты.
- Вывод: кредитные модели «наказывают за успех»; flat/wallet предсказуемее для клиента; per-resolution выгоден только при высокой доле сложных кейсов.

**(B) Экономика реселлеров.** Платформенные fees: GoHighLevel $497 (SaaS Mode, break-even ~2–3 клиента), Stammer $197/$497, FastBots $399, BotPenguin от $1 500/год, ConvoCore ~$220, Insighto $299. Типичные клиентские ставки $99–500/мес; setup fees $300–1 500. Маржа 75–90% после 5 клиентов (FastBots). Пример: 10 ботов × €59 = €590/мес выручки; при flat-fee платформе почти всё — маржа. Про churn операторы пишут: retainer-клиенты уходят («если не принёс лидов»), SaaS-клиенты «редко отменяют, т.к. платформа становится частью их операций». Риск маржи — usage-модели (shared pools, per-credit) при высокотрафиковом клиенте; совет операторов — капать usage на суб-аккаунт.

**(C) Кто реально гарантирует EU-only residency (по DPA).** Твёрдо: Crisp (NL+DE, DPA публичный, DigitalOcean EU), moinAI (DE, Hetzner/OVHcloud, AVV Art. 28), melibo (Azure Frankfurt, ISO 27001), Lime Connect (Кёльн), BOTfriends (DE), Parloa (полный стек сертификатов), Cognigy (EU/on-prem), WebChatAgent (DE, DPA готов). Условно (self-statement, проверить DPA): Robofy (EU/Ireland), ConvoCore (Frankfurt-регион). НЕ гарантируют по умолчанию: Chatbase, Stammer, FastBots, Botsify, CustomGPT (US, подпишут DPA/SCC, но CLOUD Act). Tidio — EU-хостинг, но US-субъект → CLOUD Act/FISA 702 применимы.
**AI Act Art. 50:** в силе с 02.08.2026; Комиссия приняла финальные Guidelines 20.07.2026. Провайдер (разработчик системы) обязан спроектировать раскрытие «я — ИИ» при первом контакте; deployer (клиент-владелец сайта) отвечает за доведение раскрытия до пользователя. Штраф до €15 млн или 3% мирового оборота (для SME/стартапов — меньшая из сумм). Grace-период до 02.12.2026 — только для marking/detection генеративного контента (Art. 50(2)): по формально принятому AI Omnibus (вступил в силу 27.07.2026) системы, размещённые на рынке до 02.08.2026, имеют срок до 02.12.2026 на внедрение marking-требования. Для виджета: постоянная надпись на экране закрывает Art. 50(1). Бот, выдающий себя за человека → Art. 5 (обман), штраф до 7%.

**(D) Настоящий function-calling в произвольные API.** Есть и зрел: Botpress (дев-платформа, глубоко), Voiceflow (через webhook в automation-слой), GoHighLevel (Voice AI Custom Actions). Есть, но с оговорками: Chatbase Custom Actions — любой REST-эндпоинт, но ответ ≤20KB (JSON), жалобы на надёжность/однонаправленность («weak API and integration support», «bots ignore uploaded data»); Tidio Lyro Actions — вызов внешних API, но лучше на транзакционных single-turn. WebChatAgent — REST-коннекторы (order status/account in-chat), позиционируется как EU-аналог. DACH-нативы: moinAI/melibo/Lime — интеграции с CRM/helpdesk, но не «произвольный function calling» уровня Chatbase/Botpress. Вывод: комбинация «зрелый tool-calling + EU-hosting + white-label» практически отсутствует — ядро возможности.

**(E) Размер и рост рынка 2026 + willingness-to-pay.** Оценки chatbot-рынка 2026: Fortune Business Insights $10.42–12.98 млрд, Grand View $11.8 млрд, Mordor $11.45 млрд (→$32.45 млрд к 2031, CAGR ~23%), market.us $9.2 млрд (2025). Conversational AI шире: $14.8–17.9 млрд (2026). DACH willingness-to-pay: KMU/Mittelstand — self-service DSGVO-боты от €24–59/мес (BotCore, anny, Webweezl); типичный Mittelstand-абонемент €300–1 500/мес (10–50K разговоров); melibo от ~500€, moinAI от ~790€, BOTfriends от 2 490€. Порог рентабельности бота — от ~100 запросов/мес. Спрос растёт быстро: по репрезентативному опросу Bitkom (604 компании ≥20 сотрудников, поле CW2–6/2026) «инзвишен нутцен 41 процент дер Унтернехмен аб 20 Бешефтигтен КИ, вейтере 48 процент планен одер дискутирен ден Айнзац. Фор айнем Яр хаттен эрст 17 процент КИ им Айнзац» — то есть 41% компаний DE от 20 сотрудников используют ИИ (год назад — 17%), ещё 48% планируют/обсуждают, 77% сообщают об улучшении конкурентной позиции. По EU-гармонизированным данным Destatis (IKT-U-Erhebung 2025) 26% немецких предприятий (≥10 сотрудников) использовали ИИ в 2025: 57% крупных (250+), 36% средних, 23% малых фирм.

**(F) Проверка гипотезы белого пятна.** Гипотеза «EU-hosting + живой CRM tool-calling + white-label + €100–400/мес» — **в основном подтверждается**. На пересечении всех четырёх критериев почти пусто: US-реселлеры дают WL+tool-calling+ценник, но не EU-residency; DACH-нативы дают EU-residency, но без WL и дороже €400; ближайшие конкуренты — WebChatAgent (DE-хостинг, WL €29, REST-коннекторы — но малый вендор) и ConvoCore (Frankfurt-регион, WL ~$220, voice+chat — но новый, тонкая документация). Robofy (EU/Ireland, $97) — без своего домена до Enterprise и без зрелого tool-calling. То есть прямого сильного конкурента в точке «зрелый function-calling + доказанная EU-only residency по DPA + полный white-label + €100–400» нет.

## Recommendations

1. **Позиционирование (немедленно):** «DSGVO-native white-label chatbot-as-a-service с живым tool-calling в CRM клиента, хостинг ЕС, встроенное соответствие AI Act Art. 50». Целиться в две ниши: (а) DACH-агентства и Mittelstand, которым дорог moinAI/BOTfriends и не нужен reseller у DACH-нативов; (б) румынские/молдавские SMB и агентства без локального white-label-предложения.
2. **Тарифная сетка (предлагается):** Starter €99/мес (1 бот, EU-хостинг, RAG по docs, лид-захват, AI Act-disclosure из коробки); Pro €249/мес (tool-calling в произвольные API/CRM, human handoff, отчёт «неотвеченные вопросы», DE/RO/RU); Agency/White-label €399/мес (суб-аккаунты, свой домен, ребрендинг дашборда, Stripe passthrough, BYO API key, DPA/AVV). Flat-биллинг с честной квотой сообщений + прозрачный overage — противопоставить «обрыву квоты Chatbase» и кредитному хаосу.
3. **Compliance как оружие продаж:** подписываемый AVV/DPA с EU-only residency (Hetzner/OVHcloud/Scaleway), no-training-обязательство в договоре, встроенная надпись «я — ИИ» (Art. 50). Явно контрастировать с «US-server, CLOUD Act» Chatbase/Stammer и «2.1★ Trustpilot» Chatbase.
4. **Продуктовый приоритет №1 — зрелый function-calling** (двунаправленный, без лимита 20KB, с ретраями), т.к. это точка, где Chatbase слаб по отзывам, а DACH-нативы отсутствуют.
5. **Бенчмарки для смены стратегии:** если ≥2 EU-hosted конкурента запустят полноценный white-label с tool-calling в диапазоне €100–400 — уходить в вертикаль (напр. Handwerk/медpractices DE или недвижимость RO) или в done-for-you. Если churn клиентов >5%/мес — усиливать «залипание» через CRM-интеграции и отчётность. Если Mittelstand не платит >€250 — сфокусироваться на агентском реселле (маржа на объёме).

## Caveats
- Цены US-реселлеров и DIY-инструментов меняются часто; флаг verified означает подтверждение на живой странице/reviews на 19.08.2026, но перед сделкой сверять на pricing-странице вендора.
- DACH-нативы (moinAI, melibo, BOTfriends) публикуют «цены по запросу»/«от X€» — точные тарифы за sales-wall; приведённые значения — из reviews (OMR, trusted.de, melibo-блог) и конкурент-маркетинга, не с прайс-листа вендора.
- EU-residency-заявления Robofy и ConvoCore — self-statement вендора; перед продажей регулируемому клиенту требовать DPA с указанием дата-центра и субпроцессоров.
- Разработчик молдавской «Ana» (CNAM) не установлен из открытых источников; требуется ручная проверка mtender.md и CNAM-контрактов.
- Ряд DIY-вендоров (Botsonic, Chatling, Dante AI, SiteSpeak.ai, DocsBot, Wonderchat, Chaindesk, eesel) и реселлеров (Vendasta, Pickaxe, Lety.ai, BotSailor) помечены unverified — точные тарифы/условия не подтверждены на живых страницах в этом цикле.
- Chatbase кредитная механика (1–6 кредитов/ответ) и точные квоты тарифов менялись в 2026 неоднократно — источники расходятся (Standard 4 000 vs 10 000 кредитов); брать диапазон.
- Метрика Destatis относит 36% к средним (не малым) предприятиям DE; исходно приписанный IW Köln показатель уточнён по Destatis IKT-U-Erhebung 2025.

### Ключевые URL (pricing и compliance)
- Chatbase: chatbase.co/pricing · chatbase.co/docs/user-guides/chatbot/actions/custom-action · trustpilot.com/review/chatbase.co
- Stammer: stammer.ai/pricing · docs.stammer.ai/.../subscription-plans
- GoHighLevel: gohighlevel.com/pricing
- Tidio: tidio.com/terms · help.tidio.com (DPA) · tidio.com/blog/chatbot-pricing
- Intercom/Fin: fin.ai/pricing · getmacha.com/blog/intercom-fin-pricing
- Botpress: botpress.com/blog/pricing-update-may-2026 · Voiceflow: voiceflow.com/pricing · docs.voiceflow.com/.../credits-pricing-table
- moinAI: moin.ai/en/pricing · moin.ai/en/chatbots-gdpr (AVV/DPA)
- melibo: melibo.de/plattform/datenschutz-dsgvo · melibo.de/rechtliches/datenschutz-faqs (Azure Frankfurt)
- Crisp: help.crisp.chat/en/article/crisp-eu-gdpr-compliance-status
- Lime Connect: connect.lime-technologies.com/en/pricing · WebChatAgent: webchatagent.com/compare/moinai · ConvoCore: convocore.ai/pricing
- BotPenguin: botpenguin.com/white-label-chatbot-pricing · Robofy: robofy.ai/whitelabel-chatbot-reseller-pricing · Insighto: (agency page) · DRUID: druidai.com/pricing
- AI Act Art. 50: digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act · artificialintelligenceact.eu/article/50 · ai-act-service-desk.ec.europa.eu/en/ai-act/timeline
- CNAM «Ana»: logos-pres.md/en/news/ncmu-has-launched-a-virtual-assistant-named-ana · moldova1.md/p/78539