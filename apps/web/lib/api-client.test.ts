import { userDtoSchema } from '@cf/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api-client';

const user = {
  id: '01a11827-5301-73d6-8e17-6df42b476e50',
  email: 'ana@example.com',
  displayName: 'Ana',
  createdAt: '2026-10-07T20:56:32.768Z',
  settings: { baseCurrency: 'COP', locale: 'es-CO', timezone: 'America/Bogota', theme: 'system' },
};

function respond(status: number, body?: unknown): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

describe('apiRequest', () => {
  it('envía la cabecera anti-CSRF y JSON en peticiones que modifican datos', async () => {
    const fetchImpl = respond(200, user);
    await apiRequest('/me/settings', {
      method: 'PATCH',
      body: { theme: 'dark' },
      schema: userDtoSchema,
      fetchImpl,
    });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/me/settings');
    expect(init?.headers).toMatchObject({
      'x-csrf-protection': '1',
      'content-type': 'application/json',
    });
    expect(init?.credentials).toBe('same-origin');
  });

  it('no envía la cabecera anti-CSRF en GET', async () => {
    const fetchImpl = respond(200, user);
    await apiRequest('/me', { schema: userDtoSchema, fetchImpl });
    const [, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(init?.headers).not.toHaveProperty('x-csrf-protection');
  });

  it('devuelve los datos validados', async () => {
    const data = await apiRequest('/me', { schema: userDtoSchema, fetchImpl: respond(200, user) });
    expect(data.email).toBe('ana@example.com');
  });

  it('convierte el error estándar en ApiError con detalle por campo', async () => {
    const fetchImpl = respond(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Algunos datos no son válidos.',
        requestId: 'r-1',
        issues: [{ path: 'email', message: 'Escribe un correo válido.' }],
      },
    });
    const error = await apiRequest('/auth/login', { method: 'POST', body: {}, fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldError('email')).toBe('Escribe un correo válido.');
    expect((error as ApiError).requestId).toBe('r-1');
  });

  it('no muestra datos que no cumplen el contrato', async () => {
    const error = await apiRequest('/me', {
      schema: userDtoSchema,
      fetchImpl: respond(200, { id: 1 }),
    }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('CONTRACT_MISMATCH');
  });

  it('distingue fallos de red y respuestas sin formato', async () => {
    const offline = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(
      ((await apiRequest('/me', { fetchImpl: offline }).catch((e: unknown) => e)) as ApiError).code,
    ).toBe('NETWORK_ERROR');
    const html = vi.fn(() => Promise.resolve(new Response('<html>502</html>', { status: 502 })));
    expect(
      ((await apiRequest('/me', { fetchImpl: html }).catch((e: unknown) => e)) as ApiError).code,
    ).toBe('SERVICE_UNAVAILABLE');
  });

  it('acepta 204 sin cuerpo', async () => {
    await expect(
      apiRequest('/auth/logout', { method: 'POST', fetchImpl: respond(204) }),
    ).resolves.toBeUndefined();
  });
});
