# INFORME MOD05 — T11 Sanitizador y auditoría explícita

**Versión:** 1.1 · **Fecha:** 2026-10-12 · **Bloque:** T11 — AI-SR-FULL  
**Estado:** **CERRADO — re-verificación `sec-eng` y `gate-verifier`: GO**  
**Historial:** [informe T11 v1.0](INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.0.md), conserva el registro del bloqueo inicial de ownership.  
**Fuentes:** [plan MOD05 v1.6 vigente — T11 se ejecutó contra el estado histórico v1.5 preservado en el plan](../plans/2026-10-12-mod05-iva-punto-servicio.md), [prompt MOD05 v1.4](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md), [hallazgo S-T7-01](INFORME-MOD05-IVA-PUNTO-SERVICIO-T7-v1.0.md).

## Resultado

T11 cierra la exposición de PII en nuevas escrituras de contratos: el sanitizador cubre los nombres fiscales específicos, y cada endpoint de escritura omite la auditoría automática de la respuesta completa para registrar un evento explícito acotado a IDs, transiciones y nombres de campos modificados. Los eventos no almacenan valores fiscales ni `installationNotes`.

La corrección del tipo `contractsApi.create` queda fuera de T11 por la enmienda v1.4 y pasa al bloque P3 de D-PDF. No se modificaron filas existentes de `audit_logs`.

## Implementación

- `apps/api/src/modules/audit/audit-sanitize.policy.ts`: añadidos los sufijos `fiscal_document` y `fiscal_name`. No se añadieron los sufijos genéricos `document` ni `name`.
- `apps/api/src/modules/audit/audit-sanitize.policy.spec.ts`: pruebas para `fiscalDocument`, `fiscal_document`, `fiscalName` y `fiscal_name` en estructura anidada con arreglo; comprueba que `document` y `name` técnicos se conservan.
- `apps/api/src/modules/crm/contracts/contracts.controller.ts`: `@SkipAudit()` en creación directa y desde expediente, edición, punto de servicio, soporte, activar, suspender, reactivar, terminar, archivar y eliminar.
- `apps/api/src/modules/crm/contracts/contracts.service.ts`: eventos por `AuditService` con IDs, transiciones o nombres de campos de una allowlist; no incluye valores personales ni `installationNotes`.
- `apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts`: `planId` vacío rechazado, alineado con la validación de creación desde expediente.
- Specs de auditoría, controlador, DTO y servicio cubren sanitización, metadatos `SkipAudit`, proyecciones sin PII, transiciones y ramas de creación/edición/soporte.
- `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`: integración HTTP contra PostgreSQL real que crea, activa y modifica `/service-point`, y verifica que las filas nuevas de auditoría no contienen los marcadores de `fiscalName`, `fiscalDocument` ni `installationNotes`.

## Evidencia de verificación

| Gate                                                                           | Resultado real                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec turbo run test --filter=@iwana/api --force`                         | **338 suites aprobadas, 4 omitidas; 4.744 tests aprobados, 15 omitidos.** 4 tareas Turbo ejecutadas, 0 cacheadas.                                                                                                                                                                    |
| Integración PostgreSQL real (`contracts.service.postgres.integration.spec.ts`) | **14/14 tests aprobados**, 0 omitidos. Incluye el recorrido crear → activar → `/service-point` y confirma que ninguna de las tres filas nuevas de auditoría contiene los marcadores fiscales o `installationNotes`. Ejecutada en un schema aislado de prueba, eliminado al terminar. |
| Cobertura de `crm/contracts`, sin integrar la suite PostgreSQL                 | **250/302 branches = 82,78 %**; **530/606 statements = 87,46 %**. Se excluyeron del denominador solo los specs; las fuentes de producción permanecen incluidas.                                                                                                                      |
| `pnpm --filter @iwana/api typecheck`                                           | Exit 0.                                                                                                                                                                                                                                                                              |
| ESLint de `audit-sanitize.policy.ts`, su spec y `crm/contracts/`               | Exit 0, sin diagnósticos.                                                                                                                                                                                                                                                            |
| Prettier de archivos T11 e informe                                             | Exit 0.                                                                                                                                                                                                                                                                              |

No hubo `cache hit` en el gate de Turbo. La suite PostgreSQL se corrió por separado del conteo unitario y no se usó para alcanzar la cobertura de branches.

## Deuda por severidad

| Severidad | Deuda                                                                              | Estado / destino                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crítica   | S-T7-01: valores fiscales en nuevas filas de auditoría por respuestas de escritura | `sec-eng` y `gate-verifier` confirmaron GO. No hay riesgo pendiente en nuevas escrituras; las filas históricas no se alteraron.                          |
| Alta      | Ninguna nueva en T11                                                               | —                                                                                                                                                        |
| Media     | Posibles valores fiscales históricos en `audit_logs`                               | T12 entregó una propuesta de redacción en solo lectura. No se ejecutó; cualquier cambio requiere decisión del CTO y preservar el control de solo-anexar. |
| Baja      | Tipo de `contractsApi.create`                                                      | Retirado de T11; dueño y destino: bloque P3 de D-PDF, conforme al prompt v1.4.                                                                           |

**Deuda técnica nueva introducida por T11:** ninguna identificada.
