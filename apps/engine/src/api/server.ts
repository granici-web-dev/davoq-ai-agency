// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { registerAdmin } from './admin.js';
import { registerChat } from './chat.js';
import { registerWidget } from './widget.js';

const app = Fastify({ logger: true });

// Потолок на размер файла нужен здесь, а не в обработчике: без него запрос
// целиком уезжает в память ещё до того, как код получит шанс отказать.
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

app.get('/health', async () => ({ ok: true }));
registerAdmin(app);
registerWidget(app);
registerChat(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
