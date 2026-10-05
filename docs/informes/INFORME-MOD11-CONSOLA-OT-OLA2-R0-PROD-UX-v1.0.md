# Informe R0 — MOD11 consola de OT · bloqueo de contrato

**Versión:** 1.0  
**Fecha:** 2026-10-05  
**Agente:** AI-PROD-UX (`prod-ux`)  
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md`  
**Estado:** **BLOQUEADO — G2 NO-GO**  
**Decisión de alcance:** no se redacta la UX spec hasta resolver el bloqueo descrito abajo.

## Trazabilidad revisada

- `AGENTS.md` y `.github/copilot-instructions.md`.
- `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 y el encargo R0 v1.0.
- `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1, en especial §4.1–§4.6.
- `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0, §4.2 y §4.4; `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.1, §3.5–§3.6.
- Contratos consumidos sin modificación: `execution-orders.ts` v1.4 (historial del docstring), `execution-orders-completion.ts` v1 y contrato de tablas operativas v1.1.
- Skills leídas como documentación: `brainstorming`, `system-vocabulary-review`, `ui-ux-pro-max`; apoyo consultado: `iwana-identity-ui-review` y `wcag-audit-patterns`.

## [BLOQUEO] Motivo y resolución de una orden bloqueada

La UX aprobada para el momento **Bloqueada** requiere mostrar «motivo del bloqueo y su resolución» (`docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md`, §4.2). El contrato congelado de detalle `ExecutionOrderDetail` en `packages/shared/src/contracts/operations/execution-orders.ts` publica `status`, `completion`, `allowedActions` y los demás datos de resumen, pero no expone motivo, nota, resolución ni una referencia a ellos. `BlockExecutionOrderCommand.reasonCode` y `UnblockExecutionOrderCommand.resolutionCode` son entradas de comandos; el evento `ExecutionOrderBlockedV1` también tiene `reasonCode`, pero no es una proyección de lectura del detalle que pueda consumir la consola.

El detalle actual solo puede presentar un aviso genérico. Redactar la matriz momento × rol con el contenido exigido para una OT bloqueada implicaría inventar el motivo, añadir una consulta fuera del contrato congelado o rebajar el requisito de la spec base. Las tres opciones incumplen el encargo y la instrucción de detenerse cuando falten datos.

**Para desbloquear R0, AI-EM-ARCH debe señalar una fuente de lectura aprobada que publique el motivo y la resolución vigentes, con ruta y versión, o autorizar el proceso de versionado del contrato que las exponga.** Este informe no modifica contratos ni propone un campo como si ya existiera.

## Verificación de datos disponibles

Los contratos sí contienen los datos necesarios para mapear los cinco requisitos de `INSTALACION_ESTANDAR` v2: `template.requirements[]` incluye `key`, `kind`, configuración de actividad/evidencia y categoría/disposición del material; `completion.requirements[]` aporta estado y razón; `allowedActions` limita las acciones visibles. La ventana de detalle/listado puede ser nula, y el listado incluye `createdAt`, por lo que E4 podría definirse sin añadir campos. Estos hallazgos no resuelven el dato que falta para el estado bloqueado.

## Cierre §7 del encargo

**NO-GO.** El criterio «la matriz momento × rol no deja ninguna celda sin definir» no se puede satisfacer para el momento **Bloqueada** con los contratos y fuentes de lectura disponibles. Los demás criterios de §7 quedan sin adjudicar; no se declara GO parcial ni se supone una fuente de datos.

| Entregable | Estado |
| --- | --- |
| `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` | No creado: depende de resolver el bloqueo antes de diseñar la celda bloqueada. |
| Este informe R0 | Entregado como registro del bloqueo. |

**Pruebas:** no aplica; no se implementó ni modificó código.  
**Cambios de contrato:** ninguno.  
**Siguiente paso:** resolver el bloqueo de lectura y relanzar R0 con la fuente aprobada.
