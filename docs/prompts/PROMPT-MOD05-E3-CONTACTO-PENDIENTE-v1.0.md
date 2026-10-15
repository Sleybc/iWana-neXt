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
