import { expect, test } from '@playwright/test';
import { loginAsPlatformAdmin, setupWebApiMocks } from './helpers/web-api-mocks';

function buildDateInput(dayOffset: number): string {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseInputDate(value: string): Date | null {
  const [yearPart, monthPart, dayPart] = value.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectDateFromPickerByPlaceholder(
  page: import('@playwright/test').Page,
  scope: import('@playwright/test').Locator,
  triggerId: string,
  value: string,
) {
  const targetDate = parseInputDate(value);
  if (!targetDate) {
    throw new Error(`Fecha inválida para DatePicker: ${value}`);
  }

  const trigger = scope.locator(`#${triggerId}`).first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const popover = page.locator('[data-state="open"][data-side]').last();
  await expect(popover).toBeVisible();

  const today = new Date();
  const monthDelta =
    (targetDate.getFullYear() - today.getFullYear()) * 12 +
    (targetDate.getMonth() - today.getMonth());

  if (monthDelta > 0) {
    for (let index = 0; index < monthDelta; index += 1) {
      await popover.getByRole('button', { name: /siguiente|next/i }).click();
    }
  }

  if (monthDelta < 0) {
    for (let index = 0; index < Math.abs(monthDelta); index += 1) {
      await popover.getByRole('button', { name: /anterior|previous/i }).click();
    }
  }

  const targetLabel = targetDate.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const escapedLabel = escapeRegExp(targetLabel);
  await popover.getByRole('button', { name: new RegExp(`\\b${escapedLabel}\\b`, 'i') }).click();
}

test.describe('Web auditoria - filtros de fecha con DatePicker', () => {
  test.beforeEach(
    setupWebApiMocks({
      onUnhandledApiRoute: '404',
    }),
  );

  test('filtra y restablece la tabla de plataforma usando Fecha desde', async ({ page }) => {
    await loginAsPlatformAdmin(page);

    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();

    const platformSection = page.locator('section[aria-labelledby="platform-audit-heading"]');
    await expect(platformSection.getByText('Administrador plataforma')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      platformSection,
      'audit-date-from',
      buildDateInput(1),
    );
    await expect(platformSection.getByText('Sin eventos con estos filtros')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      platformSection,
      'audit-date-from',
      buildDateInput(-3),
    );
    await expect(platformSection.getByText('Administrador plataforma')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      platformSection,
      'audit-date-to',
      buildDateInput(-10),
    );
    await expect(platformSection.getByText('Sin eventos con estos filtros')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      platformSection,
      'audit-date-to',
      buildDateInput(1),
    );
    await expect(platformSection.getByText('Administrador plataforma')).toBeVisible();
  });

  test('filtra y restablece la tabla Por empresa usando Fecha desde y Fecha hasta', async ({
    page,
  }) => {
    await loginAsPlatformAdmin(page);

    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();

    const tenantSection = page.locator('section[aria-labelledby="tenant-audit-heading"]');
    await expect(tenantSection.locator('[title^="Actor: Operador demo"]')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      tenantSection,
      'audit-date-from',
      buildDateInput(1),
    );
    await expect(tenantSection.getByText('Sin eventos con estos filtros')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      tenantSection,
      'audit-date-from',
      buildDateInput(-3),
    );
    await expect(tenantSection.locator('[title^="Actor: Operador demo"]')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      tenantSection,
      'audit-date-to',
      buildDateInput(-10),
    );
    await expect(tenantSection.getByText('Sin eventos con estos filtros')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      tenantSection,
      'audit-date-to',
      buildDateInput(1),
    );
    await expect(tenantSection.locator('[title^="Actor: Operador demo"]')).toBeVisible();
  });

  test('cambia de empresa y mantiene filtros DatePicker funcionales en la tabla tenant', async ({
    page,
  }) => {
    await loginAsPlatformAdmin(page);

    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();

    const tenantSection = page.locator('section[aria-labelledby="tenant-audit-heading"]');
    await expect(tenantSection.locator('[title^="Actor: Operador demo"]')).toBeVisible();

    await tenantSection.getByRole('button', { name: 'Seleccionar empresa' }).click();
    await page.getByRole('option', { name: 'Fibernet Colombia' }).click();

    await expect(tenantSection.locator('[title^="Actor: Operador fibernet"]')).toBeVisible();
    await expect(tenantSection.locator('[title^="Actor: Operador demo"]')).toHaveCount(0);

    await selectDateFromPickerByPlaceholder(
      page,
      tenantSection,
      'audit-date-from',
      buildDateInput(-3),
    );
    await expect(tenantSection.getByText('Sin eventos con estos filtros')).toBeVisible();

    await selectDateFromPickerByPlaceholder(
      page,
      tenantSection,
      'audit-date-from',
      buildDateInput(-10),
    );
    await expect(tenantSection.locator('[title^="Actor: Operador fibernet"]')).toBeVisible();
  });
});
