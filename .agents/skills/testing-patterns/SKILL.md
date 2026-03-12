---
name: testing-patterns
description: Patrones de testing para iWana neXt con Jest, Supertest y Playwright. Use cuando se escriban pruebas unitarias, de integracion o E2E alineadas al stack real del proyecto.
---

# Testing Patterns

## Proposito

Este skill aterriza la estrategia de pruebas del proyecto sobre Jest, Supertest y Playwright. Su objetivo es producir pruebas utiles para el stack real de iWana neXt: backend NestJS, frontend web y flujos E2E.

## Usar este skill cuando

- se escriban unit tests en TypeScript
- se implementen integration tests de NestJS
- se preparen pruebas E2E con Playwright
- se corrija un bug y se necesite reproducirlo antes del fix

## No usar este skill cuando

- la tarea sea solo exploracion sin necesidad de pruebas
- se trate de mobile o React Native
- la validacion requerida sea exclusivamente manual

## Piramide de pruebas del proyecto

1. Unit tests con Jest para logica aislada.
2. Integration tests con Jest + Supertest para contratos HTTP y modulos backend.
3. E2E con Playwright para flujos de usuario criticos.

## Reglas base

- testear comportamiento, no implementacion interna
- escribir nombres de prueba que describan el resultado esperado
- usar factories o builders para datos repetidos
- limpiar mocks entre pruebas
- mantener una responsabilidad por test
- en bugfixes, primero reproducir el fallo y despues corregir

## Patrones recomendados

### Factory de datos

```ts
interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "agent";
}

export const buildAuthUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: "user-001",
  email: "agent@example.test",
  role: "agent",
  ...overrides,
});
```

### Unit test de servicio

```ts
describe("PasswordPolicy", () => {
  it("rejects passwords shorter than the minimum length", () => {
    expect(() => validatePassword("short")).toThrow("PASSWORD_TOO_SHORT");
  });
});
```

### Integration test con Supertest

```ts
import request from "supertest";

describe("POST /auth/login", () => {
  it("returns 401 when credentials are invalid", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "bad@example.test", password: "invalid" });

    expect(response.status).toBe(401);
    expect(response.body.message).toContain("invalid");
  });
});
```

### Test de componente web

```ts
import { render, screen } from '@testing-library/react';

describe('CustomerStatusBadge', () => {
  it('renders the active label', () => {
    render(<CustomerStatusBadge status="active" />);

    expect(screen.getByText('Activo')).toBeInTheDocument();
  });
});
```

### E2E con Playwright

```ts
import { test, expect } from "@playwright/test";

test("user can sign in and open dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ops@example.test");
  await page.getByLabel("Contrasena").fill("SecurePass123!");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

## Mocking

- mockear integraciones externas, no la logica que se quiere validar
- preferir doubles pequenos y explicitos
- no convertir un unit test en una simulacion de toda la app
- en integration tests, mockear solo dependencias externas inevitables

## Anti-patrones

- usar ejemplos de `@testing-library/react-native` en este repo
- testear solo que un mock fue llamado si el comportamiento visible importa mas
- snapshots masivos sin criterio
- fixtures duplicados e inconsistentes entre archivos
- pruebas E2E que dependan de datos inestables o del azar

## Ejecucion recomendada

```bash
pnpm test
pnpm test -- --runInBand
pnpm exec jest path/to/file.spec.ts
pnpm exec playwright test
```

## Integracion con otras skills

- `test-driven-development` para disciplina red-green-refactor
- `nestjs-expert` para pruebas de modulos y controladores
- `frontend-dev-guidelines` para componentes y pantallas web
- `playwright-skill` para automatizacion y validacion de flujos reales
