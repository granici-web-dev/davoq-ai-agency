/**
 * ПОРОЖДЁННЫЙ ФАЙЛ. Руками не править.
 *
 * Источник — манифесты `product.yaml` и `vertical.yaml` рядом с кодом.
 * Пересобрать: npm run contract
 * Проверить:  npm run contract:check
 */

import type { Product, Vertical } from './index.js';

export const PRODUCTS: readonly Product[] = [
    {
      "id": "configurator",
      "version": 1,
      "status": "beta",
      "feature": "configurator",
      "plan": "pro",
      "verticals": [
        "furniture"
      ]
    }
  ];

export const VERTICALS: readonly Vertical[] = [
    {
      "id": "furniture",
      "version": 1
    }
  ];
