# PROMPT — MOD09–MOD11 OT de instalacion Fase 02 Experiencia

**Version:** 1.0  
**Estado:** Emitido — G4 congelado (2026-07-27)  
**Fecha:** 2026-07-27  
**Modo activo:** Ejecucion frontend  
**Generado por:** AI-EM-ARCH  
**Ejecutor:** AI-FE-PLATFORM  
**Owners de contrato:** AI-PROD-UX y AI-DS-OWNER  
**Review:** AI-SR-QA  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

## Contratos congelados (G4)

- **Contrato de componente congelado.** Spec: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` v1.1. Componentes: `OperationalSidePeek` (`@iwana/ui`), `ExecutionOrderSummary` (`apps/portal`).
- **Contrato de API congelado.** Tipos: `packages/shared/src/contracts/operations/execution-orders.ts`. OpenAPI: `apps/api/openapi/tasks-execution-orders.v1.json`. Mocks tipados deben derivarse exclusivamente de estos tipos, nunca de tipos paralelos.
- **Nombres congelados (G4).** Ver informe vivo §9.

---

## 1. Objetivo exacto de la fase

Simplificar Agenda como superficie de supervisión e implementar la OT como espacio separado de ejecución, usando contratos DS congelados.

**Entra:** Tasks 6–7, sin plantillas administrativas avanzadas si Fase 03 no ha cerrado.  
**No entra:** lógica backend improvisada, nuevos tokens, cambios de flujo no aprobados.

## 2. Artefactos de entrada obligatorios

- spec UX de coordinador;
- contrato DS;
- contrato API congelado;
- dirección visual Firma iWana;
- plan y checklist.

## 3. Instrucciones

1. Activar `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns`, `test-driven-development` y `playwright-skill`.
2. Reutilizar componentes existentes y respetar el split RSC/client.
3. Implementar `OperationalSidePeek` en `@iwana/ui` y `ExecutionOrderSummary` en el dominio Operaciones de `apps/portal`, conforme al contrato.
4. Extender `ProgressMeter` con `label` y `ariaLabel` mediante pruebas antes de usarlo para completitud de la instalación.
5. Remover de Agenda formularios de ejecución y selectores genéricos.
6. Cubrir estados de carga, error, permiso, stale, conflict, offline y terminal.
7. Externalizar copy y sustituir enums/UUID por vocabulario funcional.
8. Entregar pruebas component/E2E, teclado, responsive y evidencia visual.
9. Mantener offline como estado informativo/read-only: no crear borradores ni persistir evidencia, firma, dirección, instrucciones o textos libres.
10. Cerrar QA-49 e incluir su evidencia en el informe vivo.

## 4. Restricciones no negociables

- No crear tokens paralelos ni `tailwind.config.js`.
- No duplicar primitivas en `apps/portal`.
- No habilitar acciones por rol local; usar `allowedActions` solo para presentación.
- No mostrar inputs sobre una OT terminal.
- No capturar firma como texto libre.

## 5. Entregables

- Agenda de supervisión compacta.
- Workspace de ejecución con bloques aprobados.
- Componentes en owner correcto.
- Tests, auditoria WCAG y capturas desktop/movil.
- Informe vivo y checklist.

## 6. Criterios de aceptacion

- CA-02-01: coordinador resuelve contexto/excepción sin ejecutar.
- CA-02-02: existe una única acción primaria por estado.
- CA-02-03: terminal es solo lectura.
- CA-02-04: no hay enums crudos ni UUID prominentes.
- CA-02-05: teclado, foco, contraste y responsive pasan G6.

## 7. Stop/go

Detener si el prompt no declara contratos DS/API congelados, si falta un estado requerido o si la solución exige duplicar componentes/tokens.

## 8. Salida

Aceptación conjunta AI-PROD-UX + AI-DS-OWNER + AI-SR-QA, pruebas verdes y sin deuda P0/P1.
