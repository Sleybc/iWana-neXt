# INFORME-PRIVACY-FASE-1B-V1-QA-v1.8

**Fecha:** 2026-10-16
**Estado:** **GO de V1**: **4 de 4 tests aprobados** en la tercera corrida (2026-10-16, `--retries=0`, autorizada por el usuario). Las dos corridas anteriores dieron 3 de 4. En ambas falló el escenario de prospecto, por cinco aserciones defectuosas del propio test (P2, P2-bis y P2-ter), no del producto. El historial completo está abajo.
**Prompt:** [`PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.3.md`](../prompts/PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.3.md), con la corrección de [`INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md`](INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md) en el árbol.
**Suite:** [`portal-privacy-fase-1b-live.spec.ts`](../../e2e/tests/portal-privacy-fase-1b-live.spec.ts).
**Skills consultadas como documentación:** `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`.

## Resultado

**Ya no hay HTTP 500.** `GET /privacy/requests/:id/erasure-preview` y `POST /privacy/requests/:id/resolve` respondieron sin error. El test avanzó por la vista previa, la resolución, el detalle de la solicitud (`RESUELTA`, identidad `VERIFICADA`, evento `RESUELTA`), el bootstrap del expediente (`anonymizedAt` presente, nombre y documento distintos de los originales) y el título de la visita (`ANONIMIZADO`).

### [P2] Defecto del test: la dirección anonimizada se esperaba como marcador

El test falló en la línea 870:

```text
expect(visit['address']).toBe('ANONIMIZADO')
Expected: "ANONIMIZADO"
Received: null
```

El comportamiento correcto es `NULL`. El Anexo A del [runbook](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) (D1 Fase 1b) lo fija así:

| Tabla | Línea del runbook | Regla |
| --- | --- | --- |
| `visit_requests` | 191 | `title` → `ANONIMIZADO`; `address`, `municipality`, `sector`, `latitude`, `longitude` → `NULL` |
| `schedule_events` | 192 | `title` → `ANONIMIZADO`; `address` → `NULL` |
| `execution_orders` | 196 | `customer_display_label` y `work_summary` → `ANONIMIZADO`; `service_address` → `NULL` |

El participante WFM y el de órdenes de ejecución aplican exactamente esas reglas (`VISIT_RULES`, `SCHEDULE_RULES` y las reglas de ejecución). El test pedía `'ANONIMIZADO'` en tres campos que el contrato define como `NULL`: es un defecto del propio test, no del producto.

**Corrección aplicada al test**, únicamente en `e2e/**`: las líneas de `visit.address`, `scheduleEvent.address` y `executionOrder.serviceAddress` pasan de `toBe('ANONIMIZADO')` a `toBeNull()`, con un comentario que remite al Anexo A. No cambió ninguna otra aserción. **No se ejecutó una segunda corrida**, porque el encargo pide una sola. Así, la corrección y las aserciones posteriores a la línea 870 (orden de trabajo, orden de ejecución, consentimiento conservado y marca «Anonimizado» en la UI) siguen pendientes de validación en Playwright.

### Estado real en la base tras la corrida (solo lectura)

Para no dejar sin evidencia lo que el test no alcanzó, se consultaron en `BEGIN READ ONLY` las filas que esta corrida creó y anonimizó en el tenant `e2e-privacy-1b-a114bf06`. Se muestran solo marcadores y booleanos:

| Fila | Marcador | Dirección / ubicación |
| --- | --- | --- |
| Visita | `title = ANONIMIZADO` | `address`, `municipality` y `latitude` en `NULL` |
| Evento | `title = ANONIMIZADO` | `address`, `municipality` y `latitude` en `NULL` |
| Orden de trabajo | `summary = ANONIMIZADO` | `notes` en `NULL` |
| Orden de ejecución | `customer_display_label` y `work_summary` = `ANONIMIZADO` | `service_address` y `municipality` en `NULL` |
| Expediente | `full_name = ANONIMIZADO` | `document_number_hmac` en `NULL`; `anonymized_at` y `anonymized_request_id` presentes |
| Solicitud | `status = RESUELTA` | `erased_at` presente; `erasure_categories = IDENTIFICACION, EVIDENCIA_CONSENTIMIENTO, OPERACION_CAMPO` |

Esto es evidencia de la base, no de Playwright. La marca «Anonimizado» en la UI (R15) no se observó en el navegador.

## Verificaciones de entorno

| Control | Resultado |
| --- | --- |
| `public.tenants` con `MARKED_FOR_DELETION`, antes de arrancar el worker | `0` |
| Tenant `e2e-privacy-1b-a114bf06` | `ACTIVE` |
| API `pnpm --filter @iwana/api dev`, `/api/v1/health` | HTTP 200; 0 líneas `ERROR` en su log |
| Worker `pnpm --filter @iwana/worker dev` | Arrancó; 1 línea esperada «[scheduler] Job repetible de purga de schemas tenant registrado» |
| `[tenant-purge] Tenant purgado:` / `Tenants elegibles: N` con N > 0 | **0 líneas.** Se vigilaron durante toda la corrida; no hubo condición de parada. |
| Portal en `:3002` (`next-dev.mjs --webpack`, `NEXT_PUBLIC_PORTAL_API_URL` vacío, como el `webServer` de Playwright) | `/auth/login` HTTP 200 |
| Base | `dbiw` en el puerto `5433`, tomada de `.env.development` |

**Cierre:** la API, el worker y el portal de esta corrida se detuvieron por árbol de procesos. Los puertos `3000` y `3002` quedaron sin listeners y no quedó ningún proceso del worker. Se dejaron intactos procesos `node` anteriores a la corrida (de las 7:02 p. m.) que no pertenecían a ella. El tenant se conserva para repetir.

## Seed sintético

`node e2e/scripts/seed-privacy-fase-1b-fixtures.mjs` terminó con código 0, reutilizando el tenant. La salida es segura y coincide con la de v1.7:

```json
{
  "result": "ready",
  "tenantSlug": "e2e-privacy-1b-a114bf06",
  "tenantStatus": "ACTIVE",
  "migrations": [149, 150, 151],
  "authorizationText": "published",
  "catalogPlan": "active",
  "actorRoles": ["AUDITOR privacy admin", "ADMIN runner", "SALES", "TECHNICIAN", "ACCOUNTANT billing", "ACCOUNTANT standard"],
  "privacyAdminCrmPermissions": ["crm.expedientes.manage", "crm.expedientes.read", "crm.subscribers.manage", "crm.subscribers.read"],
  "passwordsPrinted": false
}
```

## Conteo real de Playwright

Corrida **única**:

```text
pnpm exec playwright test -c playwright.portal.config.ts tests/portal-privacy-fase-1b-live.spec.ts \
  --retries=0 --trace=retain-on-failure --output=test-results/v1.8
```

Chromium, 1 worker:

```text
Running 4 tests using 1 worker
1 failed, 3 passed (23.7s)
```

| # | Test | Duración | Resultado |
| --- | --- | --- | --- |
| 1 | Prospecto: SUPRIMIR, vista previa, resolver y anonimizar expediente, visita y órdenes | 3,4 s | **FALLÓ** en la línea 870 (defecto del test, ver P2) |
| 2 | Ex suscriptor dentro de retención: rechazo legal, listado redactado, búsqueda excluida y seis subrecursos | 8,4 s | **PASÓ** |
| 3 | Contrato vigente: rechazo por deber contractual sin marca de bloqueo | 3,7 s | **PASÓ** |
| 4 | Traslado fuera de plazo: insignia «Traslado extemporáneo» | 5,1 s | **PASÓ** |

### Trace del fallo

- Prospecto: [trace](../../e2e/test-results/v1.8/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip)

Saneamiento:

- Se eliminaron la captura (`test-failed-1.png`) y el vídeo (`video.webm`).
- Se redactaron en el trace los JWT, cabeceras `Bearer`, correos, campos `password`, UUID, cadenas de 64 hex, números largos entre comillas y los valores conocidos de `.env.development.local`. Se tocaron 50 archivos internos.
- El escaneo posterior encontró **0** correos, 0 JWT, 0 UUID reales, 0 cadenas de 64 hex y 0 valores de contraseña.

## Matriz R1–R16 ↔ test

| Requisito | Test/evidencia | Resultado y límite |
| --- | --- | --- |
| R1 — el deber legal bloquea y el contractual no | Tests ex suscriptor y contrato vigente | **Pasó** en ambos. |
| R2 — vista previa y supresión transaccional | Test prospecto | **Pasó** la vista previa (200, elegible) y la resolución; la solicitud quedó `RESUELTA`. El test falló después, en la línea 870. |
| R3 — localizar un prospecto sin Party | Test prospecto | **Pasó**: la vista previa encontró el expediente por el documento y el bootstrap lo muestra anonimizado. |
| R4 — resolver con los mismos candidatos de la vista previa | Test prospecto | **Pasó**: `resolve` con los candidatos de la vista previa no devolvió `CANDIDATES_CHANGED`. |
| R5 — una cuenta activa impide la supresión | Sin caso E2E | No cubierto por esta suite (integración PostgreSQL). |
| R6 — conservar solicitud, eventos, autorizaciones y marcas | Test prospecto | Solicitud y evento `RESUELTA` **validados**. La aserción del consentimiento conservado está después de la línea 870 y **no corrió**. |
| R7 — anonimización de WFM y órdenes | Test prospecto + base | Título de la visita **validado** en E2E. La dirección en `NULL` (conforme al runbook) se observó en la respuesta, pero la aserción del test era incorrecta. Evento, orden de trabajo y orden de ejecución se **verificaron en la base**, no en Playwright. |
| R8 — redacción y lectura auditada según permisos | Test ex suscriptor | **Pasó.** |
| R9 — la búsqueda excluye al titular bloqueado | Test ex suscriptor | **Pasó.** |
| R10 — mutación bloqueada y sin escritura | Test ex suscriptor | **Pasó**: transición y archivo de contrato con 409 `PRIVACY_DATA_BLOCKED`, también con `crm.blocked_data.read`. |
| R11 — traslado tardío derivado del evento | Test traslado tardío | **Pasó.** |
| R12 — bloqueo derivado de marcas, sin puerto legado | Test ex suscriptor | **Pasó** en comportamiento HTTP; la ausencia estática del puerto no es objetivo de E2E. |
| R13 — el CLI comparte participantes | Sin caso E2E | No cubierto; corresponde a las pruebas del CLI. |
| R14 — cotización y contrato seudonimizados y conservados por el CLI | Sin caso E2E | No cubierto. |
| R15 — marca «Anonimizado» visible | Test prospecto | **No validado**: la aserción de UI está después de la línea 870. |
| R16 — acceso contable a datos bloqueados | Test ex suscriptor | **Pasó.** |

## Corrida confirmatoria (autorizada por el usuario, 2026-10-16)

El usuario autorizó en el chat **una** corrida confirmatoria con `--retries=0`, con el mismo procedimiento de v1.3.

### Entorno

| Control | Resultado |
| --- | --- |
| `MARKED_FOR_DELETION` antes del worker | `0`; tenant `ACTIVE` |
| API `/api/v1/health` | HTTP 200; 0 líneas `ERROR` |
| Worker | 1 línea esperada de registro del job; **0** líneas `Tenant purgado:` / `Tenants elegibles: N>0` (vigiladas durante toda la corrida) |
| Portal `/auth/login` | HTTP 200 |
| Seed | Código 0, reutilizó el tenant: `ready`, `ACTIVE`, migraciones 149–151, texto legal `published`, plan `active`, 6 actores, `passwordsPrinted: false` |
| Cierre | API, worker y portal detenidos (solo los procesos arrancados desde las 8:14 p. m.); puertos `3000` y `3002` sin listeners; 0 procesos del worker |

### Conteo real

Comando: `--retries=0 --trace=retain-on-failure --output=test-results/v1.8-confirm`. Chromium, 1 worker.

```text
Running 4 tests using 1 worker
1 failed, 3 passed (22.9s)
```

| # | Test | Duración | Resultado |
| --- | --- | --- | --- |
| 1 | Prospecto: SUPRIMIR, vista previa, resolver y anonimizar | 3,5 s | **FALLÓ** en la línea 888 (defecto del test, ver abajo) |
| 2 | Ex suscriptor dentro de retención | 8,2 s | **PASÓ** |
| 3 | Contrato vigente | 3,6 s | **PASÓ** |
| 4 | Traslado fuera de plazo | 4,7 s | **PASÓ** |

**Avance respecto de la primera corrida:** las tres correcciones de la P2 pasaron en Playwright. Visita con `title = ANONIMIZADO` y `address = null`, evento con `title = ANONIMIZADO` y `address = null`, y orden de trabajo con `summary = ANONIMIZADO`.

**Trace del fallo:** [trace](../../e2e/test-results/v1.8-confirm/portal-privacy-fase-1b-liv-14ee9-expediente-visita-y-%C3%B3rdenes-chromium/trace.zip). Se aplicó el mismo saneamiento: sin captura ni vídeo, 55 archivos internos redactados, y el escaneo posterior dio 0 correos, 0 JWT, 0 UUID reales, 0 cadenas de 64 hex y 0 contraseñas.

### [P2-bis] Defecto del test: campos que el detalle de la orden de ejecución no publica

```text
expect(executionOrder['customerDisplayLabel']).toBe('ANONIMIZADO')
Expected: "ANONIMIZADO"
Received: undefined
```

El contrato `ExecutionOrderDetail` (`packages/shared/src/contracts/operations/execution-orders.ts:215-239`) no incluye `customerDisplayLabel` ni `serviceAddress`. Solo publica `site`, que es la sede del operador, no la del cliente. Esos campos existen únicamente en el comando de despacho (`DispatchExecutionOrderCommand`). La aserción no podía pasar con ningún dato. Se cambió por dos comprobaciones: que el detalle corresponde a la orden (`id`) y que su JSON no contiene el nombre ni la dirección del prospecto.

### [P2-ter] Defecto del test, detectado en revisión estática: estado del consentimiento

La aserción siguiente (`consent['status'] === 'ACCEPTED'`) también habría fallado:

- El fixture crea el consentimiento con `'ACCEPTED'`, un alias heredado que `create-consent.dto.ts` admite.
- La API persiste el valor canónico `ConsentStatus.ACEPTADO` (`packages/shared/src/enums/crm/consent-status.enum.ts`). La base lo confirma: `status = ACEPTADO`.
- Se cambió la aserción a `'ACEPTADO'`.
- **Límite:** que el `GET .../consents` devuelve el valor canónico se infiere del enum y de la fila guardada. No se observó en una respuesta HTTP de esta corrida.

### Estado real en la base para las filas de esta corrida (solo lectura)

| Fila | Resultado |
| --- | --- |
| Orden de ejecución | `customer_display_label` y `work_summary` = `ANONIMIZADO`; `service_address` y `municipality` en `NULL` |
| Consentimiento | Conservado: `status = ACEPTADO`, `consent_type = TRATAMIENTO_DATOS`, `ip_address` en `NULL` |
| Expediente | `full_name = ANONIMIZADO`, `anonymized_at` presente, `document_number_hmac` en `NULL` |

### Matriz R1–R16 tras la confirmatoria

Solo cambian estas filas; las demás quedan como en la tabla anterior.

| Requisito | Resultado |
| --- | --- |
| R2, R3, R4 | **Pasaron** en ambas corridas. |
| R6 — conservación | Solicitud y eventos validados en E2E. Consentimiento conservado **verificado en la base**; la aserción E2E (corregida) no corrió. |
| R7 — WFM y órdenes | Visita, evento y orden de trabajo **validados en Playwright**. Orden de ejecución **verificada en la base**; su comprobación E2E (corregida) no corrió. |
| R15 — marca «Anonimizado» en la UI | **No validado en el navegador.** Revisión estática: `ExpedienteHeader` usa `PrivacyAnonymizedBadge` («Titular anonimizado · fecha»), que es lo que el test busca. |

## Tercera corrida (autorizada por el usuario, 2026-10-16): 4 de 4

El usuario autorizó en el chat una tercera corrida única con `--retries=0`, con el mismo procedimiento de v1.3. El spec es el de la confirmatoria más las correcciones P2-bis y P2-ter; no hubo ningún otro cambio.

### Entorno

| Control | Resultado |
| --- | --- |
| `MARKED_FOR_DELETION` antes del worker | `0`; tenant `ACTIVE` |
| API `/api/v1/health` | HTTP 200; 0 líneas `ERROR` |
| Worker | 1 línea esperada de registro del job; **0** líneas `Tenant purgado:` / `Tenants elegibles: N>0` (vigiladas durante toda la corrida) |
| Portal `/auth/login` | HTTP 200 |
| Seed | Código 0: `ready`, `ACTIVE`, migraciones 149–151, texto legal `published`, plan `active`, 6 actores, `passwordsPrinted: false` |
| Cierre | API, worker y portal detenidos (13 procesos arrancados desde las 8:18 p. m.); puertos `3000` y `3002` sin listeners; 0 procesos del worker |

### Conteo real

Comando: `--retries=0 --trace=retain-on-failure --output=test-results/v1.8-run3`. Chromium, 1 worker.

```text
Running 4 tests using 1 worker
4 passed (26.8s)
```

| # | Test | Duración | Resultado |
| --- | --- | --- | --- |
| 1 | Prospecto: SUPRIMIR, vista previa, resolver y anonimizar expediente, visita y órdenes | 8,4 s | **PASÓ** |
| 2 | Ex suscriptor dentro de retención: rechazo legal, listado redactado, búsqueda excluida y seis subrecursos | 8,2 s | **PASÓ** |
| 3 | Contrato vigente: rechazo por deber contractual sin marca de bloqueo | 3,6 s | **PASÓ** |
| 4 | Traslado fuera de plazo: insignia «Traslado extemporáneo» | 4,4 s | **PASÓ** |

No hubo fallos, así que no se generaron traces. `test-results/v1.8-run3` no se creó.

### Matriz R1–R16 final

| Requisito | Test/evidencia | Resultado final |
| --- | --- | --- |
| R1 — el deber legal bloquea y el contractual no | Ex suscriptor y contrato vigente | **Pasó** |
| R2 — vista previa y supresión transaccional | Prospecto | **Pasó** |
| R3 — localizar un prospecto sin Party | Prospecto | **Pasó** |
| R4 — resolver con los mismos candidatos de la vista previa | Prospecto | **Pasó** |
| R5 — una cuenta activa impide la supresión | Sin caso E2E | No cubierto por esta suite (integración PostgreSQL) |
| R6 — conservar solicitud, eventos, autorizaciones y marcas | Prospecto | **Pasó**: solicitud `RESUELTA` con su evento y consentimiento `ACEPTADO` conservado |
| R7 — anonimización de WFM y órdenes | Prospecto | **Pasó**: visita y evento (marcador y dirección `NULL`), orden de trabajo (marcador) y orden de ejecución (el detalle no expone el nombre ni la dirección del titular; en la base, ambos marcadores y `NULL`) |
| R8 — redacción y lectura auditada según permisos | Ex suscriptor | **Pasó** |
| R9 — la búsqueda excluye al titular bloqueado | Ex suscriptor | **Pasó** |
| R10 — mutación bloqueada y sin escritura | Ex suscriptor | **Pasó** |
| R11 — traslado tardío derivado del evento | Traslado tardío | **Pasó** |
| R12 — bloqueo derivado de marcas, sin puerto legado | Ex suscriptor | **Pasó** en comportamiento HTTP; la ausencia estática del puerto no es objetivo de E2E |
| R13 — el CLI comparte participantes | Sin caso E2E | No cubierto; corresponde a las pruebas del CLI |
| R14 — cotización y contrato seudonimizados por el CLI | Sin caso E2E | No cubierto |
| R15 — marca «Anonimizado» visible | Prospecto | **Pasó**: encabezado «Anonimizado» e insignia «Titular anonimizado» en el detalle del expediente |
| R16 — acceso contable a datos bloqueados | Ex suscriptor | **Pasó** |

R5, R13 y R14 siguen fuera del alcance de esta suite E2E, igual que en v1.7.

### Resumen de las corridas

| Corrida | Spec | Resultado |
| --- | --- | --- |
| 1 (encargo) | Original | 3/4: falla P2 (dirección esperada como marcador) |
| 2 (confirmatoria) | + P2 | 3/4: falla P2-bis (campos ausentes en `ExecutionOrderDetail`) |
| 3 | + P2-bis y P2-ter | **4/4** |

Acumulado de esta versión: 12 ejecuciones de test, 10 aprobadas y 2 fallidas. Los dos fallos se debieron a defectos del test. En las tres corridas, el producto se comportó conforme al runbook y al contrato.

## Cierre

- La ruta del informe estaba libre antes de escribirlo. Sin commit.
- Archivos tocados: `e2e/tests/portal-privacy-fase-1b-live.spec.ts` (cinco aserciones: P2, P2-bis y P2-ter) y los artefactos en `e2e/test-results/v1.8/` y `e2e/test-results/v1.8-confirm/`.
- En total se hicieron tres corridas: la única del encargo y dos más autorizadas en el chat.
- El seed reescribió `.env.development.local` (2026-10-16 20:10). Por diseño (`writeEnvVariables`), solo toca `E2E_PRIVACY_1B_TENANT_SLUG`, `E2E_PRIVACY_ADMIN_EMAIL` y `E2E_PRIVACY_ADMIN_PASSWORD`. No se comparó el valor anterior y el nuevo, para no leer secretos.
- No se tocó código de producto ni contratos.
- No se imprimieron credenciales, correos, tokens ni PII. Los logs de los servicios quedaron fuera del repo.
