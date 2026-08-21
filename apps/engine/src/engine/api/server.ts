// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { registerAdmin } from './admin.js';
import { registerChat } from './chat.js';
import { registerWidget } from './widget.js';
import { registerBilling } from './billing.js';
import { readiness } from '../ops/health.js';

const app = Fastify({ logger: true });

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

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
