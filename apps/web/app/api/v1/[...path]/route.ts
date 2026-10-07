import { type ApiErrorBody, errorMessage } from '@cf/shared';
import type { NextRequest } from 'next/server';

/**
 * Proxy de misma URL de origen hacia la API (`/api/v1/*` → API_INTERNAL_URL).
 *
 * - La URL interna se lee en tiempo de ejecución: el mismo build sirve para
 *   cualquier entorno.
 * - La cookie de sesión sigue siendo de primera parte (SameSite=Lax funciona).
 * - En producción con un reverse proxy delante, lo ideal es enrutar `/api/v1`
 *   directo a la API (ver docs/DEPLOYMENT.md); este proxy cubre desarrollo y
 *   despliegues sencillos.
 */
export const dynamic = 'force-dynamic';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/** Cabeceras que no deben reenviarse entre saltos (RFC 9110 §7.6.1) o que fetch recalcula. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'content-encoding',
]);

function copyHeaders(source: Headers): Headers {
  const result = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
      result.set(key, value);
    }
  });
  return result;
}

function unavailable(): Response {
  const body: ApiErrorBody = {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: errorMessage('SERVICE_UNAVAILABLE'),
      requestId: 'web-proxy',
    },
  };
  return Response.json(body, { status: 503, headers: { 'cache-control': 'no-store' } });
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = new URL(
    `/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
    API_INTERNAL_URL,
  );

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: copyHeaders(request.headers),
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return unavailable();
  }

  const headers = copyHeaders(upstream.headers);
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
