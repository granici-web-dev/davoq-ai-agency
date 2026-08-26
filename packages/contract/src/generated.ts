/**
 * ПОРОЖДЁННЫЙ ФАЙЛ. Руками не править.
 *
 * Источник — манифесты `product.yaml` и `vertical.yaml` рядом с кодом.
 * Пересобрать: npm run contract
 * Проверить:  npm run contract:check
 */

import type { Commerce, Product, Vertical } from './index.js';

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
        "basic": {
          "price": 149,
          "limits": {
            "conversations": 500
          },
          "features": [
            "always",
            "sources",
            "qualify",
            "portal"
          ]
        },
        "pro": {
          "price": 249,
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
        "basic": {
          "price": 129,
          "limits": {
            "offers": 200
          },
          "features": [
            "questions",
            "spec",
            "gaps",
            "portal"
          ]
        },
        "pro": {
          "price": 199,
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
      "verticals": [],
      "tiers": {
        "basic": {
          "price": 149,
          "limits": {},
          "features": [
            "many",
            "formats",
            "sources",
            "approve"
          ]
        },
        "pro": {
          "price": 249,
          "limits": {},
          "features": [
            "scenarioCustom",
            "secondLanguage"
          ]
        }
      }
    },
    {
      "id": "data-analyst",
      "version": 1,
      "status": "planned",
      "feature": "analytics",
      "verticals": []
    },
    {
      "id": "follow-up",
      "version": 1,
      "status": "planned",
      "feature": "followup",
      "verticals": [],
      "tiers": {
        "basic": {
          "price": 99,
          "limits": {},
          "features": [
            "stop",
            "task",
            "sources",
            "portal"
          ]
        },
        "pro": {
          "price": 179,
          "limits": {},
          "features": [
            "scenarioCustom",
            "secondLanguage"
          ]
        }
      }
    },
    {
      "id": "order-status",
      "version": 1,
      "status": "planned",
      "feature": "productionUpdates",
      "verticals": [],
      "tiers": {
        "basic": {
          "price": 79,
          "limits": {},
          "features": [
            "stage",
            "task",
            "read",
            "portal"
          ]
        },
        "pro": {
          "price": 149,
          "limits": {},
          "features": [
            "scenarioCustom",
            "secondLanguage"
          ]
        }
      }
    },
    {
      "id": "outreach",
      "version": 1,
      "status": "planned",
      "feature": "outreach",
      "verticals": []
    },
    {
      "id": "voice-assistant",
      "version": 1,
      "status": "planned",
      "feature": "voice",
      "verticals": [],
      "tiers": {
        "basic": {
          "price": 249,
          "limits": {},
          "features": [
            "phone",
            "task",
            "sources",
            "disclose"
          ]
        },
        "pro": {
          "price": 449,
          "limits": {},
          "features": [
            "scenarioCustom",
            "secondLanguage"
          ]
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

export const COMMERCE: Commerce = {
    "annualDiscount": 0.2,
    "setup": {
      "first": 290,
      "next": 190,
      "pilot": 0
    },
    "volume": [
      {
        "agents": 2,
        "discount": 0.1
      },
      {
        "agents": 3,
        "discount": 0.2
      }
    ]
  };
