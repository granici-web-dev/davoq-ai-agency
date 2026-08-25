import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Всё, кроме статики и API. Картинки и шрифты через локализацию не ходят.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
