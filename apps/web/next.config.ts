import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/**
 * Las llamadas del navegador a `/api/v1/*` las atiende el proxy de
 * `app/api/v1/[...path]/route.ts`, que lee API_INTERNAL_URL en tiempo de
 * ejecución (no en el build) y conserva la cookie de sesión como de primera parte.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
