# PROMPT DE EJECUCIÓN — MOD05 · E-3 opción (a): contacto pendiente sin placeholders

**Versión:** 1.0 · **Estado:** Emitido — G4 vigente · **Fecha:** 2026-10-15 · **Emisor:** AI-EM-ARCH
**Plan:** [2026-10-15-mod05-e3-contacto-pendiente.md](../plans/2026-10-15-mod05-e3-contacto-pendiente.md)
**Decisión:** E-3 opción (a) del CTO, 2026-10-15 ([auditoría MOD05](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md) C-10): relajar el `NOT NULL` del contacto y bloquear la activación sin contacto real. Cierra SUB-M07, SUB-B05 y B7-03.

## 1. Regla de negocio

| # | Regla |
| --- | --- |
| R1 | **Contacto real** = al menos un teléfono **o** un correo del suscriptor, guardado cifrado, que no sea un placeholder. Su función única es `hasRealContact(subscriber)` = `email_encrypted IS NOT NULL OR phone_encrypted IS NOT NULL` |
| R2 | La **conversión** desde el expediente **nunca** falla por falta de contacto: el suscriptor queda en `PROSPECT` con el contacto pendiente |
| R3 | El **alta directa** exige al menos un contacto (R1); ya no exige los dos |
| R4 | Toda transición **a `ACTIVE`** exige R1 (`PROSPECT → ACTIVE` y `SUSPENDED → ACTIVE`) |
| R5 | El expediente no puede pasar a `CLIENTE_ACTIVO` si su suscriptor no cumple R1. El rechazo es **síncrono**, antes de guardar, porque la activación del suscriptor ocurre después en un listener asíncrono que no puede rechazar |
| R6 | Una edición no puede dejar sin contacto a un suscriptor `ACTIVE` |
| R7 | Ningún código escribe placeholders. `party_contact.value` pasa a `NULL` en lugar del centinela `''` |

**Supuesto declarado (lo puede revisar el CTO):** basta un canal. El correo para la entrega de la factura electrónica es responsabilidad de Billing, que hoy no consume este dato.

## 2. Contratos

### C-E3-DDL — migración tenant 148

- `subscribers.email_encrypted` y `subscribers.phone_encrypted`: `DROP NOT NULL`.
- `party_contact.value`: `DROP NOT NULL`.
- `down()` restaura el `NOT NULL` **solo** si no hay filas nulas. Si las hay, aborta con un mensaje que da conteos y no PII, como el rollback de la 027.
- El backfill de datos **no** va en la migración: necesita `PII_HASH_KEY` (ver C-E3-CLI).

### C-E3-API

| Punto | Contrato |
| --- | --- |
| `CreateSubscriberSchema` (`@iwana/shared`) | `email` y `phone` opcionales, con un `superRefine` que exige al menos uno: «Registra al menos un teléfono o un correo.» |
| `UpdateSubscriberSchema` | Sin cambios de forma; R6 se valida en el servicio |
| Proyecciones del suscriptor | `contactPending: boolean` (derivado de R1) en el detalle, la 360° y `SubscriberListItem`. **Debe añadirse a la lista blanca de `sanitizeResponse`** (lección A26) |
| Errores 422 | `SUBSCRIBER_CONTACT_REQUIRED` (R4 y R6) y `EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED` (R5). Mensajes en §4 |
| `activateFromExpediente` | Defensa en profundidad: sin R1 no activa, deja la auditoría `ACTIVATION_BLOCKED_CONTACT_PENDING` sin PII y retorna `null` |

### C-E3-CLI — `apps/api/src/cli/backfill-placeholder-contacts.ts`

Mismo patrón que `backfill-party-pii.ts`. Por defecto hace un dry-run; `--apply` escribe. Trabaja por tenant, en una transacción por tenant.

**Qué detecta:**
- correo placeholder: `email_hmac = HMAC('expediente-<expediente_id>@placeholder.iwana.co')`;
- teléfono placeholder: `phone_hmac = HMAC('0000000000')`;
- en `party_contact`, las filas cuyo `value_hmac` coincide con alguno de esos dos;
- `party_contact.value = ''`.

**Qué hace con `--apply`:**
- pone a `NULL` el cifrado y el HMAC del contacto placeholder;
- elimina las filas placeholder de `party_contact` (borrado lógico si la tabla lo soporta);
- convierte `value = ''` en `NULL`.

**Informe:** solo conteos por tenant, sin PII. Incluye cuántos suscriptores `ACTIVE` quedan sin contacto: siguen activos, pero el operador debe completarlos. Es idempotente.

## 3. Pasada regla → campo

| Regla | Campo, endpoint o archivo | Dueño |
| --- | --- | --- |
| R1 | `hasRealContact` en `crm/subscribers` | E2 |
| R2 | `subscriber-creation.service.ts:270-310` (`resolveEmail` y `resolvePhone` dejan de devolver placeholders) | E2 |
| R3 | `CreateSubscriberSchema` (`packages/shared/src/schemas/subscriber.schema.ts:112-118`) | E2 |
| R4 | `SubscriberStatusTransitionService` y `transitionStatus` (`subscribers.service.ts:815`) | E2 |
| R5 | `ExpedienteService`, transición a `CLIENTE_ACTIVO` (`expediente.service.ts:1109`, antes del guardado de `:1118`) | E2 |
| R6 | `update` de `SubscribersService` | E2 |
| R7 | `party-pii.util.ts:11,47-50`, `party-contact.service.ts:42,57`, migración 148 | E1 (DDL) · E2 (código) |
| `contactPending` | `subscriber-projection.ts`, `sanitizeResponse` (`subscribers.controller.ts:512`) y `SubscriberListItem` | E2 |
| Datos existentes | C-E3-CLI | E2 |
| Rotación de claves con `NULL` | `reencrypt-aes.targets.ts:101,109`: debe omitir los `NULL` | E2 (test) |
| UI | §4 | E3 |

## 4. UX (definida por AI-EM-ARCH; no se agrega flujo nuevo)

| Superficie | Comportamiento y texto |
| --- | --- |
| Formulario de alta | Correo y teléfono opcionales; al enviar sin ninguno: «Registra al menos un teléfono o un correo.» junto a ambos campos |
| Ficha del suscriptor (encabezado) | Con `contactPending`: la etiqueta **Contacto pendiente** (texto, icono y color de atención) y la acción **Agregar contacto**, que abre la edición en la sección de contacto |
| Listado de suscriptores | La celda de contacto muestra **Contacto pendiente** en vez de quedar vacía |
| Activar suscriptor | 422 `SUBSCRIBER_CONTACT_REQUIRED` → «Para activar el servicio, registra al menos un teléfono o un correo del suscriptor.», con la acción **Agregar contacto** |
| Expediente → cliente activo | 422 `EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED` → «No se puede marcar como cliente activo: el suscriptor no tiene teléfono ni correo registrados.», con un enlace a la ficha del suscriptor |
| Edición | No deja quitar el último contacto de un suscriptor activo: «Un suscriptor activo necesita al menos un teléfono o un correo.» |

| ID | Criterio de aceptación |
| --- | --- |
| CA-E3-01 | La etiqueta aparece si y solo si `contactPending` es verdadero |
| CA-E3-02 | La validación del formulario exige al menos uno de los dos campos |
| CA-E3-03 | Los dos 422 muestran su texto y su acción |
| CA-E3-04 | No se muestra ningún placeholder ni enum crudo |

## 5. Bloques

| Bloque | Subagente | Propiedad exclusiva | Stop/go |
| --- | --- | --- | --- |
| E1 | `data-eng` | `packages/database/src/migrations/tenant/148_*` con sus specs y su registro en el runner | `up/down/up` contra Postgres real; `down` aborta con `NULL` presentes; la integración corre con `E2E_TENANT_SLUG=test` sin depender del estado de migración del origen |
| E2 | `sr-backend` | `crm/subscribers/**`; en `crm/expedientes/expediente.service.ts`, **solo** la guarda de R5 y sus specs; `parties/party-pii.util.ts` y `parties/services/party-contact.service.ts`; `packages/shared/src/schemas/subscriber.schema.ts` (y `SubscriberListItem`); `apps/api/src/cli/backfill-placeholder-contacts*` | **Primero publica** los schemas compartidos (E3 los consume). Turbo `api` + `shared` `--force`. Integración contra Postgres real: conversión sin contacto → `PROSPECT`, `contactPending`, sin placeholder; activación 422; expediente a `CLIENTE_ACTIVO` 422 sin escritura; tras agregar un contacto, activa. CLI: dry-run, `--apply` e idempotencia con fixtures sintéticos. Rotación de claves con `NULL` |
| E3 | `fe-platform` | En `apps/portal/src/components/crm/subscribers/`: `SubscriberForm.tsx` (solo los campos de contacto), `SubscriberHeader.tsx`, `SubscribersListClient.tsx` (solo la celda de contacto) y `SubscriberStatusTransitionDialog.tsx` (solo el 422 de R4). En `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`, solo el manejo del 422 de R5 en la transición (`:868`); es la única superficie que pasa a `CLIENTE_ACTIVO`, porque Programación solo agenda (`scheduling-expediente-sync.ts:81`). Además, la sección de suscriptores de `api-client.ts` | Turbo portal `--force`; `audit-ui.mjs`; un test por CA-E3-01 a 04 |
| E4 | `sr-qa` → `sec-eng` → `gate-verifier` | Solo tests y revisión | `sr-qa`: un E2E contra la API real (convertir sin contacto → activación bloqueada → agregar contacto → activar). `sec-eng`: el CLI (PII y HMAC) y la ausencia de placeholders. `gate-verifier`: los cinco paquetes. **G6.5:** CI de `main` en verde con el PASS de la 148 y de las integraciones de E2 |

**Restricciones:**
- No correr en paralelo con la Fase 04 de suscriptores.
- Los specs de integración no pueden depender del estado de migración del tenant de origen (lección R6 y R7).
- La clave HMAC sale siempre de `ConfigService` (lección R8).
- **Ejecución por tenant del CLI:** forma parte de G7, en el runbook, después de la 148.

## 6. Ola 2: resultado y Ola 2-bis (v1.0.1, 2026-10-15)

| Bloque | Resultado |
| --- | --- |
| E4-B `sec-eng` | ✅ GO |
| E4-C `gate-verifier` | Lint, typecheck y tests en verde (15 comandos, 0 en caché). **NO-GO** por la cobertura de `expediente.service.ts` (74,35 % statements / 56,80 % branches) y por `SET search_path` fuera de una transacción en B5 (`b5-identity-conversion…:366`). Las 2 suites omitidas exigen una base sintética, igual que en CI: aceptado |
| E4-A `sr-qa` | Bloqueado: la conversión no creó suscriptor y `retry-conversion` respondió `resolved: true` |
| Anexo A `data-eng` | `[BLOQUEO]` legítimo (§6.3) |

### 6.1 Defecto real: los fallos de conversión se tragan en silencio (SUB-A01 reabierto)

**Diagnóstico de AI-EM-ARCH, verificado en el código:**
- Los listeners del pipeline usan `@OnEvent(..., { async: true })`: `subscriber-creation.service.ts:55`, `subscriber-activation.listener.ts:17` y `subscriber-cancellation.listener.ts:12`.
- En `@nestjs/event-emitter` 3.0.1, `suppressErrors` vale `true` por defecto: `wrapFunctionInTryCatchBlocks` registra el error y **no lo propaga** (`dist/event-subscribers.loader.js:95-104`).
- Por eso `emitPipelineEventSafely` (`expediente.service.ts:2981`) nunca ve el error del listener: marca el evento como resuelto y `retryConversionEvent` responde `resolved: true` aunque no haya suscriptor. **El registro para reintento de SUB-A01 nunca funcionó para fallos dentro del listener.** La re-auditoría lo dio por cerrado apoyándose en B5; se corrige.
- **Causa probable del fallo de E4-A:** la conversión exige `TRATAMIENTO_CONTRACTUAL` (A18) y el expediente sintético no tenía consentimiento, así que respondió 422 y el error quedó oculto. El encargo de E4-A no listaba esa precondición: **defecto del emisor**.

**Contrato de la corrección (F1):**
- Los tres listeners quedan **sin `async: true` y con `suppressErrors: false`**, de modo que `emitAsync` espere y propague el error.
- `emitPipelineEventSafely` registra el fallo con el **código de dominio** (el `code` de la respuesta de la excepción, por ejemplo `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED`; si no lo hay, `CONVERSION_FAILED`). La transición del expediente ya guardada **no se revierte**: el fallo queda pendiente de reintento y lo muestra `ExpedienteConversionBanner`.
- `retryConversionEvent` responde `resolved: true` solo si el efecto existe: suscriptor vinculado para `ready-for-installation` y suscriptor `ACTIVE` para `activated`. En otro caso, el fallo sigue pendiente.
- Los listeners de otros módulos sobre estos eventos también propagan sus errores, que quedan registrados con su código.

### 6.2 Criterio de cobertura para `expediente.service.ts` (decisión de AI-EM-ARCH)

El gate de ≥ 80 % de AGENTS.md se mide **por módulo**, como en los cierres de MOD04 y de la remediación MOD05 B8, que usaron los agregados de `crm/subscribers` y `parties`.

**Para esta fase se exige:**
- el agregado de `crm/expedientes` ≥ 80 % en statements y en branches;
- 100 % de las líneas cambiadas en `expediente.service.ts` (R5, F1);
- que la cobertura del archivo no baje.

La deuda previa del archivo queda registrada como P2 con dueño `sr-backend`, no como bloqueo de E-3.

### 6.3 Anexo A: decisiones de AI-EM-ARCH sobre el bloqueo

| # | Bloqueo | Decisión |
| --- | --- | --- |
| A-1 | `PotentialLead` sin vínculo con la solicitud | **Fuera de alcance:** `potential_leads` **no tiene migración** (la entidad existe sin tabla) y el módulo no está montado (D-POT). El CLI comprueba que la tabla no exista o esté vacía, y aborta con un conteo si no |
| A-2 | Vínculo entre la solicitud y el prospecto | Determinista y explícito: el titular-Party sale de `request.party_id`; los expedientes los indica el Oficial con `--expediente <id>` (uno o varios) desde la bandeja. Si el expediente tiene HMAC de documento, el CLI verifica que coincida con `requester_document_hmac`; si no coincide o no lo tiene, exige `--confirm-unmatched` y que el motivo quede en el ticket |
| A-3 | PII de `users` (`subscribers.user_id`) | **En alcance, acotado:** solo la cuenta enlazada al titular y solo si ya está dada de baja desde Administración de usuarios (`deleted_at` presente); con la cuenta activa, el CLI aborta. Se anonimizan sus columnas personales con un valor único por `id`, para respetar las restricciones de unicidad. Es una herramienta operativa de `data-eng` revisada por `sec-eng`, como los CLI de backfill, no código de módulo |

### 6.4 Bloques de la Ola 2-bis

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| F1 | `sr-backend` | Los 3 listeners; en `expediente.service.ts`, `emitPipelineEventSafely`, `retryConversionEvent` y sus specs; el `SET search_path` de B5 (`:366`, más el patrón equivalente de la 146 en el mismo spec: `SET LOCAL` en una transacción o `RESET` antes de `release`) | Turbo API `--force`. Integración real: conversión sin autorización → fallo registrado con `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED`; reintento sin consentimiento → sigue pendiente; capturar consentimiento → reintento → suscriptor creado y fallo resuelto. Cobertura según §6.2 |
| F2 | `sr-qa` | Solo tests: `e2e/tests/portal-crm-contact-pending-live.spec.ts` | Tras F1. **Precondiciones del seed:** texto `AUTORIZACION` publicado y consentimiento `TRATAMIENTO_CONTRACTUAL` capturado en el expediente, con su medio, antes de convertir. 1/1 contra la API real, con CA-E3-01 a 04. Una aserción extra: si la conversión falla, el banner del expediente lo muestra. Tenant desechable `INACTIVE` al terminar |
| F3 | `data-eng` | `apps/api/src/cli/anonymize-titular*` y el Anexo A del runbook | Según §6.3 y el Anexo A original: dry-run, `--apply`, idempotencia, verificación, integración real con datos sintéticos (prospecto, ex suscriptor con cuenta dada de baja y ex suscriptor con cuenta activa, que debe abortar) |
| F4 | `gate-verifier`, después `sec-eng` (F3) | Solo lectura | Los cinco paquetes, la integración y la cobertura §6.2. `sec-eng` revisa el CLI de F3 antes de G7 |

## 7. Ola 2-bis: resultado y Ola 2-ter (v1.0.2, 2026-10-15)

| Bloque | Resultado |
| --- | --- |
| F1 | ✅ Los fallos se registran: B5 16/16 contra Postgres real; API 376 suites / 4.993 tests, 0 en caché; 23/23 líneas cambiadas cubiertas. `crm/expedientes`: 82,13 % de statements y **58,69 % de branches** |
| F3 | ✅ CLI de anonimización y Anexo A; integración 5/5; `sec-eng` aprobó el CLI dentro de A-1 a A-3 |
| F2 | ✅ 1/1 contra la API real, CA-E3-01 a 04, tenant `INACTIVE`. ❌ La aserción del banner de fallo no se pudo ejercitar |
| F4 | 15 comandos verdes, 0 en caché; boundary sin violaciones. Integración 18/20 suites: las 2 omitidas son de inventario y exigen su base sintética, igual que en CI. **Aceptado** |
| `sec-eng` | NO-GO: el UUID del expediente aparece en 3 logs (`expediente.service.ts:3018, 3023, 3038`). Además recomienda restringir `response.code` |

### 7.1 Disposiciones de AI-EM-ARCH

| # | Tema | Decisión |
| --- | --- | --- |
| D1 | **Branches de `crm/expedientes` (58,69 %)** | **Corrijo mi regla §6.2:** exigí el agregado ≥ 80/80 **sin medir antes la línea base del módulo**. E-3 solo tocó R5 y F1, y sus líneas están cubiertas al 100 %. Nueva exigencia para E-3: el agregado **no baja** respecto de `main` (`fb3d41ee`), medido por `gate-verifier`, y las líneas cambiadas al 100 %. Subir `crm/expedientes` a ≥ 80 % de branches queda como **P1 con dueño `sr-qa` y plazo antes del G7 de MOD05** |
| D2 | **UUID en logs** (`sec-eng`) | **No bloquea.** Las tres líneas repiten un patrón que ya existía en `main` (`[PIPELINE_EVENT] … expediente ${expedienteId}`) y que se usa en otros 7 logs de CRM. Llevan el identificador técnico, el nombre del evento y un código de dominio; ningún dato de identificación directa (nombre, documento, correo, teléfono o dirección), que es lo que prohíbe «No PII in logs» (AGENTS.md y `pii-log-guard`). El identificador es necesario para el soporte y el reintento. Si el CTO quiere tratar los UUID como PII, es una política transversal que requiere un ADR, no un cambio en E-3 |
| D3 | **`response.code` sin restricción** (`sec-eng`) | **Se acepta.** `pipelineErrorCode` (`:3057-3069`) solo admite `^[A-Z][A-Z0-9_]{2,63}$`; cualquier otro valor se convierte en `CONVERSION_FAILED`, para que ningún texto libre llegue a la tabla ni a los logs |
| D4 | **El banner de fallo no existe** | **Defecto del emisor:** pedí a F2 comprobar un comportamiento que el contrato no definía. Al revisar, el portal **no expone los fallos de conversión ni ofrece el reintento** (`ExpedienteConversionBanner.tsx` solo conoce `status` y `subscriberSummary`; ningún consumidor de `retry-conversion` en `apps/portal`). Sin eso, SUB-A01 queda registrado, pero el operador no lo ve. Se agrega §7.2 |
| D5 | **Causa más frecuente del fallo** | Prevenirla antes de que ocurra: **R8**. El paso a `LISTO_PARA_INSTALACION` exige el consentimiento `TRATAMIENTO_CONTRACTUAL` aceptado en el expediente, la misma condición que la conversión verifica tras el traspaso (A18). El rechazo es síncrono, antes de guardar: 422 `EXPEDIENTE_DATA_AUTHORIZATION_REQUIRED`. Si el validador de completitud ya lo exige, se alinea el código y el mensaje; no se duplica la regla |

### 7.2 Contrato de visibilidad del fallo (cierra SUB-A01 de punta a punta)

- **API:** el bootstrap del detalle del expediente añade `conversionFailure: { eventName, errorCode, attempts, lastFailedAt } | null`, con el fallo pendiente más reciente. Sin PII.
- **Portal** (`ExpedienteConversionBanner`): con un fallo pendiente, muestra el motivo y la acción **Reintentar conversión**, que llama a `POST /crm/expedientes/:id/retry-conversion`. Solo aparece con `crm.expedientes.manage`. Tras reintentar, se recarga el bootstrap.

| `errorCode` | Texto visible |
| --- | --- |
| `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED` | «No se creó el suscriptor: falta la autorización de tratamiento de datos. Regístrala en Consentimientos y vuelve a intentarlo.» |
| `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED` | «No se creó el suscriptor: la empresa no tiene publicado el texto de autorización. Pide a quien administra la privacidad que lo publique.» |
| `SUBSCRIBER_CONTACT_REQUIRED` (en `activated`) | «El suscriptor no se activó: registra al menos un teléfono o un correo.» |
| Cualquier otro | «No se pudo completar la conversión. Vuelve a intentarlo; si el problema continúa, contacta a soporte.» |
| 422 de R8 en la transición | «Para pasar a Listo para instalación, registra la autorización de tratamiento de datos en Consentimientos.» |

### 7.3 Bloques de la Ola 2-ter

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| G1 | `sr-backend` | En `expediente.service.ts`: `pipelineErrorCode` (D3), la guarda R8 y la proyección `conversionFailure` del bootstrap (`expediente-detail-bootstrap.service.ts` y `dto/expediente-detail-bootstrap.dto.ts`), más sus specs | Turbo API `--force`. Integración real: R8 rechaza sin escribir; con consentimiento, pasa. `conversionFailure` aparece y desaparece al resolverse. Un código inválido queda como `CONVERSION_FAILED`. Líneas cambiadas al 100 % |
| G2 | `fe-platform` | `ExpedienteConversionBanner.tsx`, el manejo del 422 de R8 en `app/dashboard/crm/expedientes/[id]/page.tsx` y la sección de expedientes de `api-client.ts` | Turbo portal `--force` y `audit-ui.mjs`. Tests: un texto por código, el reintento y que la acción no aparezca sin el permiso |
| G3 | `sr-qa` | Solo tests: el E2E de contacto pendiente y uno nuevo de fallo de conversión | Tras G1 y G2, contra la API real: R8 bloquea sin consentimiento; con un fallo sembrado en el schema sintético, el banner muestra el motivo y «Reintentar conversión» lo resuelve tras capturar el consentimiento. Tenant `INACTIVE` |
| G4 | `gate-verifier` → `sec-eng` | Solo lectura | Cinco paquetes e integración; cobertura D1, comparada con la línea base de `fb3d41ee`. `sec-eng` confirma D3 y que el banner no expone PII |

## 8. Ola 2-ter: resultado y Ola 2-quater (v1.0.3, 2026-10-15)

**Lo que cerró:**
- G3: 2/2 E2E contra la API real, con CA-E3-01 a 04, R8 y el banner con reintento.
- G4: 15 comandos verdes, 0 en caché. La API pasa 376 suites / 5.000 tests.
- `sec-eng`: la proyección, el banner, D2 (aceptado) y D3 (confirmado) no exponen PII.

**Lo que quedó abierto:**

| Hallazgo | Causa verificada | Decisión de AI-EM-ARCH |
| --- | --- | --- |
| **SEC-G4-01** (Alta): `retry-conversion` pasó a `@Roles(ADMIN, SALES, SUPPORT, SYSTEM_ADMIN)` + `CRM_EXPEDIENTES_MANAGE`, contra ADR-083 D2 | **Defecto del emisor.** §7.2 decía «solo aparece con `crm.expedientes.manage`» sin cruzarlo con lo que el endpoint exigía en `main` (`@Roles(ADMIN, SYSTEM_ADMIN)` + `CRM_SUBSCRIBERS_MANAGE`, `expedientes.controller.ts` en `fb3d41ee`). G1 alineó el endpoint con mi texto | **Revertir el endpoint** al estado de `main`. La UI copia el techo del endpoint: la acción solo se ofrece con rol `ADMIN` o `SYSTEM_ADMIN` **y** el permiso `crm.subscribers.manage`. Los demás ven el motivo y el texto «Pide a un administrador que reintente la conversión.» |
| **SEC-G4-02** (Media): el reintento lleva `@SkipAudit()` y no deja rastro propio | `@SkipAudit` ya estaba en `main`, pero el reintento cambia `crm_conversion_failures` | Auditoría explícita en `retryConversionEvent`: acción `CONVERSION_RETRY`, entidad `Expediente`, con `eventName`, `resolved` y `errorCode`; actor y sin PII |
| **SEC-G4-03** (aclaración): `pipelineEventHasEffect` lee `SubscribersService` | Lectura de postcondición intra-CRM | **Permitida.** Aclaración añadida a [ADR-027](../adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md): lectura de solo lectura dentro del mismo bounded context; la alternativa descartada se refiere a escrituras |
| **B5** falla: «mantiene pendiente la conversión sin autorización…» intenta llegar a `LISTO_PARA_INSTALACION` sin consentimiento | El test de F1 quedó desfasado: R8 hace imposible ese camino | Reescribir el test con un fallo que **todavía es posible** con R8 (consentimiento revocado o texto legal retirado entre `LISTO` y la conversión, o un fallo sembrado), conservando la aserción de pendiente → resuelto |
| **Cobertura D1:** `crm/expedientes` baja en statements (80,85 → 78,60), functions (75,88 → 72,06) y lines (82,87 → 80,43); el portal deja sin cubrir `page.tsx:959, 969, 974, 976` (95/99 líneas cambiadas) | Código nuevo sin tests suficientes | Tests hasta que las **cuatro métricas** queden ≥ línea base y las líneas cambiadas al 100 %. Branches ≥ 80 % sigue como P1 antes del G7 de MOD05 |

**Lección:** el permiso de una acción en la UI debe ser el mismo del endpoint, y el contrato nombra los dos. Guardada en memoria.

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| H1 | `sr-backend` | `expedientes.controller.ts` (solo los decoradores de `retry-conversion`), `retryConversionEvent` y su auditoría, `b5-identity-conversion.postgres.integration.spec.ts` (solo el test desfasado) | Decoradores iguales a `fb3d41ee`; un test HTTP de que SALES y SUPPORT con permiso reciben 403; auditoría `CONVERSION_RETRY` sin PII; B5 pasa con la integración completa |
| H2 | `fe-platform` | `ExpedienteConversionBanner.tsx` y `app/dashboard/crm/expedientes/[id]/page.tsx` (visibilidad del reintento y líneas 959–976) | La acción solo aparece con `ADMIN`/`SYSTEM_ADMIN` y `crm.subscribers.manage`; el texto alternativo para los demás; las líneas cambiadas del portal al 100 % |
| H3 | `sr-qa` | Solo tests de `crm/expedientes` y los E2E de G3 | Las cuatro métricas de `crm/expedientes` ≥ `fb3d41ee`. El E2E de reintento corre con un usuario `ADMIN` y comprueba que un `SALES` no ve la acción |
| H4 | `gate-verifier` → `sec-eng` | Solo lectura | Cinco paquetes, la integración completa con exit 0 y D1 completo. `sec-eng` revisa SEC-G4-01 y SEC-G4-02 |

## 9. Ola 2-quater: resultado y delta final (v1.0.4, 2026-10-15)

| Bloque | Resultado |
| --- | --- |
| H1 | ✅ El endpoint vuelve a `ADMIN` y `SYSTEM_ADMIN` con `crm.subscribers.manage`; auditoría `CONVERSION_RETRY`; B5 actualizado. API 376 suites / 5.000 tests; integración real 19 suites / 83 tests |
| H2 | ✅ La UI copia el techo del endpoint; 50/50 líneas cambiadas del portal cubiertas |
| H3 | ✅ 2/2 E2E reales: ADMIN reintenta y SALES ve el motivo sin la acción. Tenants `INACTIVE` |
| H4 `sec-eng` | ✅ **GO** para SEC-G4-01, 02 y 03 |
| H4 gates | 15 comandos verdes, 0 en caché; la integración pasa; D1 supera la línea base en las 4 métricas. **NO-GO** solo porque quedan 52/55 líneas de la API cubiertas |

**Las 3 líneas sin cubrir** (`expediente.service.ts:1328-1329` y `:1338`) son los dos retornos tempranos de `retryConversionEvent` que H1 dotó de auditoría: sin evento para el estado del expediente y sin fallo pendiente. Son código nuevo y se cubren con tests unitarios (H5).

**Observación de `sec-eng` fuera de E-3** (preexistente, Media): el orden del middleware de tenant frente al limitador. Queda registrada como deuda transversal para `sec-eng` y `plat-ops`; no afecta el GO.

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| H5 | `sr-backend` | Solo specs de `retryConversionEvent` | Dos tests: un estado sin evento de pipeline → `{ retried: false, resolved: false, eventName: null }` y la auditoría correspondiente; sin fallo pendiente → `retried: false` con el `eventName` y su auditoría. Ninguno con PII |
| H6 | `gate-verifier` | Solo lectura | Delta: turbo API `--force` y las líneas cambiadas de API (55/55) y del portal (51/51). Si pasa, **G6 de E-3 en GO** |
