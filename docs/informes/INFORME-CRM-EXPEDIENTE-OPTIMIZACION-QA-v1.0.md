# Informe QA — Optimización CRM Expediente (Task 2 + Task 3)

**Fecha:** 2026-08-24  
**Estado:** G6 — GO con deuda no bloqueante declarada; G6.5 pendiente de CI Linux  
**Agente:** AI-SR-QA  
**Alcance:** revisión integrada del bootstrap seguro backend y del detalle portal CRM, sin modificar código productivo.

## Fuentes de verdad

- `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`, §12, CA-01–CA-10.
- `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md`, CA-01–CA-19.
- `docs/informes/INFORME-CRM-EXPEDIENTE-OPTIMIZACION-TASK2-v1.0.md`.
- `docs/informes/INFORME-CRM-EXPEDIENTE-OPTIMIZACION-TASK3-v1.0.md`.

## Estrategia y trazabilidad

| Criterio / riesgo | Evidencia verificada |
| --- | --- |
| Bootstrap seguro y completitud sin recalculo primario en portal | `apps/api/src/modules/crm/expedientes/tests/expediente-detail-bootstrap.service.spec.ts`; `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx` |
| Roles, envelope, tenant/schema, auditoría y proyección sin PII reservada | `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`; suite focalizada API |
| Degradación segura 42P01/42703 | `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts` |
| Carreras same-id / cambio de expediente / tabs | `page.spec.tsx`, `ExpedienteTabsContainer.spec.tsx`, E2E CRM |
| Carga lazy y errores seguros | `page.spec.tsx`, `SeguimientoTab.spec.tsx`, E2E CRM |
| Caché tenant-scoped, TTL, deduplicación e invalidación | `expediente-detail-cache.spec.ts` |
| WFM lazy, retry y descarte de respuestas obsoletas | `useCrmInstallationFieldWork.spec.ts`, E2E de coordinación |
| PII en listado y detalle autorizado | E2E `portal-crm-expedientes.spec.ts`, prueba backend de proyección |
| Timeline, contactos, cobertura, consentimiento y conversión | E2E `portal-crm-expedientes.spec.ts` |
| Tabs y relaciones ARIA | `ExpedienteTabsContainer.spec.tsx`; E2E de navegación |

## Evidencia ejecutada

### Backend

- **11 suites, 108 tests:** PASS, corrida focalizada de bootstrap, controller,
  completitud, actors, quotes, pipeline, atribución, responsabilidad,
  subscribers, rate limiting y tenant middleware.
- Typecheck `@iwana/api`: PASS.
- Lint API: **0 errores**, 7 warnings preexistentes fuera del alcance CRM.
- La suite completa API había reportado **264 suites / 3275 tests aprobados**;
  produjo mensajes asíncronos `ECONNREFUSED 127.0.0.1:6379` por Redis no
  disponible. No se interpreta como fallo funcional de CRM, pero requiere
  infraestructura Redis en CI para cerrar G6.5.

### Portal

- **1 suite, 14 tests:** PASS para la página de detalle y carreras.
- **9 suites, 40 tests:** PASS para tabs, Seguimiento, WFM, caché,
  scheduling, timeline, conversión y list view.
- Typecheck `@iwana/portal`: PASS.
- Lint portal: **0 errores**, 44 warnings de hooks/promesas en workspace;
  incluye warnings legacy de CRM y superficies no relacionadas.
- La corrida completa de Jest del portal no queda verde por un fallo ajeno al
  alcance en `src/components/scheduling/SchedulingClient.spec.tsx:933`, que
  espera `Crear solicitud manual`. El fallo corresponde a Scheduling/WFM, no a
  los archivos Task 2 + Task 3; debe ser atendido por el responsable de esa
  superficie antes del cierre global de regresión.

### E2E

- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts`:
  **12/12 PASS** en la corrida de confirmación.
- Repetición de estabilidad `--repeat-each=3`: **36/36 PASS**.
- Una corrida concurrente inicial tuvo 1 fallo de arranque en el heading de
  la landing; la reproducción aislada y la corrida completa posterior
  pasaron. No se observó reproducción en 36 repeticiones secuenciales.

### UI, accesibilidad y diff

- Auditoría mecánica sobre archivos CRM afectados: **0 P0, 0 P1, 0 P2**.
- El único aviso fue un spinner heurístico P3 en `ConsentsPanel.tsx:303`; se
  descarta como defecto porque corresponde a un panel diferido, no a la carga
  primaria de la página o de una tabla.
- `ExpedienteTabsContainer.spec.tsx` verifica `role="tablist"`,
  `aria-controls`, `aria-labelledby`, `role="tabpanel"` y foco de tabs.
- `git diff --check` de las rutas revisadas: sin errores; solo avisos
  informativos de conversión CRLF.
- No se ejecutó una auditoría axe automatizada dedicada para este flujo; la
  evidencia disponible es semántica/ARIA en Jest, E2E y revisión mecánica.

## Multi-tenancy y datos de prueba

- Los tests verifican contexto tenant/schema y aislamiento en boundaries y
  mocks tipados.
- La fase Task 2 declara expresamente que no existe infraestructura disponible
  para una prueba real con dos schemas PostgreSQL; por tanto, no se inventa
  evidencia SQL real ni se afirma un E2E cross-tenant de base de datos.
- No se detectaron credenciales ni PII real en los fixtures revisados.

## Hallazgos

### P0/P1/P2

Ninguno identificado en el alcance Task 2 + Task 3.

### P3 — deuda no bloqueante

- `ConsentsPanel.tsx:303`: spinner local heurístico. No bloquea la tarea
  principal ni constituye una ruptura WCAG crítica; puede reemplazarse por un
  skeleton contextual en una iteración posterior.
- La cobertura de consentimiento se verifica por flujo E2E y por el estado
  preservado en `page.spec.tsx`, pero no existe un `ConsentsPanel.spec.tsx`
  dedicado. Se recomienda añadirlo si el componente sigue creciendo.

## Veredicto

**Aprobada con deuda no bloqueante para G6.** Los criterios críticos del
bootstrap, detalle, lazy loading, carreras, caché, WFM, privacidad, tabs y
flujos E2E CRM pasan. No se autoriza afirmar G6.5: falta la corrida Linux por
SHA con artefacto sanitizado, cleanup confirmado y Redis/infra CI disponible.
