---
description: "R-14 estabilizar flakes Jest portal — AI-SR-QA"
name: "R-14 portal jest flakes"
agent: "sr-qa"
---

# PROMPT — AI-SR-QA · R-14

**Emisor:** AI-EM-ARCH  
**Disposición:** [INFORME-ADR065-R13-R14-DISPOSICION-v1.0](../../docs/informes/INFORME-ADR065-R13-R14-DISPOSICION-v1.0.md)  
**Skills:** `testing-patterns`  
**Consulta:** AI-FE-PLATFORM si hace falta tocar el spec (no el producto).

## Objetivo

Estabilizar flakes bajo carga en `@iwana/portal` **antes** de que CI ejecute unit tests (R-13).

## Archivos

- `apps/portal/jest.config.js` — sin `testTimeout` / `maxWorkers` hoy
- `apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx`
- `apps/portal/src/components/inventory/StockIssueFormDrawer.spec.tsx`

## Pasos

1. Añadir `testTimeout` (p. ej. 15000) y `maxWorkers: '50%'` o entero bajo (2–4) en `jest.config.js`.
2. Correr `pnpm --filter @iwana/portal test` completo; si aún fallan esos dos, endurecer `waitFor`/`findBy` (timeouts) **sin** cambiar componentes de producto.
3. Repetir suite completa **segunda vez**; ambas deben ser verdes.
4. Pegar líneas `Test Suites:` / `Tests:` de ambas corridas (no confiar en exit de `| tail`).

## Prohibido

- `.skip` / comentar tests
- Instalar runners nuevos
- Implementar R-13 (CI)

## Stop / Go

Dos corridas completas verdes → **GO R-14** (desbloquea prompt R-13 a PLAT-OPS).  
Sin commit.
