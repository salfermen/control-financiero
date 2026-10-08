import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'frase-e2e-suficientemente-larga'; // gitleaks:allow (clave ficticia de prueba)
const uniqueEmail = () => `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@prueba.co`;

/** Normaliza espacios no separables de Intl para comparar textos con montos. */
const money = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s'));

/** «Hoy» en Bogotá (la zona del usuario de prueba) más `days` días, como AAAA-MM-DD. */
function bogotaDate(days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function register(page: Page) {
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill('Ana Finanzas');
  await page.getByLabel('Correo').fill(uniqueEmail());
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

async function createAccount(page: Page, name: string, balance: string, date?: string) {
  await page.goto('/cuentas/nueva');
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel(/^Saldo en esa fecha/).fill(balance);
  if (date) await page.getByLabel('Fecha del saldo').fill(date);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/cuentas$/);
}

async function expense(
  page: Page,
  description: string,
  amount: string,
  options: { category?: string; date?: string; account?: string } = {},
) {
  await page.goto('/movimientos/nuevo');
  if (options.account) await page.getByLabel('Cuenta').selectOption({ label: options.account });
  await page.getByLabel('Monto', { exact: true }).fill(amount);
  await page.getByLabel('Descripción').fill(description);
  if (options.date) await page.getByLabel('Fecha', { exact: true }).fill(options.date);
  if (options.category) {
    await page.getByLabel('Categoría').selectOption({ label: options.category });
  }
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/\/movimientos\?mes=/);
}

test.describe('lo programado y el sueldo restante', () => {
  test('una cuenta que empieza en el futuro muestra cuánto queda después de sus gastos', async ({
    page,
  }) => {
    await register(page);
    const payday = bogotaDate(20);
    await createAccount(page, 'Sueldo', '1.500.000', payday);
    await expense(page, 'Ahorro para inversiones', '1.000.000', { date: payday });
    await expense(page, 'Pago tarjeta', '267.633', { date: bogotaDate(21) });
    await expense(page, 'Videojuego', '162.000', { date: bogotaDate(21) });
    await expect(page.getByText('Programado').first()).toBeVisible();

    await page.goto('/cuentas');
    const card = page.locator('li', { hasText: 'Sueldo' });
    await expect(card).toContainText('Empieza el');
    await expect(card).toContainText('Te queda después de lo programado');
    await expect(card).toContainText(money('$ 70.367'));
    await expect(card).toContainText('3 movimiento(s) programado(s)');

    await page.goto('/inicio');
    await expect(page.getByRole('heading', { name: '¿Cómo estás?' })).toBeVisible();
    await expect(page.getByText(/«Sueldo» empieza el/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Próximos movimientos' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ahorro para inversiones' })).toBeVisible();
  });

  test('separa el saldo de hoy de los gastos con fecha futura', async ({ page }) => {
    await register(page);
    await createAccount(page, 'Ahorros', '1.000.000');
    await expense(page, 'Arriendo', '400.000', { date: bogotaDate(3) });

    await page.goto('/cuentas');
    const card = page.locator('li', { hasText: 'Ahorros' });
    await expect(card).toContainText(money('$ 1.000.000'));
    await expect(card).toContainText(money('$ 600.000'));

    await page.goto('/inicio');
    await expect(page.getByText('Disponible hoy').locator('..')).toContainText(
      money('$ 1.000.000'),
    );
  });
});

test.describe('presupuestos y categorías', () => {
  test('presupuesto por categoría con subcategorías, alertas, cambio de límite y quitar', async ({
    page,
  }) => {
    await register(page);
    await createAccount(page, 'Ahorros', '2.000.000');

    await page.goto('/presupuestos');
    await expect(page.getByRole('heading', { name: /Sin presupuestos en/ })).toBeVisible();
    await page.getByLabel('¿Para qué gastos?').selectOption({ label: 'Entretenimiento' });
    await page.getByLabel(/Límite mensual/).fill('300.000');
    await expect(page.getByText(money('Se registrará: $ 300.000'))).toBeVisible();
    await page.getByRole('button', { name: 'Crear presupuesto' }).click();
    await expect(page.getByRole('progressbar', { name: /Entretenimiento/ })).toBeVisible();

    await expense(page, 'Juego', '180.000', { category: '— Videojuegos' });
    await page.goto('/presupuestos');
    const budget = page.locator('li', { hasText: 'Entretenimiento' });
    await expect(budget).toContainText(/60\s?%/);
    await expect(budget).toContainText(money('quedan $ 120.000'));

    await expense(page, 'Cine', '50.000', { category: 'Entretenimiento' });
    await page.goto('/presupuestos');
    await expect(budget.getByTitle('Más del 75 %')).toBeVisible();

    await budget.getByRole('button', { name: 'Cambiar límite' }).click();
    await budget.getByLabel('Nuevo límite mensual').fill('500.000');
    await budget.getByRole('button', { name: 'Guardar' }).click();
    await expect(budget).toContainText(/46\s?%/);

    await page.goto('/inicio');
    await expect(page.getByRole('progressbar', { name: /Entretenimiento/ })).toBeVisible();

    await page.goto('/presupuestos');
    await budget.getByRole('button', { name: 'Quitar' }).click();
    await budget.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByRole('heading', { name: /Sin presupuestos en/ })).toBeVisible();
  });

  test('categorías propias: crear, validar nombre, renombrar y eliminar', async ({ page }) => {
    await register(page);
    await page.goto('/categorias');
    await page.getByLabel('Nombre').fill('Mascotas');
    await page.getByRole('button', { name: 'Crear categoría' }).click();
    const row = page.locator('li', { hasText: 'Mascotas' });
    await expect(row).toContainText('Tuya');

    await page.getByLabel('Nombre').fill('mascotas');
    await page.getByRole('button', { name: 'Crear categoría' }).click();
    await expect(page.getByText('Ese nombre ya existe.')).toBeVisible();

    await row.getByRole('button', { name: 'Renombrar' }).click();
    await row.getByLabel('Nuevo nombre').fill('Mascotas y veterinario');
    await row.getByRole('button', { name: 'Guardar' }).click();
    const renamed = page.locator('li', { hasText: 'Mascotas y veterinario' });
    await expect(renamed).toBeVisible();

    await renamed.getByRole('button', { name: 'Eliminar' }).click();
    await renamed.getByRole('button', { name: /Eliminar «Mascotas y veterinario»/ }).click();
    await expect(page.locator('li', { hasText: 'Mascotas y veterinario' })).toHaveCount(0);
  });
});
