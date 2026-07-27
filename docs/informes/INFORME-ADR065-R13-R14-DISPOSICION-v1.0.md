# INFORME — Disposición R-13 (CI sin unit tests) + R-14 (flakes portal)

**Versión:** 1.0
**Fecha:** 2026-07-25
**Modo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Clasificación:** Uso interno
**Skills:** `testing-patterns`, protocolo multiagente §4 gates

---

## Veredicto

| ID | Severidad | Bloquea merge hoy | Origen |
| --- | --- | --- | --- |
| **R-14** | BAJA (producto) / MEDIA (si entra en CI prematuro) | No | Contención jsdom; specs intactos vs HEAD |
| **R-13** | MEDIA (gobernanza / AGENTS.md) | No (hoy) | `ci.yml` sin `pnpm test`; transversal |

Ninguno es defecto de la remediación ADR-065 Ola 1. Se levantan porque las olas 2–7 heredan el mismo stop/go.

---

## Secuencia obligatoria (no invertir)

```text
1. Estabilizar R-14 (portal Jest)
2. Evidencia: suite portal completa ×2 consecutivas verdes (o 1 completa + 3 aisladas de los flakes)
3. Solo entonces R-13: añadir pnpm test al CI
```

**Razón:** meter `pnpm test` antes de estabilizar convierte el primer flake en bloqueo de merges ajenos y enseña a reintentar — el anti-patrón que dejó pasar R-1 hasta el re-gate.

---

## R-14 — estabilización

**Evidencia de diagnóstico (auditoría):** Timeout jsdom; 7–9 s bajo carga vs ~5,4 s aislados; `apps/portal/jest.config.js` sin `testTimeout` ni `maxWorkers`.

**Salida (AI-SR-QA R, AI-FE-PLATFORM C si toca specs):**

1. `jest.config.js` del portal: `testTimeout` generoso (p. ej. 15_000) y `maxWorkers` acotado (p. ej. 50% o fijo 2–4) para reducir contención.
2. En `CreateTaskSchedulingDialog.spec.tsx` y `StockIssueFormDrawer.spec.tsx`: endurecer esperas (`findBy*` / `waitFor` con timeout explícito) solo si tras (1) siguen fallando bajo carga; no reescribir producto.
3. No marcar `.skip`. No subir cobertura falsa.

**Stop/go R-14:** `pnpm --filter @iwana/portal test` completa verde **dos veces seguidas** (o equivalente documentado). Pegar resúmenes Jest (no exit de tubería).

**Estado 2026-07-25:** **GO R-14** — `testTimeout: 15000` + `maxWorkers: '50%'` en `apps/portal/jest.config.js`; 2× `157 suites / 830 tests` verdes; specs flake sin cambios.

---

## R-13 — unit tests en CI (tras R-14 GO)

**Evidencia:** `.github/workflows/ci.yml` — sync:agents, lint, typecheck, build, migraciones/seguridad DB; **cero** `pnpm test`. Solo E2E smoke Playwright en otro workflow.

**Salida (AI-PLAT-OPS R):**

1. Paso `pnpm test` (o `pnpm exec turbo run test --filter=...` alineado al monorepo) en `ci.yml` **después** de typecheck/build según dependencias reales de los paquetes con tests.
2. Env mínimo ya usado por migraciones/API (p. ej. `MFA_ENCRYPTION_KEY` si la suite API lo exige en CI).
3. Fallo de tests = rojo de job (no `continue-on-error`).
4. Actualizar comentario de cabecera del workflow (hoy dice Lint + Typecheck + Build).

**Stop/go R-13:** PR de CI que ejecute tests; documentar en stop/go permanente de fase: raíz lint + typecheck + **test en CI**.

**Estado 2026-07-25:** **GO R-13** — `pnpm test` tras Build en `ci.yml`; `MFA_ENCRYPTION_KEY` efímera; job «Lint + Typecheck + Build + Unit tests»; sin cobertura 80% ni `continue-on-error`.

---

## Cierre de disposición

| ID | Estado |
| --- | --- |
| R-14 | **GO** |
| R-13 | **GO** |

Secuencia respetada (flakes → CI). Cobertura ≥80% en CI = ticket posterior.

---

## RACI

| Acción | R | A | C | I |
| --- | --- | --- | --- | --- |
| R-14 estabilizar portal | AI-SR-QA | AI-EM-ARCH | AI-FE-PLATFORM | PLAT-OPS |
| R-13 `pnpm test` en ci.yml | AI-PLAT-OPS | AI-EM-ARCH | AI-SR-QA | SR-FULL |

**Sin escalación al CTO.**

---

## Relación con stop/go permanente

Ya exigimos `pnpm lint` + `pnpm typecheck` en raíz en local. Tras R-13, el enforcement de suite deja de ser «a mano» y pasa a CI — alineado a AGENTS.md merge gates y a la lección R-1.
