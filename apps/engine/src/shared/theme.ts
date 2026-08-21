/**
 * Тема виджета и contrast guard (§9). Модуль общий для виджета и превью в админке:
 * если бы правила читаемости жили в двух местах, превью рано или поздно показывало бы
 * не то, что видит посетитель.
 */

export interface Theme {
  primary: string;
  bg: string;
  text: string;
  userBubble: string;
  botBubble: string;
  radius: string;
  font: string;
  darkMode: 'auto' | 'light' | 'dark';
}

export const DEFAULT_THEME: Theme = {
  primary: '#2563eb',
  bg: '#ffffff',
  text: '#0f172a',
  userBubble: '#2563eb',
  botBubble: '#f1f5f9',
  radius: '16px',
  font: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  darkMode: 'auto',
};

export interface Preset {
  id: string;
  name: string;
  theme: Theme;
}

/** Кураторские пресеты (§10, экран Appearance). Каждый прошёл проверку контраста. */
export const PRESETS: Preset[] = [
  { id: 'classic', name: 'Classic Blue', theme: DEFAULT_THEME },
  {
    id: 'graphite',
    name: 'Graphite',
    theme: { ...DEFAULT_THEME, primary: '#111827', userBubble: '#111827', botBubble: '#f3f4f6' },
  },
  {
    id: 'forest',
    name: 'Forest',
    theme: { ...DEFAULT_THEME, primary: '#15803d', userBubble: '#15803d', botBubble: '#f0fdf4' },
  },
  {
    id: 'sand',
    name: 'Sand',
    theme: {
      ...DEFAULT_THEME,
      primary: '#b45309',
      bg: '#fffbf5',
      userBubble: '#b45309',
      botBubble: '#fef3c7',
      radius: '10px',
    },
  },
  {
    id: 'plum',
    name: 'Plum',
    theme: { ...DEFAULT_THEME, primary: '#7e22ce', userBubble: '#7e22ce', botBubble: '#faf5ff' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    theme: {
      ...DEFAULT_THEME,
      primary: '#38bdf8',
      bg: '#0f172a',
      text: '#e2e8f0',
      userBubble: '#0284c7',
      botBubble: '#1e293b',
      darkMode: 'dark',
    },
  },
];

// ── Контраст по WCAG ──────────────────────────────────────────────────────────

function parseColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseColor(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Contrast guard (§9): цвет текста на подложке выбирается расчётом, а не тенантом.
 * Клиент может поставить любой фирменный цвет кнопки и не сделать её при этом нечитаемой —
 * это не ограничение свободы, а защита его же посетителей.
 */
export function readableOn(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#0f172a', background)
    ? '#ffffff'
    : '#0f172a';
}

export interface ContrastWarning {
  field: string;
  ratio: number;
  message: string;
}

/** Предупреждения для админки: тенант видит проблему до публикации, а не после жалоб. */
export function auditTheme(theme: Theme): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const check = (field: string, fg: string, bg: string, min: number, what: string): void => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) {
      warnings.push({
        field,
        ratio,
        message: `${what}: contrast ${ratio.toFixed(1)}:1, minimul necesar ${min}:1`,
      });
    }
  };

  check('text', theme.text, theme.bg, 4.5, 'Textul pe fundalul panoului');
  check('botBubble', theme.text, theme.botBubble, 4.5, 'Textul din răspunsul asistentului');
  // Пузырь пользователя и кнопка используют вычисленный цвет текста, поэтому
  // проверяем то, что реально отрисуется, а не то, что задал тенант.
  check('userBubble', readableOn(theme.userBubble), theme.userBubble, 4.5, 'Textul din mesajul vizitatorului');
  check('primary', readableOn(theme.primary), theme.primary, 3, 'Textul de pe buton');
  return warnings;
}

export function normalizeTheme(partial: Partial<Theme> | null | undefined): Theme {
  return { ...DEFAULT_THEME, ...(partial ?? {}) };
}

/** CSS-переменные виджета (§9). Производные цвета считаются здесь, не в разметке. */
export function toCssVars(theme: Theme): Record<string, string> {
  return {
    '--cw-primary': theme.primary,
    '--cw-on-primary': readableOn(theme.primary),
    '--cw-bg': theme.bg,
    '--cw-text': theme.text,
    '--cw-user-bubble': theme.userBubble,
    '--cw-on-user-bubble': readableOn(theme.userBubble),
    '--cw-bot-bubble': theme.botBubble,
    '--cw-on-bot-bubble': theme.text,
    '--cw-radius': theme.radius,
    '--cw-font': theme.font,
  };
}

/**
 * Эффективная тема с учётом системной темы посетителя (§9, darkMode: 'auto').
 * Фирменный цвет сохраняется — меняются только подложки и текст, иначе виджет
 * в тёмной теме перестаёт быть узнаваемым.
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): Theme {
  const dark = theme.darkMode === 'dark' || (theme.darkMode === 'auto' && prefersDark);
  if (!dark) return theme;
  // Тема, уже нарисованная тёмной, повторно не инвертируется.
  if (relativeLuminance(theme.bg) < 0.2) return theme;
  return { ...theme, bg: '#0f172a', text: '#e2e8f0', botBubble: '#1e293b' };
}
