---
name: playwright-skill
description: Guia de automatizacion Playwright orientada a VS Code, Windows y validaciones E2E del stack web de iWana neXt.
---

# Playwright Skill

## Proposito

Usa esta skill para validar interfaces web, flujos E2E, accesibilidad basica y regresiones funcionales en aplicaciones web del repo.

La skill esta alineada al entorno de trabajo habitual del proyecto:

- Windows + PowerShell
- VS Code
- Next.js App Router en frontend
- Playwright como herramienta E2E oficial

No asume entornos Unix ni depende de rutas tipo /tmp como convencion primaria.

## Cuando usarla

Activa esta skill cuando necesites:

- Verificar una pantalla o flujo del frontend.
- Escribir o ajustar pruebas E2E con Playwright.
- Validar formularios, navegacion, filtros, tablas o estados vacios.
- Confirmar accesibilidad basica y comportamiento responsive.
- Investigar regresiones visuales o funcionales reproducibles en navegador.

## Enfoque de trabajo

### 1. Prioriza pruebas estables y reproducibles

Evita automatizaciones fragiles. Prefiere:

- Selectores semanticos o por rol.
- Datos de prueba controlados.
- Esperas explicitas por estado observable.
- Flujos cortos y verificables.

### 2. Prueba comportamiento, no implementacion interna

La prueba debe confirmar lo que el usuario puede hacer u observar:

- Navegacion correcta.
- Validaciones visibles.
- Estados de carga, error y exito.
- Persistencia o reflejo del cambio en UI.

### 3. Integra Playwright con la arquitectura real

Ten en cuenta:

- Las pantallas pueden mezclar Server Components y Client Components.
- Los datos pueden venir de APIs internas del repo.
- Si el flujo depende de autenticacion o tenant, la preparacion del contexto debe ser explicita.

## Recomendaciones para este repo

### Selectores

Prefiere en este orden:

1. `getByRole`
2. `getByLabel`
3. `getByText` cuando el texto sea estable
4. `data-testid` solo si no existe una mejor opcion accesible

### Esperas

Prefiere:

- `await expect(...).toBeVisible()`
- `await expect(...).toHaveText()`
- `await page.waitForURL(...)` cuando cambie la ruta

Evita:

- `waitForTimeout` salvo diagnostico temporal
- Selectores CSS fragiles acoplados a estructura visual

### Datos y seguridad

- No usar PII real en pruebas.
- No embutir secretos ni tokens en codigo de test.
- Si hace falta autenticacion, usar fixtures o utilidades de test controladas.
- Si un flujo es multi-tenant, el tenant de prueba debe quedar explicito.

## Estructura sugerida de un test

```ts
import { expect, test } from "@playwright/test";

test("permite crear un registro y ver confirmacion", async ({ page }) => {
  await page.goto("/registros/nuevo");

  await page.getByLabel("Nombre").fill("Cliente de prueba");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Registro creado")).toBeVisible();
  await expect(page).toHaveURL(/registros/);
});
```

## Casos prioritarios

En iWana neXt, Playwright deberia priorizar:

- Flujos criticos del portal o backoffice.
- Autenticacion y navegacion protegida.
- Formularios con validaciones relevantes.
- Escenarios de tenant visible en UI cuando aplique.
- Regresiones de accesibilidad o responsive en vistas clave.

## Depuracion

Cuando una prueba falle:

- Confirma si es problema del flujo, del dato o del entorno.
- Revisa si el selector representa la intencion del usuario.
- Inspecciona errores de consola o red si la interfaz depende de fetch/API.
- Reduce el caso al minimo reproducible antes de ampliar cobertura.

## Integracion con el repo

Si la tarea no es solo exploratoria, deja la prueba donde corresponda en la estructura del proyecto y mantenla coherente con Jest y Supertest como parte de la estrategia total de calidad.

## Anti-patrones

Evita:

- Scripts temporales con rutas Unix hardcodeadas como /tmp.
- Pruebas que dependen de temporizadores arbitrarios.
- Selectores por clases visuales inestables.
- Mezclar demasiados objetivos en un solo test largo.
- Automatizar flujos que no tienen datos o estado controlado.
- Reproducir validaciones internas del backend en vez de verificar el resultado visible para el usuario.
