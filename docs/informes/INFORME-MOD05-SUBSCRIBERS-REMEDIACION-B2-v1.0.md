# INFORME — MOD05/MOD08 Suscriptores · Remediación B2

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Estado:** Bloqueado antes de implementación por conflicto entre el contrato congelado C-API-2 y el alcance de consumo B3.  
**Bloque:** B2 — Superficie PII del suscriptor (`sr-backend`)  
**Plan:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md)  
**Prompt:** [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md)

## Resultado

**[BLOQUEO]** No se implementaron cambios de código ni se modificaron C-API-1 o C-API-2.

C-API-2 limita `SubscriberListItem` a campos no personales y a los campos incluidos en `SUBSCRIBER_LIST_FIELD_PURPOSE`. La lista de finalidad del informe de auditoría no incluye `firstName`, `lastName`, `businessName` ni `commercialName`. ADR-067 §2 establece que un campo personal sin finalidad declarada no se expone en el listado. A la vez, el consumidor de B3 usa esos campos como etiqueta principal del selector de suscriptores; retirarlos requiere cambiar el contenido visible, fuera del alcance B3.

No es posible resolver la incompatibilidad clasificando esos nombres como no personales ni ampliando el contrato sin ratificación. Se requiere una decisión de AI-EM-ARCH sobre la finalidad/campos autorizados o sobre el ajuste de alcance/contrato.

## Entregables y estado

| Entregable B2 | Estado |
| --- | --- |
| `POST /crm/subscribers/search` según C-API-1 y retiro semántico del GET | Pendiente por bloqueo; no implementado |
| `SubscriberListItem` y proyección por finalidad/rol según C-API-2 | Pendiente por bloqueo; no implementado |
| `RECORD_ACCESS` y `LIST_ACCESS` awaited | Pendiente; no implementado |
| Auditoría de `update` sin valores personales | Pendiente; no implementado |
| Cita de ADR-067 en `.github/instructions` | Pendiente; no implementado |
| Tests HTTP y actualización OpenAPI aplicable | Pendientes; no añadidos |

## Evidencia

- El prompt congelado, §2 C-API-2, define `SubscriberListItem` como campos no personales más los de finalidad y excluye campos enumerados expresamente. El prompt §3 B2 exige mantener los contratos congelados.
- [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md](INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md), §6.3, declara finalidad para `documentNumber`, `phone`, `altContactPhone`, `whatsapp`, `email`, `address`, `neighborhood`, `city`, `latitude` y `longitude`; no declara finalidad para nombres ni razón social.
- [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md), §2, indica que no se expone un campo personal sin finalidad declarada.
- [TaskCoreFields.tsx](../../apps/portal/src/components/operations/TaskCoreFields.tsx) usa razón social y nombres como etiqueta principal en `formatSubscriberOption`; B3 reportó que retirarlos requiere cambiar el contenido visible, fuera de su alcance.

## Pruebas

No se ejecutó `pnpm --filter @iwana/api test -- --force` porque el bloqueo impide implementar el contrato de proyección sin contravenir las restricciones de alcance. Conteo de esta ejecución: **0 suites y 0 tests ejecutados**. El conteo real de la suite API queda pendiente; no se reporta como evidencia de verde.

## Deuda nueva por severidad

No se introdujo deuda técnica nueva: no hubo cambios de código ni de contrato.

| Severidad | Deuda nueva |
| --- | --- |
| Crítica | Ninguna |
| Alta | Ninguna |
| Media | Ninguna |
| Baja | Ninguna |

El conflicto contractual descrito en `[BLOQUEO]` es una condición previa de gobernanza que impide cerrar B2, no una deuda creada por esta ejecución.
