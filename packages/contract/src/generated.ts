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
      "id": "chatbot",
      "version": 1,
      "status": "shipped",
      "feature": "chatbot",
      "plan": "starter",
      "verticals": [
        "furniture"
      ],
      "tiers": {
        "starter": {
          "price": 79,
          "setup": 490,
          "limits": {
            "conversations": 500
          },
          "features": [
            "scenarioIndustry",
            "oneLanguage"
          ]
        },
        "pro": {
          "price": 149,
          "setup": 490,
          "limits": {
            "conversations": 2000
          },
          "features": [
            "scenarioCustom",
            "secondLanguage"
          ]
        }
      }
    },
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
          "features": [
            "scenarioIndustry",
            "oneLanguage"
          ]
        },
        "pro": {
          "price": 249,
          "setup": 490,
          "limits": {
            "offers": 600
          },
          "features": [
            "scenarioCustom",
            "secondLanguage",
            "promo"
          ]
        }
      }
    },
    {
      "id": "content-engine",
      "version": 1,
      "status": "planned",
      "feature": "social",
      "verticals": []
    },
    {
      "id": "follow-up",
      "version": 1,
      "status": "planned",
      "feature": "followup",
      "verticals": []
    },
    {
      "id": "order-status",
      "version": 1,
      "status": "planned",
      "feature": "productionUpdates",
      "verticals": []
    },
    {
      "id": "voice-assistant",
      "version": 1,
      "status": "planned",
      "feature": "voice",
      "verticals": []
    }
  ];

export const VERTICALS: readonly Vertical[] = [
    {
      "id": "furniture",
      "version": 1
    }
  ];
