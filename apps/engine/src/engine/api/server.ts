// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { registerAdmin } from './admin.js';
import { registerChat } from './chat.js';
import { registerWidget } from './widget.js';
import { registerBilling } from './billing.js';
import { registerConfigurator } from '../../products/configurator/api/public.js';
import { readiness } from '../ops/health.js';

/**
 * Доверяем ровно одному переходу, а не всей цепочке.
 *
 * Перед нами Caddy, и он ДОПИСЫВАЕТ адрес в `x-forwarded-for`, а не заменяет
 * заголовок. При `true` Fastify взял бы самый левый адрес — то есть тот,
 * который прислал сам клиент, — и ограничение частоты обходилось бы одной
 * строкой заголовка. Число означает «столько переходов с нашей стороны
 * доверяем», и адрес берётся тот, который увидел Caddy.
 *
 * В разработке прокси нет и заголовка нет: proxy-addr возвращает адрес
 * сокета, то есть работает как раньше.
 *
 * Функцией, а не числом: число Fastify принимает во время работы, но его
 * объявления типов о такой перегрузке не знают. `hop === 0` — это и есть
 * «доверяем только тому, кто с нами соединился».
 */
const app = Fastify({ logger: true, trustProxy: (_address, hop) => hop === 0 });

// Потолок на размер файла нужен здесь, а не в обработчике: без него запрос
// целиком уезжает в память ещё до того, как код получит шанс отказать.
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

/**
 * Живость: отвечает ли процесс. По ней docker перезапускает контейнер, поэтому
 * ничего внешнего она не трогает — моргнувшая база перезапустила бы исправный
 * API, добавив к одной неполадке вторую.
 */
app.get('/health', async () => ({ ok: true }));

/**
 * Готовность: работает ли продукт целиком. По ней никто ничего не
 * перезапускает — её читает наблюдатель и пишет письмо человеку.
 *
 * Закрыта токеном: наружу состояние базы, очередей и диска отдавать незачем.
 * Прокси её тоже не пропускает, но замок здесь работает независимо от прокси.
 */
app.get('/health/ready', async (request, reply) => {
  const expected = process.env.OPS_TOKEN;
  if (expected && request.headers['x-ops-token'] !== expected) {
    return reply.code(404).send();
  }
  const result = await readiness();
  return reply.code(result.ok ? 200 : 503).send(result);
});
// Приём вебхуков ставится ПЕРВЫМ: он меняет разбор тела запроса,
// а хуки Fastify применяются в порядке регистрации.
registerBilling(app);
registerAdmin(app);
registerWidget(app);
registerChat(app);
// После registerWidget: CORS и OPTIONS для /v1/* ставит он.
registerConfigurator(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
