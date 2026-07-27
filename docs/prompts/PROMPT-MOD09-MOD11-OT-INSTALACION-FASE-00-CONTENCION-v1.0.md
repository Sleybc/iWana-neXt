# PROMPT — MOD09–MOD11 OT de instalacion Fase 00 Contencion

**Version:** 1.0  
**Estado:** Emitido — G4 congelado (2026-07-27)  
**Fecha:** 2026-07-27  
**Modo activo:** Ejecucion  
**Generado por:** AI-EM-ARCH  
**Ejecutor:** AI-SR-FULL  
**Reviews obligatorios:** AI-SEC-ENG y AI-SR-QA  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

## Contratos congelados (G4)

- **Contrato de API congelado.** Tipos: `packages/shared/src/contracts/operations/execution-orders.ts`. OpenAPI: `apps/api/openapi/tasks-execution-orders.v1.json`.
- **Contrato de componente congelado.** Spec: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` v1.1.
- **Nombres congelados (G4).** Permisos (6 canónicos + 1 alias deprecado), estados (9 `ExecutionOrderStatus`), resultados (5), eventos (11 `OperationalEventPayloadV1`), componentes (2). Ver `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §9.
- **Condiciones aceptadas de G3.** Ver informe vivo §9: hallazgos SEC-ENG F01–F08, DATA-ENG P0-1/P0-2/P1-1–P1-4, PLAT-OPS P0-01–P0-03/P1-01–P1-04. Los P0 de SEC-ENG/DATA-ENG/PLAT-OPS deben resolverse en sus fases respectivas; los P1 antes de G6; los P2 son backlog.

---

## 1. Objetivo exacto de la fase

Contener los riesgos P0 del contrato actual: BOLA, permisos insuficientes, mutación terminal, doble cierre y reintentos que puedan duplicar efectos.

**Entra:** autorización por alcance/asignación, precondiciones terminales, control de concurrencia/idempotencia y pruebas focalizadas.  
**No entra:** rediseño visual, plantillas, outbox completo ni retiro del legado.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md`
- `docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md`
- `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` (Aprobado) — no ampliar alcance
- `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`
- `docs/plans/2026-07-27-mod09-mod11-ot-instalacion-redesign.md` — Task 1 y solo el subconjunto de Task 2 indispensable para autorización actual
- `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md`

## 3. Instrucciones

1. Activar `test-driven-development`, `nestjs-expert`, `backend-security-coder`, `testing-patterns` y `openapi-spec-generation`.
2. Localizar el flujo real antes de editar; no asumir paths del plan si el repo cambió.
3. Escribir primero las pruebas QA-01 a QA-07, QA-21 y QA-29 a QA-35.
4. Implementar el cambio mínimo dentro de MOD11 y access-control aprobado.
5. No confiar en `allowedActions` ni en controles del frontend; rechazar mass assignment.
6. Minimizar DTOs y sanear PII/textos libres en audit/logs.
7. Verificar rate limit `429`; coordinar evidencia TLS con AI-PLAT-OPS.
8. Solicitar review read-only de AI-SEC-ENG y AI-SR-QA.
9. Actualizar el informe vivo; no crear un informe paralelo.
10. No ejecutar Task 3 ni QA-42–44 desde este prompt: requieren outbox/audit-intent y pertenecen a Fase 01 bajo ADR-068 aprobado.

## 4. Restricciones no negociables

- Sin acceso a tablas/repositorios de otro modulo.
- Sin hardcodear tenant/schema.
- Sin PII o payloads de evidencia en logs.
- Sin reabrir OT terminal.
- Sin ampliar alcance a UI o modelo de plantillas.
- Sin introducir outbox, audit-intent, tombstones ni lifecycle Media desde esta fase; esos controles se ejecutan en Fase 01–03.

## 5. Entregables

- Pruebas HTTP/servicio negativas y concurrentes.
- Autorización y precondiciones de dominio.
- Contrato OpenAPI actualizado si cambia HTTP.
- Evidencia en checklist e informe vivo.

## 6. Criterios de aceptacion

- CA-00-01: conocer un UUID no concede lectura ni comando.
- CA-00-02: coordinador sin ejecución no registra trabajo.
- CA-00-03: terminal rechaza toda mutación salvo seguimiento futuro.
- CA-00-04: cierre concurrente e idempotencia producen un único efecto.
- CA-00-05: seguridad y QA no reportan P0/P1 de esta fase.

## 7. Stop/go

Detener si este prompt no ha sido emitido en G4 con el contrato de contención congelado, si el control requiere cruzar tablas/modulos, cambiar el patrón de integración aprobado o si la estrategia de idempotencia no puede garantizar un único efecto. Fase 00 permanece estrictamente dentro de MOD11/access-control y ADR-046/047. Escalar a AI-EM-ARCH.

## 8. Salida

Fase aprobada solo con pruebas en verde, OpenAPI coherente, checklist actualizado y reviews firmados.
