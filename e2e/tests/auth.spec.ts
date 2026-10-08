import { expect, test } from '@playwright/test';

const PASSWORD = 'frase-e2e-suficientemente-larga'; // gitleaks:allow (clave ficticia de prueba)
const uniqueEmail = () => `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@prueba.co`;

test.describe('acceso', () => {
  test('una ruta protegida sin sesión lleva a ingresar', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/ingresar$/);
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  });

  test('registro → inicio sin datos ficticios → cierre de sesión → ingreso', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/registro');
    await page.getByLabel('Nombre').fill('Salim Prueba');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByLabel(/Acepto los términos/).check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('heading', { name: 'Hola, Salim Prueba' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Empieza creando tu primera cuenta' }),
    ).toBeVisible();
    // Regla contra datos falsos: sin movimientos, ninguna cifra distinta de cero.
    await expect(page.locator('main')).not.toContainText(/\$\s?[1-9]/);
    // Sin worker no hay TRM guardada: se dice, no se inventa.
    await expect(page.getByText(/Datos temporalmente no disponibles/)).toBeVisible();

    // La cookie de sesión no es accesible desde JavaScript.
    const visibleToScript = await page.evaluate(() => document.cookie);
    expect(visibleToScript).not.toContain('cf_session');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);

    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test('muestra errores útiles de la API', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(uniqueEmail());
    await page.getByLabel('Contraseña').fill('no-es-la-clave');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      'Correo o contraseña incorrectos.',
    );

    await page.goto('/registro');
    await page.getByLabel('Nombre').fill('Ana');
    await page.getByLabel('Correo').fill(uniqueEmail());
    await page.getByLabel('Contraseña').fill('corta');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('La contraseña debe tener al menos 12 caracteres.')).toBeVisible();
    await expect(
      page.getByText('Debes aceptar los términos y la política de privacidad.'),
    ).toBeVisible();
  });
});
