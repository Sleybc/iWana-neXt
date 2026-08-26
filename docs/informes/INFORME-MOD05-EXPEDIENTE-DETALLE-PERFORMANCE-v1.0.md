# Informe de performance — CRM detalle de expediente

**Fecha:** 2026-08-24  
**Agente:** AI-SR-QA  
**Alcance:** Task 8/9 del plan `2026-08-23-crm-expediente-detail-performance.md`  
**Estado:** E2E crítico PASS; medición SQL/EXPLAIN no ejecutable en este entorno

## Instrumentación E2E

Se añadió el test `mide el critical path de apertura en frío y caliente` en
`e2e/tests/portal-crm-expedientes.spec.ts`.

La medición empieza inmediatamente antes del click en `Abrir` y termina cuando
`Acción recomendada ahora` es visible. Captura únicamente paths API sanitizados,
método, estado HTTP y bytes de respuesta; no registra query strings, headers,
tokens, cookies ni payloads.

El critical path exige, para cada corrida:

- exactamente una solicitud `/crm/expedientes/:id/bootstrap`;
- ausencia de `/timeline`;
- ausencia de `/history`;
- ausencia de `/wfm/`.

## Resultados E2E de medición

Corrida final con API mock de Playwright, Chromium, un worker:

| Modo     | Click → shell (`Acción recomendada ahora`) | Solicitudes API | Bytes de respuesta |
| -------- | -----------------------------------------: | --------------: | -----------------: |
| Frío     |                                     933 ms |               7 |            2.174 B |
| Caliente |                                     931 ms |               7 |            2.174 B |

En ambas corridas se observó exactamente un bootstrap de **1.350 B**. El
conjunto de paths sanitizados fue el mismo:

| Path                                    | Método | Estado |        Bytes |
| --------------------------------------- | ------ | -----: | -----------: |
| `/api/v1/auth/me`                       | GET    |    200 |          176 |
| `/api/v1/users/:id`                     | GET    |    200 |           80 |
| `/api/v1/tenants/me` (4 solicitudes)    | GET    |    200 | 142 cada una |
| `/api/v1/crm/expedientes/:id/bootstrap` | GET    |    200 |        1.350 |

El modo frío corresponde a la primera apertura después de cargar la bandeja;
el modo caliente vuelve a la bandeja en la misma sesión de prueba. Son cifras
del entorno mocked, no una medición de red o PostgreSQL reales.

## Comparabilidad con baseline

La línea base documental es LCP **2.165 ms**. Esta instrumentación mide
click → shell y no captura LCP comparable; por tanto, **no se afirma mejora de
LCP**. La diferencia observada entre las dos aperturas mocked (15 ms, con la
segunda corrida ligeramente más lenta) tampoco
se extrapola a producción ni sustituye una corrida con backend real.

## Revisión de índices y entidades

Se revisaron:

- `packages/database/src/migrations/tenant/001_create_expediente_records.ts`:
  índices de expediente por `(tenant_id, status)`, `(tenant_id, created_at)` y
  `(tenant_id, municipality)`, además de los índices por expediente de
  `status_changes`, `contact_attempts`, `coverage_checks` y `consent_records`.
- `packages/database/src/migrations/tenant/007_add_acquisition_channel_and_sales_attributions.ts`:
  `(tenant_id, expediente_id)` y unicidad de atribución activa.
- `packages/database/src/migrations/tenant/009_add_current_responsible_fields_and_operational_history.ts`:
  `(tenant_id, expediente_id, changed_at DESC)` para historial de responsables.
- `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.ts`:
  sus índices de paginación no incluyen las tablas de expediente CRM.
- Entidades CRM en `apps/api/src/modules/crm/expedientes/entities/`:
  sus decoradores `@Index` son consistentes con los índices relevantes de las
  migraciones revisadas.

No se creó migración: no existe evidencia `EXPLAIN (ANALYZE, BUFFERS)` que
justifique un índice adicional.

## Limitación de base de datos

No había PostgreSQL ni credenciales disponibles para esta sesión: las variables
`DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y
`POSTGRES_HOST` estaban ausentes; Docker no tenía el daemon disponible y `psql`
no estaba instalado. En consecuencia:

- no se capturaron conteos SQL, tablas consultadas ni transacciones tenant;
- no se ejecutó `EXPLAIN (ANALYZE, BUFFERS)`;
- no se ejecutaron migraciones ni se añadieron índices especulativos.

## Suite CRM ejecutada

Comando:

```text
pnpm.cmd exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts e2e/tests/portal-crm-expedientes-contacto.spec.ts e2e/tests/portal-crm-gestion-comercial-operativa.spec.ts --workers=1 --reporter=list
```

Resultado: **27/27 tests aprobados**, 0 fallos, 0 skips, duración aproximada
1,2 minutos. La medición fresca registró `933 ms` en frío y `931 ms` en caliente.

Verificación focalizada posterior al timeline paginado:

- API CRM: **112/112 tests aprobados** en servicio, controller, Swagger,
  bootstrap y completitud.
- Portal CRM: **55/55 tests aprobados** entre página, Seguimiento, timeline,
  cache y cliente API.
- Typecheck API y Portal: aprobado.
- ESLint focalizado API y Portal: aprobado.
- Prettier de los archivos afectados: aprobado.

## Validación global y límites fuera de alcance

- `ExpedientesLandingClient`: **10/10 tests aprobados**.
- `ExecutionOrderDrawer`: **95/95 tests aprobados**.
- `SchedulingClient`: **16/20 tests aprobados**; los cuatro fallos pertenecen
  a la superficie de agenda y no fueron introducidos ni modificados por esta
  optimización CRM.
- La suite completa del Portal no se certifica como verde por esos fallos de
  Scheduling y por warnings asíncronos preexistentes en varias suites.
- La suite completa del API requiere Redis disponible; en este entorno las
  pruebas que lo necesitan fallan con `ECONNREFUSED 127.0.0.1:6379`.
- La integración PostgreSQL tenant A/B y `EXPLAIN` siguen pendientes de
  infraestructura real.

## Cierre

- Critical path mocked: PASS.
- Bootstrap único y ausencia de timeline legacy, historiales y WFM: PASS.
- Comparación LCP contra 2.165 ms: no determinada por limitación del mock.
- Evidencia SQL/EXPLAIN: pendiente de PostgreSQL real.
- Migraciones nuevas: ninguna.
- Timeline paginado: filtros, límites físicos, `hasMore` y eventos polimórficos
  consumidos server-side por Seguimiento.
- Commit: no realizado.
