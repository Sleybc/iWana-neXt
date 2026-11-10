# MOD05 Ficha del suscriptor con la composición de UISP · Plan de orquestación

**Spec:** [2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux](../specs/2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md), G0 del usuario el 2026-11-10.
**Objetivo:** ficha densa en dos columnas, «Registrar ▾», insignias derivadas, servicio en página propia, actividad con notas y Documentos, **sin perder ninguna capacidad actual** (spec §0 y CA-1).
**Launcher:** [PROMPT-MOD05-FICHA-UISP-LAUNCH-v1.0](../prompts/PROMPT-MOD05-FICHA-UISP-LAUNCH-v1.0.md) (prevalece si diverge de §8).

## 1. Reglas de ejecución

- Todo en `main`, sin ramas ni worktrees. El árbol tiene cambios ajenos: no `stash`, `reset` ni `checkout` de rutas ajenas; commitear solo las rutas de cada ola.
- No ejecutar `scripts/dev.mjs` ni `pnpm dev` para probar; no matar procesos `node` por nombre.
- Pruebas con `jest` directo, sin caché de Turbo, con conteo real. Verificación con `DB_NAME=test`.
- Commit por ola al llegar a G6; push por tren (ADR-107).

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** Inventario de no regresión | CA-1 | Test que enumera acciones, campos y pestañas de H1–H6 **antes** de tocar nada | `sr-qa` |
| **C** Variante densa | §3 C, D1 | Prop de densidad en `PortalPanel` (`apps/portal/src/components/shared/portal-ui.tsx`); contrato visual | `ds-owner` define, `fe-platform` implementa |
| **A** Vista general en dos columnas | §3 A, D5 | `SubscriberOverviewTab.tsx`, `SubscriberDetailClient.tsx`; tarjeta de identidad, mapa en Servicios, «Siguiente cobro» con `POST /billing/policy/preview` | `fe-platform` |
| **B** «Registrar ▾» | §3 B | `SubscriberHeader.tsx`; abre los flujos existentes por permiso | `fe-platform` |
| **G** Insignias derivadas | §3 G | Helper puro desde datos de la 360° y del estado de cuenta; ficha y lista | `fe-platform` |
| **D-be** Notas del suscriptor | §3 D, D3 | Migración tenant **180** (verificar número libre al iniciar), entidad, `GET`/`POST /crm/subscribers/:id/notes`, DTO en `@iwana/shared`, OpenAPI, auditoría, guarda de titular bloqueado | `sr-backend` |
| **D-fe** Actividad | §3 D | Tarjeta que compone ciclo de vida, tickets, visitas, documentos y pagos + caja de nota | `fe-platform` |
| **E** Servicio en página | §3 E, CA-5 | Ruta `subscribers/[id]/services/[contractId]` y alta de contrato en página; el panel lateral se retira solo con paridad total | `fe-platform` |
| **F** Documentos | §3 F | Lista y subida sobre los soportes existentes | `fe-platform` |
| **QA** | CA-1 a CA-8 | E2E de la ficha, a11y, regresión visual | `sr-qa` |

## 3. Olas y dependencias

| Ola | Bloques en paralelo | Depende de | Contrato congelado |
|---|---|---|---|
| 1 | W0 · C · **D-be** | — | D-be congela `SubscriberNote` y sus esquemas Zod al terminar su primer paso |
| 2 | A · B · G | W0, C | Inventario W0 en verde antes y después |
| 3 | D-fe · F | D-be (contrato), A | — |
| 4 | E | A, W0 | Paridad con `ContractDetailDrawer` y `CreateContractDialog` |
| 5 | QA de cierre | 1–4 | — |

**Ruta crítica:** W0 → A → E → QA. D-be corre desde la ola 1 para no bloquear la 3.

**Sincronización:** al cerrar cada ola, la sesión principal corre el inventario W0, el conteo de pruebas contra la línea base y los revisores de §5.

## 4. Gates por ola

| Gate | Evidencia |
|---|---|
| G6 | Lint, typecheck, jest del portal (y de api en las olas con D-be) con conteo ≥ línea base; inventario W0 verde |
| Ola 1 (D-be) | Migración reversible (up/down) contra Postgres real; `migration-order.spec.ts`; integración de notas con titular bloqueado y anonimizado |
| Ola 2 y 4 | `audit-ui` sin P0/P1; WCAG 2.2 AA en las pantallas tocadas |
| Ola 5 | E2E de la ficha con API y worker arriba y puerto 3002 libre; CA-7 a 1440×900 y 375 px |
| G6.5 | CI de `main` verde sobre el commit publicado |

## 5. Matriz agente × skill

Claude Code **lee** cada `SKILL.md` antes de escribir código; no son tools nativas.

| Bloque | Agente | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns` (ola 5); `e2e-triage` (si un E2E falla) | `test-driven-development` (W0 fija lo existente, no es TDD) |
| C | `ds-owner` → `fe-platform` | `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` | — | `frontend-dev-guidelines` para `ds-owner` (no escribe pantalla) |
| A, B, G, D-fe, F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `frontend-security-coder` (documento enmascarado, mapa con permiso); `i18n-localization` (formatos de monto y fecha nuevos) | `core-components` (sin primitives nuevas, D1); `nestjs-expert` (sin backend) |
| E | `fe-platform` | `frontend-dev-guidelines`, `testing-patterns`, `iwana-identity-ui-review` | `wcag-audit-patterns` (formulario largo) | `typescript-expert` (sin contratos nuevos) |
| D-be | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `openapi-spec-generation` | `testing-patterns` (integración) | `database-migration` (es tenant, no `public`); `bullmq-specialist` (sin colas) |
| Cierre de ola | sesión principal | `verification-before-completion`, `iwana-test-evidence`, `requesting-code-review` | `iwana-checkpoint-commit` (al commitear) | `dispatching-parallel-agents` (el plan ya define las olas) |
| Revisión | `boundary-reviewer` (ola 1), `contract-drift-reviewer` (olas 1 y 3), `test-change-reviewer` (si cambia un spec existente), `gate-verifier` (cada ola), `docs-governance` (solo al cierre de fase) | — | `sec-eng` (si D-be expone texto libre con PII) | — |

## 6. Riesgos y bloqueos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Reubicar paneles hace perder una acción | W0 antes de la ola 2; CA-1 en cada G6 |
| R2 | La nota manual guarda PII en texto libre | Aviso en la caja, longitud máxima, incluida en anonimización y en la purga del titular (privacy) |
| R3 | Otra sesión toma la migración 180 | Verificar número libre al iniciar D-be |
| R4 | Specs del portal con cambios ajenos sin commitear | No editar esas rutas sin coordinar; si es inevitable, preguntar al usuario antes del commit |

**Bloqueos abiertos:** ninguno para arrancar.

## 7. Cierre de fase

Informe `docs/informes/INFORME-MOD05-FICHA-UISP-CIERRE-v1.0.md` con: conteos por ola, evidencia de CA-1 a CA-8, líneas por superficie, libro de `atajo:` y lo omitido o no verificado (skill `iwana-cierre-fase`).

## 8. Lanzamiento

Ver el launcher enlazado arriba; resumen: lanzar la ola 1 con tres encargos en paralelo (`sr-qa` W0, `ds-owner`+`fe-platform` C, `sr-backend` D-be), cada uno con este plan y la spec como fuente, y consolidar en la sesión principal.
