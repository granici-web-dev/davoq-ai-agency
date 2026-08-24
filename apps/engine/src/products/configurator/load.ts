import { readFileSync } from 'node:fs';
import { assertAgentPrompt, type AgentConfig } from './agent/prompt.js';
import { mergeLayers, type Json } from './config/layers.js';
import { clientLayer, inside, verticalLayer, type Layer } from './config/source.js';
import { validateFlow, type FlowConfig } from './flow/schema.js';
import {
  PRICING_DEFAULTS, assertPriceable, validatePricing, type PricingConfig,
} from './pricing/schema.js';

/**
 * Сборка конфигуратора из слоёв: умолчания движка → вертикаль → клиент.
 *
 * Флоу и цена собираются вместе и проверяются вместе: правило цены ссылается
 * на шаги флоу («количество берётся из шага `pieces`»), и проверить его
 * в отрыве от флоу нельзя — ссылка на несуществующий шаг тихо дала бы
 * количество по умолчанию, то есть оферту на одну штуку вместо десяти.
 *
 * Бланк оферты собирается своим загрузчиком (`offer/load.ts`): он нужен
 * и там, где конфигуратора нет вовсе.
 */

export interface Configurator {
  flow: FlowConfig;
  pricing: PricingConfig;
  /** Промпт агента. Ниша задаёт, клиент может переопределить своим файлом. */
  agent: AgentConfig;
}

export interface ConfiguratorSource {
  verticalId?: string | null;
  /** Слой клиента: каталог на диске либо готовый объект (позже — jsonb из базы). */
  clientDir?: string;
  clientLayer?: Json | undefined;
  /** Локали тенанта: заголовки шагов проверяются для каждой. */
  locales: string[];
  where?: string;
}

/** Пути к картинкам вариантов разворачиваются В КАЖДОМ СЛОЕ до слияния. */
function resolvePaths(layer: Json | undefined, dir: string, where: string): Json | undefined {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return layer;
  const out = { ...layer } as Record<string, Json>;
  if (!Array.isArray(out.steps)) return out;

  out.steps = out.steps.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const step = { ...(raw as Record<string, Json>) };
    if (!Array.isArray(step.options)) return step;
    step.options = step.options.map((o, j) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
      const option = { ...(o as Record<string, Json>) };
      if (typeof option.image === 'string') {
        option.image = inside(dir, option.image, `${where}: flow.steps[${i}].options[${j}].image`);
      }
      return option;
    });
    return step;
  });
  return out;
}

const flowOf = (layer: Layer | undefined): Json | undefined =>
  layer && resolvePaths(layer.raw.flow, layer.dir, layer.where);

const pricingOf = (layer: Layer | undefined): Json | undefined => layer?.raw.pricing;

/**
 * Промпт агента читается ФАЙЛОМ, а не строкой в YAML.
 *
 * Он длинный, многострочный и правится текстом; в YAML он превратился бы
 * в блок с отступами, где отступ и есть смысл, а diff нечитаем. Тот же
 * выбор, что у промптов чат-бота в `vertical.yaml`.
 */
function agentOf(layer: Layer | undefined): Json | undefined {
  const raw = layer?.raw.agent;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const out = { ...(raw as Record<string, Json>) };
  if (typeof out.prompt === 'string') {
    out.prompt = readFileSync(
      inside(layer!.dir, out.prompt, `${layer!.where}: agent.prompt`), 'utf8',
    ).trimEnd();
  }
  return out;
}

export function buildConfigurator(src: ConfiguratorSource): Configurator {
  const where = src.where ?? 'конфигуратор';
  const vertical = verticalLayer(src.verticalId);
  const client = src.clientDir ? clientLayer(src.clientDir) : undefined;
  const clientFlow = src.clientLayer !== undefined
    ? layerSection(src.clientLayer, 'flow')
    : flowOf(client);
  const clientPricing = src.clientLayer !== undefined
    ? layerSection(src.clientLayer, 'pricing')
    : pricingOf(client);

  const flow = mergeLayers(flowOf(vertical), clientFlow) as Record<string, unknown> | undefined;
  if (!flow) {
    throw new Error(
      `${where}: флоу не задан ни нишей, ни клиентом. ` +
      'Конфигуратор без шагов показывать нечего.',
    );
  }
  validateFlow(flow, src.locales, where);

  const pricing = mergeLayers(
    mergeLayers(PRICING_DEFAULTS as unknown as Json, pricingOf(vertical)),
    clientPricing,
  ) as Record<string, unknown>;
  validatePricing(pricing, flow, where);
  assertPriceable(flow, where);

  const agent = (mergeLayers(
    agentOf(vertical),
    src.clientLayer !== undefined ? layerSection(src.clientLayer, 'agent') : agentOf(client),
  ) ?? {}) as AgentConfig;
  assertAgentPrompt(agent, where);

  return { flow, pricing, agent };
}

function layerSection(layer: Json | undefined, key: string): Json | undefined {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return undefined;
  return (layer as Record<string, Json>)[key];
}
