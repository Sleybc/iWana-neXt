# INFORME-PRIVACY-FASE-1B-V1-QA-v1.7

**Fecha:** 2026-10-16  
**Estado:** **NO-GO** — 3 de 4 tests aprobados en la última corrida; falla la vista previa de supresión con HTTP 500.  
**Prompt:** [`PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.3.md`](../prompts/PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.3.md).  
**Suite:** [`portal-privacy-fase-1b-live.spec.ts`](../../e2e/tests/portal-privacy-fase-1b-live.spec.ts).  
**Skills consultadas como documentación:** `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence` y `verification-before-completion`.

## Resultado y hallazgo

### [P1] Vista previa de supresión devuelve HTTP 500

En la corrida final, el escenario de prospecto crea el expediente, consentimiento, solicitud verificada y fixture WFM, pero `GET /privacy/requests/:id/erasure-preview` responde **HTTP 500**, cuerpo genérico `Internal server error`, sin código de aplicación. La aserción falla en [`portal-privacy-fase-1b-live.spec.ts`](../../e2e/tests/portal-privacy-fase-1b-live.spec.ts), línea 818. La suite no puede confirmar la resolución, la anonimización del expediente/visita/órdenes ni la marca «Anonimizado» en UI.

No se modificó código de producto ni contratos. El error persiste tras corregir las precondiciones sintéticas y no se obtuvo detalle diagnóstico más específico del endpoint.

## Verificaciones de entorno

La configuración efectiva fue `dbiw` por el puerto `5433`, tomada de `.env.development`. La consulta PostgreSQL fue de solo lectura y consultó `typeorm_migrations` del tenant `e2e-privacy-1b-a114bf06`:

| Control | Resultado |
| --- | --- |
| Tenant | `ACTIVE` |
| Migración 149 `PrivacyErasureRecord1490000000000` | Presente |
| Migración 150 `TitularAnonymizationMarker1500000000000` | Presente |
| Migración 151 `SeedBlockedDataPermission1510000000000` | Presente |
| `public.tenants` con estado `MARKED_FOR_DELETION`, antes y después del worker | `0` |
| API `/api/v1/health` | HTTP 200 |
| Portal `/auth/login` | HTTP 200 |
| Registro del job programado del worker | 1 línea, esperada |
| `[tenant-purge] Tenant purgado:` | 0 líneas |
| `[tenant-purge] Tenants elegibles: N` con `N > 0` | 0 líneas |

Al cierre, los árboles de API, worker y portal iniciados para esta corrida estaban detenidos; los puertos `3000` y `3002` quedaron sin listeners. El tenant se conserva. No se migraron ni restauraron tenants o bases.

## Seed sintético

`node e2e/scripts/seed-privacy-fase-1b-fixtures.mjs` terminó con código 0. Salida segura:

```json
{
  "result": "ready",
  "tenantSlug": "e2e-privacy-1b-a114bf06",
  "tenantStatus": "ACTIVE",
  "migrations": [149, 150, 151],
  "authorizationText": "published",
  "catalogPlan": "active",
  "actorRoles": [
    "AUDITOR privacy admin",
    "ADMIN runner",
    "SALES",
    "TECHNICIAN",
    "ACCOUNTANT billing",
    "ACCOUNTANT standard"
  ],
  "privacyAdminCrmPermissions": [
    "crm.expedientes.manage",
    "crm.expedientes.read",
    "crm.subscribers.manage",
    "crm.subscribers.read"
  ],
  "passwordsPrinted": false
}
```

El seed reutiliza el tenant, publica texto legal sintético cuando falta, deja un plan activo sintético cuando el catálogo está vacío, y configura al técnico del fixture como recurso operativo. Solo escribió en `.env.development.local` las variables de fase indicadas por el prompt; no imprimió valores. Los cambios persistentes del test/fixture quedaron bajo `e2e/**`; no se cambió código de producto.

## Conteo real de Playwright

Cada corrida usó Chromium, 1 worker y `--retries=0`. La última fue:

```text
4 tests: 3 passed, 1 failed (20.3 s)
```

| Test | Última corrida |
| --- | --- |
| Prospecto: SUPRIMIR, vista previa, resolver y anonimizar expediente, visita y órdenes | **FALLÓ** — HTTP 500 en `erasure-preview` |
| Ex suscriptor dentro de retención: rechazo legal, listado redactado, búsqueda excluida y seis subrecursos | **PASÓ** |
| Contrato vigente: rechazo por deber contractual sin marca de bloqueo | **PASÓ** |
| Traslado fuera de plazo: insignia «Traslado extemporáneo» | **PASÓ** |

Se hicieron corridas sucesivas para completar las precondiciones y ajustar solo los fixtures/tests. Conteo acumulado: **24 ejecuciones de test, 7 aprobadas y 17 fallidas**. La evolución y cada trace de fallo están listados abajo; los fallos de precondición de las corridas anteriores no sustituyen el resultado final.

| Corrida | Conteo | Resultado de los fallos |
| --- | --- | --- |
| `v1.3-legal-text-precondition` | 0/4 aprobados | Faltaba texto de autorización publicado; el seed posterior lo corrigió. |
| `v1.3-final` | 0/4 aprobados | Técnico no agendable, plan configurado ausente y transición de traslado desde estado inválido. |
| `v1.3-rerun-1` | 1/4 aprobados | Catálogo sin plan activo y HMAC del documento sintético no coincidente. |
| `v1.3-rerun-2` | 1/4 aprobados | Conflicto de agenda, tipo de archivo no permitido y falta de permiso CRM de lectura en actor creado. |
| `v1.3-rerun-3` | 2/4 aprobados | Vista previa HTTP 500; ACCOUNTANT con permiso de lectura recibió 403 al intentar escribir. |
| `v1.3-rerun-4` | 3/4 aprobados | Persiste vista previa HTTP 500. |

Los traces de abajo se conservaron sin capturas ni vídeo. Se redactaron credenciales, tokens, correos, identificadores UUID, HMAC y datos numéricos largos. El escaneo final de los 17 ZIP no encontró correos, UUID, JWT, cadenas de 64 hex ni valores conocidos del entorno.

### Traces de cada fallo

**`v1.3-legal-text-precondition` — 4 fallos:**

- Ex suscriptor: [trace](../../e2e/test-results/v1.3-legal-text-precondition/portal-privacy-fase-1b-liv-07998-excluida-y-seis-subrecursos-chromium/trace.zip)
- Prospecto: [trace](../../e2e/test-results/v1.3-legal-text-precondition/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)
- Contrato vigente: [trace](../../e2e/test-results/v1.3-legal-text-precondition/portal-privacy-fase-1b-liv-5de69-actual-sin-marca-de-bloqueo-chromium/trace.zip)
- Traslado tardío: [trace](../../e2e/test-results/v1.3-legal-text-precondition/portal-privacy-fase-1b-liv-cc525-nia-%E2%80%9CTraslado-extempor%C3%A1neo%E2%80%9D-chromium/trace.zip)

**`v1.3-final` — 4 fallos:**

- Ex suscriptor: [trace](../../e2e/test-results/v1.3-final/portal-privacy-fase-1b-liv-07998-excluida-y-seis-subrecursos-chromium/trace.zip)
- Prospecto: [trace](../../e2e/test-results/v1.3-final/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)
- Contrato vigente: [trace](../../e2e/test-results/v1.3-final/portal-privacy-fase-1b-liv-5de69-actual-sin-marca-de-bloqueo-chromium/trace.zip)
- Traslado tardío: [trace](../../e2e/test-results/v1.3-final/portal-privacy-fase-1b-liv-cc525-nia-%E2%80%9CTraslado-extempor%C3%A1neo%E2%80%9D-chromium/trace.zip)

**`v1.3-rerun-1` — 3 fallos:**

- Ex suscriptor: [trace](../../e2e/test-results/v1.3-rerun-1/portal-privacy-fase-1b-liv-07998-excluida-y-seis-subrecursos-chromium/trace.zip)
- Prospecto: [trace](../../e2e/test-results/v1.3-rerun-1/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)
- Contrato vigente: [trace](../../e2e/test-results/v1.3-rerun-1/portal-privacy-fase-1b-liv-5de69-actual-sin-marca-de-bloqueo-chromium/trace.zip)

**`v1.3-rerun-2` — 3 fallos:**

- Ex suscriptor: [trace](../../e2e/test-results/v1.3-rerun-2/portal-privacy-fase-1b-liv-07998-excluida-y-seis-subrecursos-chromium/trace.zip)
- Prospecto: [trace](../../e2e/test-results/v1.3-rerun-2/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)
- Contrato vigente: [trace](../../e2e/test-results/v1.3-rerun-2/portal-privacy-fase-1b-liv-5de69-actual-sin-marca-de-bloqueo-chromium/trace.zip)

**`v1.3-rerun-3` — 2 fallos:**

- Ex suscriptor: [trace](../../e2e/test-results/v1.3-rerun-3/portal-privacy-fase-1b-liv-07998-excluida-y-seis-subrecursos-chromium/trace.zip)
- Prospecto: [trace](../../e2e/test-results/v1.3-rerun-3/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)

**`v1.3-rerun-4` — 1 fallo:**

- Prospecto: [trace](../../e2e/test-results/v1.3-rerun-4/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)

## Matriz R1–R16 ↔ test

| Requisito | Test/evidencia | Resultado y límite |
| --- | --- | --- |
| R1 — deber legal bloquea y deber contractual no | Tests ex suscriptor y contrato vigente | **Pasó** en ambos. |
| R2 — vista previa y supresión transaccional | Test prospecto | **Falló** antes de resolver: HTTP 500. |
| R3 — localizar prospecto sin Party | Test prospecto, solicitud sintética asociada por documento | Fixture usa documento numérico normalizado; resolución no alcanzada por HTTP 500. |
| R4 — resolver con los mismos candidatos de la vista previa | Test prospecto | **No validado**; la vista previa falla. |
| R5 — cuenta activa impide supresión | Sin caso E2E | No cubierto por esta suite; requiere evidencia de integración PostgreSQL. |
| R6 — conservar solicitud, eventos, autorizaciones y marcas | Test prospecto | Se radica/verifica solicitud y hay consentimiento; conservación tras suprimir **no validada**. |
| R7 — anonimización de WFM y órdenes | Test prospecto | Se crean visita, evento y órdenes; su anonimización **no validada** por el 500 previo. |
| R8 — redacción y lectura auditada según permisos | Test ex suscriptor | **Pasó**: listado/360 y seis subrecursos con actores sin permiso, `crm.blocked_data.read` y `privacy.read`. |
| R9 — búsqueda excluye titular bloqueado | Test ex suscriptor | **Pasó**: búsqueda por documento y texto. |
| R10 — mutación bloqueada y sin escritura | Test ex suscriptor | **Pasó**: transición del suscriptor y archivo de contrato con `crm.blocked_data.read` dieron 409 `PRIVACY_DATA_BLOCKED`; estado del suscriptor y contrato quedó igual. SALES recibió 409 en edición genérica. ACCOUNTANT con permiso solo de lectura recibió 403 `FORBIDDEN`, sin cambio en ciudad/estado. |
| R11 — traslado tardío derivado del evento | Test traslado tardío | **Pasó**: insignia visible. |
| R12 — bloqueo derivado de marcas, sin puerto legado | Test ex suscriptor | **Pasó parcialmente** en comportamiento HTTP; la ausencia estática del puerto legacy no es objetivo de E2E. |
| R13 — CLI comparte participantes de anonimización | Sin caso E2E | No cubierto por esta suite; corresponde a pruebas del CLI. |
| R14 — cotización/contrato seudonimizado y conservado por CLI | Sin caso E2E de anonimización | No cubierto; el test de contrato vigente solo valida deber contractual. |
| R15 — marca «Anonimizado» visible | Test prospecto | **No validado** porque la ejecución se detiene en la vista previa. |
| R16 — acceso contable a datos bloqueados | Test ex suscriptor | **Pasó**: ACCOUNTANT con y sin «Facturación y cobro» se contrastan en listados/360; la lectura especial no habilitó escritura. |

## Cierre

La ruta del informe estaba libre antes de escribirlo. Sin commit. No se imprimieron credenciales, correos, tokens ni PII; los traces conservados están sanitizados. Para GO de V1 hace falta resolver el HTTP 500 de la vista previa de supresión y volver a ejecutar la suite con `--retries=0`.
