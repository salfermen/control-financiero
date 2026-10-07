import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getSession } from '@/lib/server-session';
import { LogoutButton } from './logout-button';

export const metadata: Metadata = { title: 'Inicio' };
export const dynamic = 'force-dynamic';

/**
 * Pantalla de inicio de la fase F1–F2. Muestra solo información real (perfil
 * y ajustes). Los módulos financieros aún no existen y se dice explícitamente:
 * no hay saldos, gráficos ni botones que aparenten funcionar.
 */
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { user } = session;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-text-muted">Control Financiero</p>
          <h1 className="text-2xl font-semibold">Hola, {user.displayName}</h1>
        </div>
        <LogoutButton />
      </header>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Tu cuenta está lista</h2>
        <p className="text-sm text-text-muted">
          Todavía no hay información financiera registrada. El registro de cuentas y movimientos
          llegará en las próximas fases; aquí no se muestran saldos ni cifras de ejemplo.
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Tus ajustes</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">Moneda base</dt>
            <dd className="font-medium">{user.settings.baseCurrency}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Idioma</dt>
            <dd className="font-medium">{user.settings.locale}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Zona horaria</dt>
            <dd className="font-medium">{user.settings.timezone}</dd>
          </div>
        </dl>
      </Card>

      <Card className="bg-surface-muted">
        <h2 className="mb-2 text-lg font-semibold">Estado de la plataforma</h2>
        <ul className="flex flex-col gap-1 text-sm text-text-muted">
          <li>Disponible: acceso seguro, perfil, monedas y categorías.</li>
          <li>En construcción: núcleo financiero, cuentas, movimientos y presupuestos.</li>
        </ul>
      </Card>
    </main>
  );
}
