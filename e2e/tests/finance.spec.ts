import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'frase-e2e-suficientemente-larga'; // gitleaks:allow (clave ficticia de prueba)
const uniqueEmail = () => `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@prueba.co`;

/** Normaliza espacios no separables de Intl para comparar textos con montos. */
const money = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s'));

async function register(page: Page) {
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill('Ana Finanzas');
  await page.getByLabel('Correo').fill(uniqueEmail());
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

async function createAccount(page: Page, name: string, type: string, balance: string) {
  await page.goto('/cuentas/nueva');
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Tipo').selectOption(type);
  await page.getByLabel(/^Saldo en esa fecha|^Lo que debes/).fill(balance);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/cuentas$/);
}

async function expense(page: Page, description: string, amount: string, category?: string) {
  await page.goto('/movimientos/nuevo');
  await page.getByLabel('Monto', { exact: true }).fill(amount);
  await page.getByLabel('Descripción').fill(description);
  if (category) await page.getByLabel('Categoría').selectOption({ label: category });
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/\/movimientos\?mes=/);
}

test.describe('cuentas y movimientos', () => {
  test('cuenta → gasto → ingreso → saldo y resumen del mes', async ({ page }) => {
    await register(page);

    await page.goto('/cuentas');
    await expect(page.getByRole('heading', { name: 'Aún no tienes cuentas' })).toBeVisible();
    await page.goto('/cuentas/nueva');
    await page.getByLabel('Nombre').fill('Ahorros');
    await page.getByLabel(/^Saldo en esa fecha/).fill('1.500.000');
    await expect(page.getByText(money('Se registrará: $ 1.500.000'))).toBeVisible();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/cuentas$/);
    await expect(page.getByText(money('$ 1.500.000')).first()).toBeVisible();

    await expense(page, 'Almuerzo', '25.000', 'Alimentación');
    await expect(page.getByRole('link', { name: /Almuerzo/ })).toContainText(money('−$ 25.000'));

    await page.goto('/movimientos/nuevo?tipo=ingreso');
    await page.getByLabel('Monto', { exact: true }).fill('2900000');
    await page.getByLabel('Descripción').fill('Sueldo');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('link', { name: /Sueldo/ })).toContainText(money('+$ 2.900.000'));
    await expect(page.getByText('Neto del mes').locator('..')).toContainText(money('$ 2.875.000'));

    await page.goto('/cuentas');
    await expect(page.getByText(money('$ 4.375.000')).first()).toBeVisible();
  });

  test('transferencia entre cuentas no cuenta como gasto', async ({ page }) => {
    await register(page);
    await createAccount(page, 'Ahorros', 'savings', '1000000');
    await createAccount(page, 'Efectivo', 'cash', '0');

    await page.goto('/movimientos/nuevo?tipo=transferencia');
    await page.getByLabel('Desde').selectOption({ label: 'Ahorros (COP)' });
    await page.getByLabel('Hacia').selectOption({ label: 'Efectivo (COP)' });
    await page.getByLabel(/Monto que sale/).fill('100.000');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/movimientos\?mes=/);
    await expect(page.getByText('Gastos').locator('..')).toContainText(money('$ 0'));

    await page.goto('/cuentas');
    await expect(page.getByText(money('$ 900.000')).first()).toBeVisible();
    await expect(page.getByText(money('$ 100.000')).first()).toBeVisible();
  });

  test('compra en dólares: sin TRM pide el valor cobrado; luego se corrige y se elimina', async ({
    page,
  }) => {
    await register(page);
    await createAccount(page, 'Tarjeta débito', 'checking', '1000000');

    await page.goto('/movimientos/nuevo');
    await page.getByLabel('Monto', { exact: true }).fill('59,99');
    await page.getByLabel('Moneda').selectOption('USD');
    await page.getByLabel('Descripción').fill('Juego en Steam');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(/No hay tasa oficial USD\/COP/)).toBeVisible();

    await page.getByLabel(/Escribir lo que me cobraron/).check();
    await page.getByLabel(/Valor cobrado/).fill('243.500');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/movimientos\?mes=/);
    const row = page.getByRole('link', { name: /Juego en Steam/ });
    await expect(row).toContainText(money('−$ 243.500'));
    await expect(row).toContainText(/US\$\s59,99/);

    await expense(page, 'Café', '8.000');
    await page.getByRole('link', { name: /Café/ }).click();
    await page.getByLabel('Monto (COP)').fill('9.500');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(money('−$ 9.500')).first()).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar movimiento' }).click();
    await page.getByRole('button', { name: 'Sí, eliminar' }).click();
    await expect(page).toHaveURL(/\/movimientos\?mes=/);
    await expect(page.getByRole('link', { name: /Café/ })).toHaveCount(0);
  });
});
