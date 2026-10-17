# Informe V1 QA — Privacy Fase 1b · v1.5

**Fecha:** 2026-10-16  
**Estado:** **[BLOQUEO]** — dbiw quedó acreditada hasta la migración 151 en sus 3 tenants ACTIVE; no se ejecutó Playwright porque la API no está disponible y faltan las credenciales E2E explícitas.  
**Plan:** [`2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md`](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md), v1.5, sección «Corrección del emisor y migración de dbiw».  
**Delta:** [`PROMPT-PRIVACY-FASE-1B-v1.4.md`](../prompts/PROMPT-PRIVACY-FASE-1B-v1.4.md), H9′.  
**Suite:** [`portal-privacy-fase-1b-live.spec.ts`](../../e2e/tests/portal-privacy-fase-1b-live.spec.ts). No se modificó en esta actuación.

## Acreditación de migraciones

Se ejecutó una consulta de solo lectura contra `dbiw:5433`, en una transacción `READ ONLY`. La consulta obtuvo los tenants de estado `ACTIVE`, comprobó el ledger `typeorm_migrations` de cada schema para las migraciones 149–151 y contrastó las columnas relevantes mediante `pg_catalog.pg_attribute`. No se consultó `information_schema.columns`.

| Schema tenant ACTIVE | 149 | 150 | 151 | Columnas comprobadas en `pg_attribute` |
| --- | ---: | ---: | ---: | ---: |
| `tenant_iwana` | Sí | Sí | Sí | 7 |
| `tenant_srqa_mod11_r5_20261006` | Sí | Sí | Sí | 7 |
| `tenant_test_s2_live` | Sí | Sí | Sí | 7 |

**Resultado:** 3/3 tenants ACTIVE tienen las tres migraciones. La consulta confirmó la precondición de base para dirigir el E2E a `tenant_iwana`.

## [BLOQUEO] Precondiciones de ejecución

- `http://127.0.0.1:3000/health` no respondió: `HttpRequestException`; no hay API escuchando en el puerto requerido. No se arrancó otra instancia.
- `E2E_PRIVACY_ADMIN_EMAIL` y `E2E_PRIVACY_ADMIN_PASSWORD` no están presentes ni en el entorno del proceso ni como entradas en `.env.development.local`, `.env.development` o `.env`. El spec requiere ambas variables explícitas para autenticar al administrador de privacidad; no usa credenciales alternativas.
- `E2E_TENANT_SLUG` y `E2E_PRIVACY_PLAN_ID` sí están configuradas. No se imprimieron valores.

La configuración de base indicada por `.env.development` corresponde a `DB_PORT=5433` y `DB_NAME=dbiw`. Por instrucción de detenerse ante una precondición ausente, no se ejecutó Playwright, no se sembraron ni mutaron fixtures y no se intentó iniciar la API.

## Conteo y matriz R1–R16 ↔ test

**Conteo de ejecución real:** no disponible; la suite no se ejecutó. No equivale a 0 tests. **Inventario estático actual:** 4 tests en el spec, con los nombres mostrados abajo. La matriz identifica cobertura prevista/escrita y sus límites; no afirma resultados de runtime.

| Requisito | Test E2E asociado | Límite / evidencia complementaria previamente localizada |
| --- | --- | --- |
| R1 — rechazo legal bloquea; contractual no | `ex suscriptor dentro de retención: rechazo legal, listado redactado, búsqueda excluida y seis subrecursos`; `contrato vigente: rechazo por deber contractual sin marca de bloqueo` | Integración PostgreSQL de solicitudes: `requests.service.postgres.integration.spec.ts` (casos de rechazo). No ejecutada aquí. |
| R2 — confirmar y anonimizar en transacción | `prospecto: SUPRIMIR, vista previa, resolver y anonimizar expediente, visita y órdenes` | El E2E comprueba confirmación y resultado; los rollback por residuales/fallo de auditoría requieren integración. |
| R3 — prospecto sin Party | Test `prospecto: ...`; crea prospecto sintético sin `partyId` y resuelve el candidato | Colisión HMAC y CLI se comprueban fuera de este E2E. |
| R4 — candidatos del resolve coinciden con la vista previa | Test `prospecto: ...`; reenvía los IDs de la vista previa | No fuerza concurrencia entre vista previa y resolución. |
| R5 — cuenta activa impide supresión | Sin test E2E en esta suite | Cobertura complementaria en `anonymize-titular.postgres.integration.spec.ts`; no ejecutada aquí. |
| R6 — conservar solicitud, eventos, autorizaciones, marcas y registros | Test `prospecto: ...`; verifica solicitud/evento y consentimiento | No inspecciona directamente todas las tablas de evidencia; cobertura complementaria en integración PostgreSQL. |
| R7 — anonimización operativa WFM/tasks | Test `prospecto: ...`; expediente, visita, evento, orden de trabajo y orden de ejecución | La cobertura profunda de relaciones operativas es de integración PostgreSQL. |
| R8 — redacción por defecto y lectura completa auditada por permiso | Test `ex suscriptor ...`; listado/360 y subrecursos con perfiles y permisos | La suite distingue `privacy.read` y `crm.blocked_data.read`; requiere API real. |
| R9 — búsqueda excluye titular bloqueado | Test `ex suscriptor ...`; búsqueda exacta y libre | No ejecutada. |
| R10 — todas las mutaciones bloqueadas con 409 antes de escribir | Test `ex suscriptor ...` actual solo verifica edición genérica del suscriptor con SALES y ACCOUNTANT. **No contiene aún** aserciones de transición de estado ni archivo de contrato solicitadas por R10 v1.4. | Debe agregarse/verificarse el caso ampliado de R10 en una actuación con precondiciones completas. No se cambió código ni test por el bloqueo de esta ejecución. |
| R11 — traslado tardío derivado del evento | `traslado fuera de plazo: muestra la insignia “Traslado extemporáneo”` | Depende de API y portal reales; no ejecutada. |
| R12 — bloqueo derivado de marcas sin puerto legado | Test `ex suscriptor ...` recorre el estado bloqueado por rechazo legal | Ausencia de puerto legado es comprobación estática, no queda probada por este E2E. |
| R13 — CLI comparte participantes | No aplica a esta suite API/portal | Integración del comando CLI en `anonymize-titular.postgres.integration.spec.ts`; no ejecutada. |
| R14 — contratos/cotizaciones anonimizados y conservados | No cubierto por el flujo E2E de supresión; el test de contrato vigente solo comprueba rechazo | Integración de CLI; no ejecutada. |
| R15 — marca de anonimización visible | Test `prospecto: ...`; valida encabezado «Anonimizado» e insignia del titular | Test de componente localizado en `ExpedienteHeader.spec.tsx`; no ejecutado en esta actuación. |
| R16 — acceso contable a datos bloqueados | Test `ex suscriptor ...`; contrasta ACCOUNTANT con/sin `crm.blocked_data.read`, y accesos de SALES/TECHNICIAN | Incluye lectura auditada en el escenario; ejecución pendiente. |

## Ejecución pendiente

Con la API iniciada contra `dbiw:5433` y las dos credenciales de prueba configuradas explícitamente, ejecutar sobre `tenant_iwana`:

```powershell
$env:DB_PORT = '5433'
$env:DB_NAME = 'dbiw'
$env:E2E_TENANT_SLUG = 'iwana'
pnpm exec playwright test --config=e2e/playwright.portal.config.ts e2e/tests/portal-privacy-fase-1b-live.spec.ts --retries=0
```

Antes de declarar V1 verde también se debe incorporar el caso R10 v1.4 que falta en el spec actual y entregar el conteo de Playwright obtenido de esa corrida, sin caché ni reintentos.

## Cierre

La ruta de este informe se verificó libre antes de escribirlo (`Test-Path` → `False`). No se modificó código de producto, contratos, tests ni fixtures; no se registraron PII, secretos o claves; no se hizo commit. El resultado V1 permanece **bloqueado** hasta que estén disponibles API y credenciales requeridas y se ejecute la suite completa con R10 v1.4.
