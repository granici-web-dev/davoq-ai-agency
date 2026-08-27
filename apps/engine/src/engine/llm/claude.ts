import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';

/**
 * Claude идёт через Bedrock в регионах ЕС, а не через первичный Anthropic API:
 * параметр inference_geo принимает только "us" и "global", значения "eu" не существует,
 * и без региональных эндпоинтов заявление про EU-residency неверно.
 * Обоснование и последствия — 06-Implement/stack.md.
 *
 * Используется классический клиент bedrock-runtime, а не Mantle: Mantle-эндпоинт
 * в этом аккаунте отвечает 404 на все идентификаторы Anthropic, тогда как
 * bedrock-runtime модель находит. Проверено перебором обоих клиентов.
 */
export const claude = new AnthropicBedrock({
  awsRegion: process.env.AWS_REGION ?? 'eu-central-1',
});

/**
 * Запасные значения — это ПРОВЕРЕННЫЕ идентификаторы, а не правдоподобные.
 *
 * Здесь стояло `eu.anthropic.claude-sonnet-5` — идентификатор, которого
 * в Bedrock нет: аккаунт отвечает на него 403. Пока модель выбиралась
 * отдельной ручкой и никто её не трогал, это не проявлялось. Как только
 * модель стал задавать тариф, первый же клиент на Business получил бы
 * «ассистент временно недоступен» на каждое сообщение.
 *
 * Оба значения ниже проверены живым вызовом к аккаунту.
 */
const FALLBACK_BASE = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
const FALLBACK_PREMIUM = 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Идентификаторы — это **inference profile**, а не foundation model.
 * Новые модели Anthropic на Bedrock по прямому id не вызываются вовсе:
 * «Invocation of model ID … with on-demand throughput isn't supported».
 *
 * Префикс `eu.` означает маршрутизацию между регионами ЕС — Франкфурт, Стокгольм
 * и другие. Обработка остаётся в ЕС, но назвать в AVV один дата-центр уже нельзя:
 * перечислять придётся регионы. См. 06-Implement/stack.md.
 */
export function modelFor(tier: 'base' | 'premium'): string {
  return tier === 'premium'
    ? (process.env.MODEL_PREMIUM ?? FALLBACK_PREMIUM)
    : (process.env.MODEL_BASE ?? FALLBACK_BASE);
}
