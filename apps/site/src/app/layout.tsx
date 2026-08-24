/**
 * Корневой layout.
 *
 * Пустой намеренно: разметка живёт в `[locale]/layout.tsx`, где известен
 * язык. Здесь нельзя даже поставить `<html lang>` — значение ещё неизвестно,
 * и поставленное наугад оно врёт скринридеру про язык страницы.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
