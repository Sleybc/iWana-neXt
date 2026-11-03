# PROMPT — `privacy` · Suplantación: denuncia del operador (C-413 de 2025)

**Versión:** 1.0
**Estado:** Listo para lanzar. G0 del CTO el 2026-11-03
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Plantilla base:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Spec (contrato congelado):** [`docs/specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md`](../specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md) v1.0
**Plan:** [`docs/plans/2026-11-03-privacy-denuncia-operador-orquestacion.md`](../plans/2026-11-03-privacy-denuncia-operador-orquestacion.md) · **Launcher:** [`PROMPT-PRIVACY-DENUNCIA-OPERADOR-LAUNCH-v1.0.md`](PROMPT-PRIVACY-DENUNCIA-OPERADOR-LAUNCH-v1.0.md)
**Plazo:** G6.5 antes del **19-11-2026**, día en que entra en vigor la Ley 2573.

## Reglas comunes

- Lee antes `AGENTS.md`, `.github/copilot-instructions.md`, la spec completa y las skills de tu fila del plan.
- Trabajas en `main`, sin ramas, sin stash y sin commit. Toca solo las rutas de tu bloque.
- Cero PII. La nota de las tareas no va a logs ni a la auditoría.
- Integraciones PG con `IWANA_DB_INTEGRATION_AVAILABLE=true` en una base `iwana_it_*` aprovisionada como CI. Una omisión no declarada cuenta como fallo.
- Si el código contradice la spec: `[BLOQUEO]` con `archivo:línea`.

## B1 · `sr-backend` · Contrato y servicio (D-DO-1, D-DO-2 y D-DO-3, salvo la migración)

**Rutas:** `packages/shared/src/schemas/privacy/requests.ts`, `apps/api/src/modules/privacy/requests/**` y sus pruebas unitarias.

1. Añadir `FORMULAR_DENUNCIA_OPERADOR` y `COMUNICAR_PLAZO_DENUNCIA` a `requestTaskKindSchema`.
2. `calculateRequestTaskDueAt` con los cuatro casos de D-DO-3. Al radicar una SUPLANTACION se crean las cuatro tareas.
3. Validación Zod de la nota para los dos tipos nuevos: obligatoria, de 1 a 120 caracteres, sin saltos de línea. Los tipos existentes siguen con su validación actual.
4. OpenAPI: el enum de tareas actualizado.
5. Pruebas unitarias y HTTP: CA-DO-02 y CA-DO-03.

## B2 · `sr-backend` (2.ª instancia) · Migración 172 y backfill (D-DO-3)

**Rutas:** `packages/database/src/migrations/tenant/**`. Lee la skill `iwana-tenant-migration`.

1. Usa el siguiente número libre, con sufijo único de 13 dígitos: lo exige la prueba invariante.
2. Reemplaza el `CHECK` `ck_data_subject_request_tasks_kind` por los cuatro valores. El `down` vuelve a dos y falla con un mensaje claro si hay filas nuevas.
3. Backfill de las SUPLANTACION abiertas, idempotente, con conteo sin PII por `console.log` (como la 170).
4. Pruebas PG de CA-DO-05 y CA-DO-06, esta última de paridad con `requestTaskKindSchema`.

## B3 · `fe-platform` · Portal (D-DO-4)

**Rutas:** `apps/portal/src/components/privacy/**` y sus pruebas. Lee antes las skills `frontend-dev-guidelines`, `core-components`, `iwana-identity-ui-review` y `system-vocabulary-review`.

1. Sustituye el ternario de `PrivacyRequestDetail.tsx:510` por un `Record<RequestTaskKind, string>` exhaustivo, con los textos de la spec.
2. Ayuda de la nota según el tipo, en el diálogo de completar la tarea.
3. Badge «Comunicación tardía» con el token de advertencia existente, sin colores nuevos.
4. Pruebas de componente para CA-DO-04 y CA-DO-07.

## B4 · `sr-qa` · PG, E2E y regresión (tras B1, B2 y B3)

Eres verificador **y autor de pruebas**: escribes pruebas y fixtures, nunca código de producto.

1. CA-DO-01 contra PG con el servicio real.
2. CA-DO-08: E2E de suplantación contra la API real, en un tenant sintético.
3. CA-DO-09: corre las suites de privacidad y la E2E de Fase 1b. Las expectativas que cuentan 2 tareas pasan a 4 como categoría (b), citando D-DO-1 y D-DO-2. Cualquier otro ajuste: `[BLOQUEO]`.

## B5 · Verificación (tras B4)

| Agente | Encargo |
| --- | --- |
| `sec-eng` | La nota no se filtra a logs ni a la auditoría; los permisos no cambian; el `down` no borra datos |
| `contract-drift-reviewer` | `requestTaskKindSchema` contra el `CHECK`, el DTO, OpenAPI y el mapa del portal |
| `test-change-reviewer` | Las expectativas ajustadas en B4 |
| `gate-verifier` | Gates de AGENTS.md con cobertura de `privacy/**` frente a su línea base |

## B1-D · `sr-backend` · Deriva del tipo de la entidad (hallazgo menor de B5, 2026-11-03)

`contract-drift-reviewer` encontró que `DataSubjectRequestTaskKind` (`apps/api/src/modules/privacy/entities/data-subject-request-task.entity.ts:3`) solo tiene los dos tipos antiguos. Hoy no rompe nada, porque el servicio usa SQL directo, pero el compilador no avisaría si alguien lee tareas con TypeORM.

1. Que el tipo de la entidad sea un alias de `RequestTaskKind` de `@iwana/shared`, en lugar de una unión local.
2. Typecheck de la API y suites de `privacy/**`, sin caché.

Solo ese archivo. Sin stash ni commit.

Cierre: informe `docs/informes/INFORME-PRIVACY-DENUNCIA-OPERADOR-CIERRE-v1.0.md` (comprueba antes que la ruta esté libre) y HLD Privacy v1.4 (§6.3).
