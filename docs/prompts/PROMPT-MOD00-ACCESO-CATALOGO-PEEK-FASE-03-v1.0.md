# PROMPT — MOD00 Acceso — Catálogo en peek (Fase 3 QA)

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-SR-QA
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Contrato:** spec prevalente **v1.10** + Fase 3 **v1.2**
**Implementación:** AI-FE-PLATFORM GO (Jest cliente 59 passed; E2E access-ui 11 passed + 6 snapshots)

---

## 1. Objetivo

Verificar trazabilidad CA ↔ test de la opción B (catálogo solo en peek). No implementes la feature. Puedes **añadir tests** si un CA está hueco. No firmes G6.

## 2. Entrada

- `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` v1.10 (§6.8, §8, §10.1, CA-ACC-UX-14, 21–30, POST-01…06; UX-15/16/18 Superados)
- `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` v1.2 (CA-ACV2-01…07)
- `AccessControlSettingsClient.tsx` + `.spec.tsx` + `mod00-settings-labels.ts`
- `e2e/tests/portal-settings-access-ui.spec.ts` + snapshots + `portal-settings-access-governance.spec.ts`
- Skills: `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`

## 3. Matriz mínima

Confirmar evidencia (test que pasa) para: UX-14 (empty+CTA sin heading sugeridos en página), UX-21…30, POST-01…04 y 06, ACV2-01/03/04. POST-05 walkthrough de sesión real = **fuera** (G6). UX-15/16/18 no exigir.

Barrido vocabulario ruta access: cero `plantilla` / `sistema` / `módulo` / `categoría base` / claves crudas en UI de Access.

## 4. Comandos

- `pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --no-coverage`
- Playwright del spec access-ui si el entorno lo permite (no regenere snapshots salvo fallo real vs spec).

## 5. Entregable

Tabla CA → archivo:línea o «HUECO». Veredicto GO / GO CON DEUDA / NO-GO. No informe nuevo; no G6. Si añades tests, dilo.
