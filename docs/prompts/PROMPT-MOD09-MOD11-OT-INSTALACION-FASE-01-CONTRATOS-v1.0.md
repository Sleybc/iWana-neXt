# PROMPT — MOD09–MOD11 OT de instalacion Fase 01 Contratos

**Version:** 1.0  
**Estado:** Emitido — G4 congelado (2026-07-27)  
**Fecha:** 2026-07-27  
**Modo activo:** Ejecucion contract-first  
**Generado por:** AI-EM-ARCH  
**Ejecutores:** AI-SR-FULL y AI-DATA-ENG on-demand  
**Reviews:** AI-SEC-ENG, AI-SR-QA, AI-EM-ARCH por boundary  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

## Contratos congelados (G4)

- **Contrato de API congelado.** Tipos: `packages/shared/src/contracts/operations/execution-orders.ts`. OpenAPI: `apps/api/openapi/tasks-execution-orders.v1.json`.
- **Contrato de componente congelado.** Spec: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` v1.1.
- **Nombres congelados (G4).** Permisos, estados, resultados, eventos y componentes congelados. Ver informe vivo §9.
- **Condiciones aceptadas de G3.** Ver informe vivo §9.

---

## 1. Objetivo exacto de la fase

Implementar permisos por capacidad, contrato HTTP versionado, outbox tenant-aware, estados convergentes y reconciliación, manteniendo MOD09/MOD11/MOD12 separados.

**Entra:** Tasks 2–4 del plan.  
**No entra:** UI final, plantilla administrativa, firma legal ni retiro del legado.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- ADR-068 aprobado por el CTO el 2026-07-27
- `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md` congelado
- PRD/HLD MOD09 y MOD11
- plan y checklist de esta feature

## 3. Instrucciones

1. Activar `nestjs-expert`, `database-migration`, `postgresql`, `bullmq-specialist`, `openapi-spec-generation`, `test-driven-development` y `testing-patterns`.
2. Verificar que Task 0/G3 ya publicó tipos request/response/error en `@iwana/shared` y OpenAPI verificable.
3. Verificar que este prompt fue emitido en G4 con la declaración literal “contrato de API congelado”; detenerse si falta.
4. Consumir el contrato congelado sin crear tipos paralelos.
5. Implementar permisos `read`, `execute`, `supervise`, `templates.read`, `templates.manage` y `execution_events.redrive`, migración de `MOD00_ACCESS_V1` y alias legado medible.
6. Implementar outbox en la transaccion owner, relay con lease, inbox, consumidores idempotentes y tenant explícito en jobs.
7. Vincular atómicamente registro idempotente, mutación, outbox y audit-intent; propagar `intentId`, aplicar horizonte de retención y fallar cerrado si audit-intent no persiste.
8. Aplicar la matriz de convergencia y reconciliador.
9. Probar duplicados, expiración, orden, crash-window commit/enqueue/mark, fallo audit-intent/entrega, retry, DLQ/re-drive autorizado, dos tenants, migración y rollback.
10. Pedir review cruzado antes de integrar carriles.

## 4. Restricciones no negociables

- No compartir `EntityManager` entre bounded contexts.
- No importar repositorios/entidades privadas de otro modulo.
- No añadir broker ni tecnología fuera del baseline.
- No tratar `SCHEDULED` como trabajo ejecutado.
- No desplegar migración irreversible.

## 5. Entregables

- Permisos/seeds/migraciones aprobados.
- OpenAPI y contratos compartidos.
- Outbox, consumidores, reconciliador y métricas.
- Pruebas unitarias/integración/worker/multi-tenant.
- Informe vivo y checklist actualizados.

## 6. Criterios de aceptacion

- CA-01-01: evento y cambio owner se confirman atomically.
- CA-01-02: duplicado/fuera de orden no repite ni revierte efectos.
- CA-01-03: cada job aplica tenant correcto con `SET LOCAL`.
- CA-01-04: no existe acceso directo cruzado.
- CA-01-05: reconciliador detecta discrepancias observables.
- CA-01-06: QA-42 a QA-44 demuestran atomicidad, tombstone/HMAC y auditoría durable.

## 7. Stop/go

Detener ante boundary violation, pérdida de aislamiento, migración no reversible, contrato no congelado o evento con PII innecesaria.

## 8. Salida

G1/G2 vigentes, pruebas y migraciones verdes, review de arquitectura/seguridad/QA y evidencia archivada.
