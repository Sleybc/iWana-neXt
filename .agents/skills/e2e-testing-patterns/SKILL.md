---
name: e2e-testing-patterns
description: Patrones E2E avanzados con Playwright para iWana neXt. Usar para flujos de usuario críticos, tests flaky, trazas y CI paralelo. Complementa playwright-skill con patrones de profundidad.
---

# E2E Testing Patterns — iWana neXt

## Propósito

Complementa `playwright-skill` con patrones avanzados de E2E para el stack real del proyecto:
autenticación multi-tenant, Page Object Model, fixtures de sesión, trazas en CI y sharding con Turborepo.

## Usar este skill cuando

- Se implementen flujos E2E críticos (login, MFA, dashboard, gestión de tenants).
- Se depuren tests flaky o con timeouts en CI.
- Se configure paralelismo y sharding en el pipeline de Playwright.
- Se necesiten patrones de autenticación reutilizables entre tests (storageState).
- Se quiera establecer el estándar de Page Object Model para el proyecto.

## No usar este skill cuando

- La tarea sea de tests unitarios o de integración (usar `testing-patterns`).
- Se use Cypress u otra herramienta — el stack solo soporta Playwright.

## Selectores: prioridad semántica primero

```typescript
// ✅ Prioridad 1: roles ARIA (más resiliente)
await page.getByRole('button', { name: 'Iniciar sesión' }).click();
await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('admin@iwana.co');

// ✅ Prioridad 2: labels y placeholders
await page.getByLabel('Contraseña').fill('secret');

// ✅ Prioridad 3: texto visible
await page.getByText('Dashboard').click();

// ⚠️ Solo si no hay alternativa semántica: data-testid
await page.getByTestId('tenant-selector').click();

// ❌ Nunca: selectores CSS internos o clases de Tailwind
await page.locator('.bg-iwana-primary button').click(); // Frágil
```

## Fixture de autenticación con storageState

Reutilizar sesión entre tests evita login en cada test y reduce el tiempo de suite.

```typescript
// e2e/fixtures/auth.ts
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Login programático — no via UI para ahorrar tiempo
    const response = await page.request.post('http://localhost:3000/api/v1/auth/platform/login', {
      data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
    });
    const { data } = await response.json();

    // Persistir token en localStorage antes de navegar
    await page.goto('http://localhost:3001');
    await page.evaluate((token) => {
      localStorage.setItem('iwana.web.access-token', token);
    }, data.accessToken);

    await use(page);
  },
});

export { expect };
```

Uso en tests:
```typescript
import { test, expect } from '../fixtures/auth';

test('dashboard carga con sesión activa', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('http://localhost:3001/dashboard');
  await expect(authenticatedPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

## Page Object Model

```typescript
// e2e/pages/login.page.ts
import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('http://localhost:3001/auth/login');
  }

  async fillCredentials(email: string, password: string) {
    await this.page.getByLabel('Correo electrónico').fill(email);
    await this.page.getByLabel('Contraseña').fill(password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }

  async expectError(message: string) {
    await expect(this.page.getByRole('alert')).toContainText(message);
  }
}
```

## Verificación de contexto de tenant

```typescript
test('tenant activo se muestra en el dashboard', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('http://localhost:3001/dashboard');

  // Verificar que el tenant name/slug es visible en la UI
  await expect(authenticatedPage.getByTestId('tenant-name')).toBeVisible();
  await expect(authenticatedPage.getByTestId('tenant-name')).not.toBeEmpty();
});
```

## Depuración de tests flaky

```bash
# Ejecutar con trazas siempre activas (para depuración)
pnpm test:e2e -- --trace=on

# Ver la traza de un test fallido
npx playwright show-trace test-results/nombre-test/trace.zip

# Ejecutar en modo headed para ver qué pasa
pnpm test:e2e:headed

# Repetir un test N veces para detectar flakiness
npx playwright test nombre.spec.ts --repeat-each=5
```

## Causas comunes de flakiness y soluciones

| Causa | Solución |
|---|---|
| Race condition en carga de datos | `await expect(locator).toBeVisible()` antes de interactuar |
| Animaciones CSS que interfieren | `await page.waitForLoadState('networkidle')` |
| Token expirado entre tests | Usar fixture de autenticación con storageState |
| Puerto no disponible en CI | Verificar que `webServer` en config apunta al puerto correcto |
| Test dependiente de orden | Aislar estado — cada test debe poder correr solo |

## Configuración de sharding en CI

```bash
# Dividir la suite en 4 shards para CI paralelo
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

En GitHub Actions:
```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: pnpm test:e2e -- --shard=${{ matrix.shard }}/4
```

## Checklist de test E2E

- [ ] Usa selectores semánticos (getByRole, getByLabel) como primera opción
- [ ] El test puede correr de forma aislada (sin depender de otros tests)
- [ ] Usa fixture de autenticación en vez de login manual en cada test
- [ ] Tiene assertion explícito — no solo navega, verifica resultado
- [ ] Pasa en CI con `--reporter=list` y genera trazas en fallo

## Anti-patrones

- Usar Cypress — no está en el stack del proyecto
- Selectores CSS de clases Tailwind — frágiles ante cambios de estilo
- Login via UI en cada test — lento e innecesario con storageState
- Tests que dependen del orden de ejecución — cada test debe ser idempotente
- `page.waitForTimeout(2000)` — síntoma de race condition, usar assertions de Playwright
