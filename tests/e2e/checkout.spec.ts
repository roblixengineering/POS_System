import { expect, test } from '@playwright/test';

// Requires a local Supabase with supabase/seed.sql applied (npm run db:reset).
test('cashier: login -> open shift -> scan -> checkout -> receipt', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('cashier@demo.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.goto('/pos');
  if (await page.getByRole('button', { name: 'Open shift' }).isVisible()) {
    await page.getByRole('button', { name: 'Open shift' }).click();
  }
  await page.getByLabel(/Scan barcode/).fill('8964000000011');   // Coca Cola 1.5L
  await page.keyboard.press('Enter');
  await expect(page.getByText('Coca Cola 1.5L')).toBeVisible();
  await page.getByRole('button', { name: /^Charge/ }).click();
  await expect(page).toHaveURL(/\/sales\/.+/);
  await expect(page.getByText(/INV-MB-\d{6}/)).toBeVisible();
});

test('cashier cannot reach management pages', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('cashier@demo.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.goto('/reports');
  await expect(page).toHaveURL(/error=/);
});
