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
      "status": "shipped",
      "feature": "configurator",
      "plan": "pro",
      "verticals": [
        "furniture"
      ],
      "tiers": {
        "starter": {
          "price": 119,
          "setup": 490,
          "limits": {
            "offers": 200
          },
          "features": []
        },
        "pro": {
          "price": 249,
          "setup": 490,
          "limits": {
            "offers": 600
          },
          "features": []
        }
      }
    }
  ];

export const VERTICALS: readonly Vertical[] = [
    {
      "id": "furniture",
      "version": 1
    }
  ];
