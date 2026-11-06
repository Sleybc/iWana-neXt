# Spec — `privacy` · Supresión del historial de ciclo de vida (H-2)

**Versión:** 1.0
**Estado:** Aprobada. G0 del CTO el 2026-11-04: los siete puntos de §10 como se recomendaron. B1 se ejecutó antes de registrar este G0 y se revisó contra la spec (7/7 sin caché).
**Fecha:** 2026-11-03
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta para G7, sin fecha legal propia (§2.4). G7 sigue diferido hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).
**Origen:** hallazgo H-2 de la [spec K2](2026-11-03-privacy-k2-recifrado-anonimizados-spec.md) §8.
**Artefactos base:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7 · [HLD Privacy v1.4](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.4.md) §2, §6.6 y §6.7 · [PRD Fase 05](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md) §7, §9 Q3 y §9.3.2 · [runbook de supresión manual](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) Anexo A.1 · [prompt Fase 1b v1.0](../prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md) R6 y R13
**Plan:** [2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md](../plans/2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md) · **Lanzador:** [PROMPT-PRIVACY-SUPRESION-HISTORIAL-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-SUPRESION-HISTORIAL-LAUNCH-v1.0.md)

> Define comportamiento. No contiene código de producción. Las rutas se leyeron en `main` (`45046b56`) con diffs ajenos sin commitear; se revalidan al implementar.

## 1. Decisión en una línea

Al suprimir, **`note_encrypted` queda en `NULL` y el evento se conserva**. El bloqueo no cambia: ya cumple D7. Un cambio de una regla en el participante CRM, sin migración, sin cambio de contrato y sin UI.

## 2. Qué se confirmó

### 2.1 Ningún participante cubre la tabla

| Comprobación | Resultado |
| --- | --- |
| Participantes del adaptador (`crm-personal-data-erasure.adapter.ts:74-82`) | Siete. Ninguno nombra `crm_lifecycle_changes`; la búsqueda en `crm/privacy-adapters/` devuelve cero |
| Participante CRM | `CRM_RULES` (`crm-titular-erasure.participant.ts:23`) cubre expedientes, intentos de contacto, consentimientos, cobertura y suscriptores. `run()` añade contratos y cotizaciones. La tabla no aparece |
| Módulo `privacy` | `inventory/` y `retention/` no la nombran. La única mención está en una prueba del reloj de retención |
| Runbook, Anexo A.1 | Tampoco la lista |

### 2.2 La evidencia prueba el residuo, pero no por el campo que parece

`targets-after-erasure` (`corrida-rotacion-pii.ndjson`, línea 7) dice `crm_lifecycle_changes.note_encrypted`: `non_null: 1`, `non_null_anon: 0`.

**`non_null_anon: 0` no significa que la fila sea de un titular vivo.** El runner solo evalúa `anonymized_at` en `subscribers`, `expediente_records` y `party`; para las demás tablas usa `NULL::boolean` (`erasure-k2.k2e2e.spec.ts.txt:336-342`), así que ese campo siempre da 0. La fila se ata al titular suprimido por otro camino:

- La siembra crea **una sola** fila, sobre `ids.natural` (runner `:288-291`).
- `ids.natural` es `50000000-…-0002` (runner `:60`).
- `subscribers-after-erasure` (línea 5) muestra ese id con `anon: true`.

Alcance de esa evidencia: prueba que la fila sobrevive en base de datos. La fila se sembró con SQL, no por el servicio. CA-HN-01 cierra esto con un `JOIN` a `subscribers`.

### 2.3 La nota sigue legible

- `listHistory` la selecciona (`subscriber-lifecycle.service.ts:455`) y la descifra (`:875`) si `canReadNote`.
- `canReadNote` exige `CRM_SUBSCRIBERS_MANAGE` y, si el titular está bloqueado, además el permiso de datos bloqueados (`subscribers.controller.ts:748-750`).
- **La supresión cierra `DATOS_BLOQUEADOS` (HLD §6.6), y el controller no mira `anonymized_at`.** Después de suprimir, quien tenga `CRM_SUBSCRIBERS_MANAGE` lee la nota en claro por `GET /crm/subscribers/:id/lifecycle-changes`. Una supresión puede dejar la nota **más** expuesta que el bloqueo previo.

Esto último es lectura de código, no se ejecutó; lo prueba CA-HN-05. El portal no consume ese endpoint hoy: la exposición es por API.

Sin fuga por otros canales, según el código leído: las cuatro auditorías del servicio (`:296`, `:326`, `:641`, `:675`) y los dos logs (`:345`, `:906`) solo llevan estado y `reasonCode`. `contracts.service.ts:1548` lee `to_status` y `reason_code`, no la nota.

### 2.4 La fecha del 19-nov no aplica a este hallazgo

La Ley 2573 regula la suplantación (ADR-094 H6). El residuo es de la supresión, que viene de la Ley 1581 y ya rige. No hay producción hasta la beta, así que no hay titulares reales afectados. Se propone como bloqueante de G7, no como trabajo atado al 19-nov.

## 3. ¿La nota puede contener datos personales?

Sí, y el proyecto ya lo tiene decidido:

- **PRD §7:** «puede contener datos personales». Por eso se cifró.
- **PRD §9 Q3 y §9.3.2:** el cifrado «no reemplaza la anonimización», y la protección «no sustituye anonimización/supresión».
- **Inventario ADR-058:** es objetivo de `PII_ENCRYPTED_TARGETS` (`reencrypt-aes.pii.ts:72`).
- **Texto libre sin control:** hasta 500 caracteres. Zod solo limita el largo (`lifecycle.schema.ts:54`) y el diálogo pide «Agrega un detalle para el historial», sin advertencia. Los motivos invitan a contexto personal: `SOLICITUD_TITULAR`, `USO_INDEBIDO`, `ORDEN_AUTORIDAD`.

No se puede clasificar fila por fila: es texto libre cifrado y ningún detector daría certeza. **Se trata toda nota como dato personal.**

## 4. Evaluación frente a ADR-094 D7 y el HLD

D7 solo admite dos salidas, y el procedimiento ya resuelve cuál aplica antes de tocar la tabla:

| Situación | Regla | Efecto en la nota | Estado hoy |
| --- | --- | --- | --- |
| Supresión procedente o retención vencida | D7: «se sobrescriben las columnas personales» | Anular | **Incumple.** Es H-2 |
| Supresión improcedente por deber de conservación | D7: el dato sale de las proyecciones, solo con permiso propio y acceso auditado | Bloquear | **Cumple.** 403 sin permiso, con auditoría previa (`subscribers.controller.ts:741-747`) |

Otros encajes:

- **R6 y HLD §6.6:** se conservan «los registros (no sus campos personales)». El evento es el registro y la nota es el campo.
- **HLD §2:** «cada módulo anonimiza sus tablas». La tabla es de CRM, así que no hace falta otro participante.
- **Precedente exacto en el Anexo A.1:** `schedule_reschedule_logs` deja `notes` en `NULL`, conserva `reason` como motivo corto y «el registro append-only se conserva». `execution_order_status_transitions` anula `reason` y conserva el asiento. Además, `contact_attempts.notes`, `commercial_notes` y `manual_override_reason` van a `NULL`. Las notas libres cubiertas por los participantes se anulan siempre.
- **PRD §9.3.2 «append-only lógico»:** dice que los flujos de negocio no actualizan el historial y que solo la rotación reescribe `note_encrypted`. Se enmienda (D-HN-9), porque la misma sección remite a la supresión.

### Opciones

| Opción | Veredicto | Motivo |
| --- | --- | --- |
| **Anular la nota y conservar el evento** | **Recomendada** | Cumple D7 y R6 y sigue el precedente. La columna admite `NULL` y no tiene trigger |
| Conservar cifrada | Descartada | El cifrado es reversible con la clave del tenant y K2 la seguiría recifrando. Contradice PRD Q3 |
| Bloquear tras la supresión | Descartada | En una supresión procedente no hay deber de conservación, y la marca se cierra. Crearía un estado que D7 no tiene |
| Borrar la fila | Descartada | Pierde el evento que sostiene la trazabilidad de la suspensión y del reloj O-1, y rompe R6 |
| Marca cifrada `ANONIMIZADO` | Descartada | Nada exige `NOT NULL`. Dejaría cifrado que recifrar, justo lo que la salida B de K2 evita |
| Anular solo las notas con datos personales | Descartada | No se puede determinar (§3) |

## 5. Decisiones

### D-HN-1. La nota queda en `NULL`

Regla `{ column: 'note_encrypted', kind: 'null' }` para `crm_lifecycle_changes` en `CRM_RULES`. `anonymizeConfiguredTable` ya hace el `UPDATE`, la verificación y el residual. Tolera la ausencia de `updated_at`, que esta tabla no tiene.

### D-HN-2. Alcance

Filas con `subscriber_id = ANY(scope.subscriberIds)` y `note_encrypted IS NOT NULL`, con `selectErasureIds`, que bloquea con `FOR UPDATE`.

- Todas las `entity_type` y todos los `source`. El escritor siempre rellena `subscriber_id`, también en las filas `CONTRACT`, y la columna es `NOT NULL`.
- El filtro por nota hace que `selected` cuente notas y no eventos, y que una segunda pasada dé cero.
- Se apoya en que el adaptador ya bloqueó los `subscribers`: un escritor que llegó antes queda incluido y uno que llega después recibe 409 (HLD §6.6, concurrencia).

### D-HN-3. Dueño y categoría

`CrmTitularErasureParticipant`. Siguen siendo siete participantes. Categoría `COMERCIAL`, ya existente: la lista cerrada de la 149 no cambia.

### D-HN-4. Qué se conserva

| Campo | Trato | Motivo |
| --- | --- | --- |
| `note_encrypted` | `NULL` | Texto libre personal |
| `from_status`, `to_status`, `source`, `contract_scope_explicit`, `changed_at`, `batch_id`, `id`, `tenant_id` | Conservar | Hechos operativos sin identificación |
| `reason_code` | Conservar | Catálogo cerrado. `contracts.status_reason_code` ya se conserva (D-1B-5). Ver ⚠ en §10, punto 5 |
| `subscriber_id`, `entity_id` | Conservar | Apuntan a registros ya anonimizados. La FK lo exige |
| `actor_id` | Conservar | Es el operador, no el titular. Mismo criterio que `changed_by` en el Anexo A.1 |

### D-HN-5. La lectura y el contrato no cambian

`decryptNote(null)` ya devuelve `null` y `note?: string | null` ya lo admite (`lifecycle.schema.ts:152`). Sin cambios en `listHistory`, OpenAPI, `@iwana/shared` ni portal. El historial del titular anonimizado sigue listando sus eventos, sin nota.

Los reintentos no llegan a comparar notas: `lockSubscriber` responde 409 anonimizado (`:583`) antes de `findExistingBatch`.

### D-HN-6. El bloqueo no cambia

Mientras dure el bloqueo, la nota se conserva y sigue con su permiso propio. Al vencer la retención (HLD §10, Fase 2 P3), la anonimización pasa por el mismo participante.

### D-HN-7. Filas ya anonimizadas: sin migración

No hay filas de producción. Las de desarrollo y ensayo se remedian como en D-K2A-5:

1. `anonymize-titular --verify-only` corre `applyScope` en `dry-run`, así que la regla nueva delata las notas previas como residual, sin tocar el verificador.
2. Reejecutar `anonymize-titular --apply` por solicitud las deja en `NULL`.

Una migración sería técnicamente posible, porque la tabla no tiene trigger y no necesita el GUC. Se descarta: sería un borrado irreversible en todos los tenants para cero filas reales, y añadiría dependencia de `runner.ts`.

**Sin verificar:** la reejecución del CLI sobre una solicitud ya resuelta. No hay ninguna guarda de `erased_at` en el CLI, pero nadie lo ha corrido; lo prueba CA-HN-04. Si falla, `[BLOQUEO]` y vuelve a AI-EM-ARCH.

### D-HN-8. Sin trigger nuevo

`insertHistory` (`:706`) es el único escritor. Sus tres llamadas (`:313`, `:627`, `:689`) corren después de `lockSubscriber` (`:257`, `:380`, `:484`), que rechaza al titular anonimizado (`:583`). Un trigger necesitaría además una excepción para la propia supresión, que ampliaría la superficie de H-1. El append-only sigue siendo lógico.

### D-HN-9. Enmiendas documentales

Sin ADR nuevo: esto aplica D7, no lo cambia.

- **PRD §9.3.2:** el append-only admite una segunda excepción: la supresión deja `note_encrypted` en `NULL`.
- **HLD siguiente versión libre:** §6.6 lo declara; §10 registra el cierre. K2 también pide versión de HLD: quien llegue segundo toma la siguiente.
- **Anexo A.1 del runbook:** fila nueva, porque R13 exige paridad de API y CLI.
- **Spec K2 §8:** H-2 enlaza a esta spec.

### D-HN-10. Invariante de cobertura (causa raíz)

H-2 existió porque ninguna prueba cruza el inventario de cifrado con el alcance de la supresión. Se propone una prueba nueva y estática, `apps/api/src/cli/erasure-coverage.invariant.spec.ts`, sin tocar los archivos con diff de `cli/`:

- Declara un mapa de todo `PII_ENCRYPTED_TARGETS` a `participante` o `EXCLUIDO: <motivo>`, y exige igualdad exacta de claves. Un objetivo nuevo sin clasificar la pone en rojo.
- Comprueba que el nombre de la columna aparece en el fuente del participante declarado.
- Exclusiones iniciales: `data_subject_requests.requester_*_encrypted`, por R6, que conserva la solicitud. La evidencia muestra esas tres columnas con valor tras la supresión, y es lo esperado.

**Límite:** solo ve columnas cifradas. No detecta texto libre en claro (§9, H-3 y H-4).

## 6. Límites conocidos

- **Terceros.** Una nota en el historial de otro titular puede mencionar al suprimido. Es indetectable y es el mismo límite de todo texto libre.
- **Copias de seguridad.** Igual que D7: anonimizar no reescribe backups.
- **Trazabilidad.** `anonymized_request_id` enlaza el suscriptor con la solicitud, que conserva al solicitante cifrado (R6). Por eso los eventos conservados son trazables para quien tenga `privacy.read`. Es el diseño vigente, pero afecta a §10, punto 5.

## 7. Criterios de aceptación

| CA | Criterio | Prueba |
| --- | --- | --- |
| CA-HN-01 | Tras suprimir por la API, las notas del titular son `NULL`, con filas `SUBSCRIBER` y `CONTRACT`. El número de eventos y sus demás columnas no cambian. Consulta con `JOIN` a `subscribers` por `anonymized_at`: cero notas | Integración Postgres, `privacy-erasure-api` |
| CA-HN-02 | Las notas de otro titular del mismo tenant siguen descifrando igual | Misma |
| CA-HN-03 | La regla existe en el esquema real de migraciones: una columna renombrada no debe desaparecer en silencio (`planFields` la omite) | Integración sobre migraciones reales, no fixture a mano |
| CA-HN-04 | Nota previa en titular anonimizado: `--verify-only` la reporta; `--apply` la deja en `NULL`; un segundo `--verify-only` da 0, sin avanzar `updated_at` de `subscribers` | Integración `anonymize-titular` |
| CA-HN-05 | Con `CRM_SUBSCRIBERS_MANAGE`, `GET …/lifecycle-changes` de un anonimizado responde 200, con los eventos y `note: null` | HTTP o integración |
| CA-HN-06 | Bloqueado sin permiso: 403 y auditoría. Con permiso: nota legible. El rechazo de la supresión no toca la nota | Integración; las actuales no cambian |
| CA-HN-07 | La vista previa suma las notas a `COMERCIAL` y da cero sin notas. `erasure_categories` no sale de la lista cerrada | Unitaria e integración |
| CA-HN-08 | Reintento con la misma `Idempotency-Key` tras suprimir: 409 `PRIVACY_TITULAR_ANONYMIZED`, ni `IDEMPOTENCY_KEY_REUSED` ni error de descifrado | Integración |
| CA-HN-09 | Un cambio de ciclo de vida que bloqueó antes de la supresión queda sin nota al confirmar; uno que llega después recibe 409 | Integración con dos conexiones |
| CA-HN-10 | Paridad API y CLI (R13): mismo resultado sobre el mismo fixture | Integración |
| CA-HN-11 | D-HN-10 en verde, y en rojo al añadir un objetivo sin clasificar (comprobación de que la prueba muerde) | Unitaria |
| CA-HN-12 | Ninguna aserción existente cambia, salvo conteos de la vista previa con justificación. `test-change-reviewer` lo confirma | Revisión |
| CA-HN-13 | Conteo real sin caché, cero PII en logs y fixtures sintéticos. Nunca `tenant_iwana` | `gate-verifier` |

## 8. Impacto

| Área | Cambio |
| --- | --- |
| `crm-titular-erasure.participant.ts` | Regla, selección de ids y una llamada a `anonymizeConfiguredTable`. Unitaria nueva: la del adaptador usa participantes simulados y no lo probaría |
| Migraciones, `@Module`, `@iwana/shared`, OpenAPI, portal | Ninguno |
| `apps/api/src/cli/` | Solo la prueba nueva de D-HN-10. No toca los cuatro archivos con diff |
| K2 | **Mismo archivo** que su B1: se serializa (plan §1). Con H-2 aplicado, K2 tiene una celda menos por titular con nota |
| MOD14 | Ninguno |

## 9. Hallazgos, sin corregir

| # | Hallazgo | Destino |
| --- | --- | --- |
| H-3 | `operational_responsibility_history.notes` (`varchar(255)`, **en claro**, migración 009) se escribe desde `dto.notes` y ningún participante lo nombra | Barrido propio de cobertura |
| H-4 | `service_provisionings.regularization_reason` (`text`, **en claro**, migración 161, con `subscriber_id NOT NULL`): igual | Barrido propio |
| H-5 | `billing_*`: `note` y `void_note` (migración 173) son texto libre. No se revisó si MOD14 las cubre | MOD14, fuera de esta tarea |
| H-6 | `targets-after-erasure` da `non_null_anon: 0` por construcción en tablas sin `anonymized_at`. Quien lo relea puede concluir lo contrario (§2.2) | Aviso. La evidencia no se reescribe |

H-3 y H-4 salen de buscar nombres de columna en migraciones y participantes, sin corrida. Son posibles residuos, no confirmados.

## 10. Puntos del G0 del CTO

**Aprobados el 2026-11-04, como se recomendaron.** El punto 5 sigue abierto como consulta: bloquea producción, no la construcción.

1. **Tratamiento:** anular la nota y conservar el evento (D-HN-1 y D-HN-4).
2. **Filas previas:** remediación por CLI, sin migración (D-HN-7).
3. **Sin trigger nuevo** (D-HN-8).
4. **Invariante de cobertura** (D-HN-10). Se recomienda; es separable si se prefiere el mínimo.
5. **⚠ Preguntas para el abogado**, que no bloquean la construcción y sí producción. Esta spec no es una conclusión jurídica:
   - ¿Una nota de `ORDEN_AUTORIDAD` o `USO_INDEBIDO` tiene un deber de conservación propio, más allá de los 5 años? D7 no tiene categoría para ello, así que aquí se anula.
   - ¿Basta conservar `reason_code` a nivel de evento, siendo trazable por `anonymized_request_id` (§6)? D7 habla de «agregados sin identificación», y un evento individual no es un agregado. Es la misma cuestión que ya plantean los contratos conservados.
6. **Bloqueante de G7:** registrar H-2 como condición de salida. Sin fecha legal propia (§2.4).
7. **Barrido H-3 y H-4:** abrirlo como tarea propia.
