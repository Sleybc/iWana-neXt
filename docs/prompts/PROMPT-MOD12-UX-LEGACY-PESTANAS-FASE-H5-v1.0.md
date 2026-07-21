# PROMPT — MOD12 Inventario — UX pestañas legacy — Fase H5

> **Estado: CERRADO (G5+G6+G7 GO recomendado 2026-07-21).**

## Vínculos

- PRD: `docs/prds/PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md`
- Spec: `docs/specs/2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md` (D-H5-01…06)
- Auditoría: `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` (H5)
- Consultas: AI-DS-OWNER GO Select-only; AI-PROD-UX OK sin 12ª pestaña

## Módulo

- MOD12 / Fase H5 / v1.0 / 2026-07-21
- Generado por: AI-EM-ARCH
- Destinatario: **AI-FE-PLATFORM (líder)** + **AI-SR-QA (tests)**

---

## 1. Objetivo

Cerrar H5: cero `<select>` nativos en inventory portal; Movimientos y solicitar baja fuera del markup inline de `InventoryClient`.

## 2. Instrucciones FE (AI-FE-PLATFORM)

1. Crear `MovementsWorkspace.tsx` (+ `.spec.tsx`) — D-H5-01.
2. Ampliar `WriteOffsPanel` con sección solicitar baja — D-H5-02.
3. Migrar Select en `AssetLoansPanel` y `UsefulLifeAlertsPanel` — D-H5-03.
4. Adelgazar `TabsContent` movements/writeoffs en `InventoryClient` — D-H5-04.
5. Skills: `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`, `system-vocabulary-review`, `testing-patterns`.

**Stop:** si propones pestaña nueva, primitive Select nueva, o refactor masivo de summary/catalog → escala AI-EM-ARCH.

## 3. QA (AI-SR-QA)

- Matriz D-H5-05; `pnpm --filter @iwana/portal test` scopes afectados.
- E2E `portal-inventory-scm` smoke bajas y/o vida útil.

## 4. Entregables

Código + tests; informe `INFORME-MOD12-UX-LEGACY-PESTANAS-FASE-H5-v1.0.md`; handoff G5→G6→G7; actualizar informe maestro (H5 cerrado → H6).
