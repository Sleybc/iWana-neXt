# MOD05 — Responsabilidades del RUT condicionales · Plan de orquestación

**Versión:** 1.1 · **Fecha:** 2026-10-26 · **Autor:** AI-EM-ARCH
**Decisión:** [ADR-100](../adrs/ADR-100-Responsabilidades-RUT-Condicionales-para-Activar-Suscriptor.md) (Aprobado el 2026-10-26)
**Encargo:** [PROMPT-MOD05-RUT-CONDICIONAL-v1.0](../prompts/PROMPT-MOD05-RUT-CONDICIONAL-v1.0.md) · **Launcher vigente:** [PROMPT-MOD05-RUT-CONDICIONAL-LAUNCH-v1.1](../prompts/PROMPT-MOD05-RUT-CONDICIONAL-LAUNCH-v1.1.md) · Ejecutado: [LAUNCH-v1.0](../prompts/PROMPT-MOD05-RUT-CONDICIONAL-LAUNCH-v1.0.md)
**Origen:** G7 de MOD13 Fase 01 ([plan](2026-10-22-mod13-aprovisionamiento.md), paso 3-bis). El suscriptor del caso de origen no se activaría porque no tiene responsabilidades del RUT declaradas.
**Base:** `main` en `40f7e1e6`. Se trabaja en `main`, sin ramas. El árbol tiene rutas sin commitear de otros frentes: ningún agente las toca ni las incluye en sus commits.

---

## 0. Alcance

Aplicar ADR-100 D1 a D3: las responsabilidades del RUT solo se exigen a personas jurídicas o responsables de IVA. La regla vive en una función de `@iwana/shared` y la usan el esquema, la completitud del API, la paridad SQL y los formularios del portal.

**Fuera de alcance:**
- emitir la factura electrónica o traducir el vacío a `R-99-PN` (es del módulo de facturación futuro);
- cambiar el catálogo de códigos o el tratamiento de IVA de ADR-093;
- migrar datos;
- tocar `apps/api/src/modules/network/**`.

## 1. Decisiones del CTO antes de lanzar (G0)

| # | Pregunta | Recomendación |
| --- | --- | --- |
| E1 | ¿Qué regla se adopta? | **(a)** Obligatorio solo para jurídicas o responsables de IVA |
| E2 | ¿El vacío se guarda vacío o se rellena con `R-99-PN`? | **Vacío** (D2) |
| E3 | ¿Se acepta decidir antes del dictamen del contador? | **Sí**, con el riesgo declarado |
| — | ADR-100 pasa a `Aprobado`, y RF-SUB-06′ del PRD de MOD05 Fase 04 recibe una nota «Desarrollo posterior» que remite a ADR-100 | ✅ Hecho el 2026-10-26 |

**Resuelto el 2026-10-26:** el CTO aprobó E1 = (a), E2 = vacío y E3 = sí. El encargo v1.0 se lanza sin re-emisión.

## 2. Bloques y dependencias

| Bloque | Agente | Qué | Depende de |
| --- | --- | --- | --- |
| B1 | `sr-backend` | `isRutResponsibilitiesRequired` en `@iwana/shared`; esquemas de alta y edición; `evaluateSubscriberFiscalCompleteness`; `FISCAL_INCOMPLETE_SQL`; OpenAPI; pruebas unitarias en tabla e integración contra Postgres real | G0 |
| F1 | `fe-platform` | `SubscriberForm.tsx` y `SubscriberSections.tsx` usan la función compartida; el campo se rotula como opcional cuando aplica, con una ayuda que explique «No aplica, otros»; pruebas de componente | G0 (usa el nombre y la firma fijados en el encargo, no el código de B1) |
| V1 | `contract-drift-reviewer` | Esquema compartido ↔ DTO y OpenAPI del API ↔ formularios del portal | B1 y F1 |
| V2 | `gate-verifier` | Gates Before Merge en `shared`, `api` y `portal`, sin caché de turbo y con conteo real | B1 y F1 |

B1 ∥ F1, con archivos disjuntos: B1 toca `packages/shared` y `apps/api`; F1, `apps/portal`. Después, V1 ∥ V2. Por último, AI-EM-ARCH emite el informe y hace el commit.

## 3. Matriz de dispatch (agente × skill)

| Bloque | Agente | Skills obligatorias | De apoyo (condición) | Descartadas y motivo |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | `nestjs-expert`, `test-driven-development`, `testing-patterns`, `iwana-test-evidence` | `openapi-spec-generation` (descripción del campo); `postgresql` (paridad del predicado SQL) | `database-migration`: sin migración · `bullmq-specialist`: sin colas |
| F1 | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | `iwana-identity-ui-review` (solo si cambia la composición visual del campo) | `tailwind-patterns`: no hay estilos nuevos |
| V1 | `contract-drift-reviewer` | `architect-review` | — | — |
| V2 | `gate-verifier` | `iwana-test-evidence`, `turborepo-caching`, `verification-before-completion` | — | — |
| Cierre | AI-EM-ARCH | `docs-architect` | — | — |

## 4. Gates

| Gate | Condición | Quién |
| --- | --- | --- |
| G0 | E1, E2 y E3 resueltas; ADR-100 `Aprobado` | CTO |
| G3 | CA-01 a CA-06 del encargo. La integración contra Postgres real **corrió** (más de 0 tests ejecutados) | sr-backend |
| G4 | CA-07 a CA-09 del encargo; pruebas de componente en verde | fe-platform |
| G5 | V1 sin deriva de contrato | contract-drift-reviewer |
| G6 | Lint, typecheck y suites de `shared`, `api` y `portal` sin caché. Cobertura ≥80 % en las líneas nuevas | gate-verifier |
| G7 | Informe `docs/informes/INFORME-MOD05-RUT-CONDICIONAL-v1.0.md`, commit de las rutas de B1 y F1, push con el visto bueno del CTO y **CI de `main` en verde**. Aviso a MOD13 para retomar el paso 5 de su G7 | AI-EM-ARCH |

## 5. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| P1 | La paridad SQL diverge de la función | Prueba contra Postgres real con los 4 cruces y la lista vacía o llena (CA-04) |
| P2 | Se relaja la validación de las personas jurídicas | Tabla de 8 casos en la unitaria (CA-01) y en el esquema (CA-02) |
| P3 | La suite de integración se salta en silencio | G3 exige el conteo de tests ejecutados |
| P4 | Otro frente toca los archivos de suscriptores en paralelo | `git status` de esas rutas antes de empezar; si hay cambios ajenos, `[BLOQUEO]` |

## 6. Estado de ejecución · 2026-10-26

| Ola | Bloque | Estado | Evidencia |
| --- | --- | --- | --- |
| 0 | Diagnóstico · AI-EM-ARCH | ✅ La regla actual exige el RUT a todos (esquema, API, SQL y portal). Los 3 suscriptores de `tenant_iwana` son persona natural no responsable con el campo vacío | ADR-100 §Contexto |
| 0 | G0 · CTO | ✅ Cerrado: ADR-100 Aprobado; E1 = (a), E2 = vacío, E3 = sí | ADR-100 §Escalaciones |
| 1 | B1 ∥ F1 | ✅ Entregados según su informe. Integración 2/2 (activación y paridad SQL, 8 casos); unitarias de shared 19/19, del API 236/236 y del portal 65/65 | 21 archivos en `packages/shared`, `apps/api/.../crm` y `apps/portal/.../subscribers` |
| 2 | V1 · contract-drift-reviewer | ✅ Sin deriva en producción ni `.min(1)` residual; sin consumidores en `apps/web`. P3: fixture del portal `mod05-deuda-fiscal-ui.portal.spec.tsx:892` | Informe de V1 |
| 2 | V2 · gate-verifier | ⛔ Lint y typecheck en verde. API: 1 suite y 2 tests en rojo (`global-validation-pipes.http.spec.ts`). Integraciones de `crm/subscribers`: 6/8 suites, 34/36 tests | Informe de V2 |
| — | Revisión de AI-EM-ARCH | Dos regresiones reales: (1) pasar a `z.union` vacía `fieldErrors` en el alta; (2) la edición valida la combinación siempre y bloquea fichas antiguas de jurídicas o responsables de IVA sin RUT (`subscribers-update-audit`). V2 proponía cambiar ese fixture; se descarta, porque ocultaría la regresión | Diff revisado |
| 3 | B1-bis · sr-backend | ✅ Vuelve `z.discriminatedUnion` con la regla del RUT en el `.superRefine` de la unión, y `fieldErrors` por campo restaurado. La edición valida solo si el DTO trae `personType`, `vatResponsibility` o `rutResponsibilities`. `subscribers-update-audit` pasa con su fixture original | Encargo §B1-bis |
| 4 | V2-r · gate-verifier | ✅ G6. Lint y typecheck de los tres paquetes en verde. shared 231/231; API 419 suites y 5.607 tests (4 suites y 15 tests omitidos); portal 3.259 tests (1 omitido); `global-validation-pipes` 11/11. Integraciones de `crm/subscribers`: 7/8 suites y 35 tests. `subscriber-enum-parity` falla porque al `tenant_test` local le faltan la tabla y los enums (pasa en CI): es un problema del entorno local, declarado | Informe de V2-r |
| — | Verificación de AI-EM-ARCH | ✅ Sin caché: esquema compartido 19/19; 5 suites del API 248/248; integración contra Postgres real 3 suites y 6/6 (`subscriber-rut-responsibilities`, `subscribers-update-audit` y `contact-pending`) | — |
| 5 | G7 · AI-EM-ARCH | ⏳ Commit hecho; quedan el push con el visto bueno del CTO, el CI de `main` y el informe | — |
