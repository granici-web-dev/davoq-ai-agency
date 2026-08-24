import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Витрина, а не приложение: всё, что можно, отдаётся статикой.
  reactStrictMode: true,
  images: {
    // Локальные файлы из /public. Внешних источников нет намеренно —
    // сток и хотлинк на чужой CDN превращают вёрстку в чужую зависимость.
    formats: ['image/avif', 'image/webp'],
  },
};

export default withNextIntl(nextConfig);
