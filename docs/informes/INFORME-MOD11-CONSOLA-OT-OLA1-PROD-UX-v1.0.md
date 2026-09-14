# Informe — MOD11 Consola de OT · Ola 1 · Copy por rol y estado (C3, track prod-ux)

**Versión:** 1.0
**Fecha:** 2026-09-14
**Autor:** AI-PROD-UX (subagente prod-ux)
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` — SOLO §3 pasos 1 a 4 (diagnóstico A3 + regla de copy + tabla). Los pasos 5 a 9 son de fe-platform en Ola B y no se ejecutan aquí.
**Estado:** handoff de copy para C3 (fe-platform). Cero código tocado.
**Punto 7 CRM/MOD05:** fuera de alcance por decisión del CTO (spec v1.1 §5). Este informe no propone nada sobre expedientes.

## Trazabilidad

- Spec: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 — §2.1 A3 + §4.4.
- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1 — fase C3.
- Prompt de ejecución: `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` v1.0 §3 (pasos 1 a 4).
- Skills aplicadas (lectura previa a la redacción): `system-vocabulary-review` (obligatoria), `ui-ux-pro-max` (obligatoria, subordinada: solo sus reglas de claridad de error y estado — causa más corrección, ruta de recuperación, no solo color —, ninguna decisión visual ni token), `wcag-audit-patterns` (apoyo: cada aviso queda en texto legible por lector de pantalla, no solo color).
- Skills descartadas con motivo: `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` — cero implementación de UI en este encargo; los pasos 5 a 9 del prompt pertenecen a fe-platform.

## DoR — verificación antes de arrancar (superada, sin [BLOQUEO])

El diagnóstico cuadra con el código abierto y comprobado:

1. La alerta se pinta porque `canStart` es falso en órdenes ya iniciadas, no por falta de permiso: la condición de render es `canInteract && !terminal && !canStart && status !== BLOCKED` (`apps/portal/src/components/operations/ExecutionOrderDrawer.tsx:911-914`), y en `IN_PROGRESS` `computeAllowedActions` emite `REGISTER_ACTIVITY`, `REGISTER_ITEM_USAGE`, `REGISTER_EVIDENCE`, `BLOCK` y `CLOSE`, nunca inicio (`apps/api/src/modules/tasks/services/execution-orders.service.ts:2061-2068`). La condición confunde "no puedes iniciar" con "no necesitas iniciar".
2. `start()` no valida el estado de sincronización en ningún punto de su cuerpo (`execution-orders.service.ts:846-904`: valida esquema, versión y mutabilidad; ninguna lectura de sincronización). Además, con la orden fuera de sincronía `canInteract` es falso (`ExecutionOrderDrawer.tsx:372-373`) y la alerta ni se renderiza: el mensaje actual describe un caso que nunca puede verse.
3. El supervisor nunca recibe inicio por diseño: la rama es `(isAssigned && !isSupervisor) || isUnassignedPool` (`execution-orders.service.ts:2053`); la superficie de supervisión es asignar en orden recién creada, reasignar o crear seguimiento en pre-inicio con responsable, y crear seguimiento en progreso, bloqueada y terminal (`:2077-2091`, terminal en `:2045-2050`).

## Diagnóstico A3 (pasos 1 y 2 del prompt)

- La alerta de `ExecutionOrderDrawer.tsx:911-924` aparece sobre órdenes ya iniciadas porque `canStart` siempre es falso en `IN_PROGRESS`.
- El copy actual miente en dos puntos verificados: invoca la sincronización (que `start()` no valida y que, cuando falla, impide que la alerta se renderice) y habla de permiso de técnico a supervisores (que por diseño jamás reciben inicio).

## Regla de copy aplicada (paso 3, spec §4.4)

La pantalla enuncia lo que el usuario sí puede hacer. Una negación solo aparece cuando hay una acción concreta que el usuario esperaría y no tiene, y entonces nombra quién sí la ejecuta. Cada aviso se entrega como título más descripción en texto (no solo color) para lector de pantalla.

## Tabla de copy rol por estado (paso 4) — 12 celdas cerradas, sin ambigüedad

Convenciones: español, sentence case, sin enums crudos en el texto visible. "Sin alerta" significa que fe-platform no renderiza ningún aviso en esa combinación (CA-03). La columna "Formato" indica aviso o ausencia de aviso; no define estilo visual.

| Rol | Estado | Formato | Título | Descripción |
| --- | --- | --- | --- | --- |
| Técnico asignado | Pre-inicio (orden lista para empezar) | Sin alerta; botón de inicio más texto de ayuda | — | Esta orden está asignada a ti. Cuando llegues al sitio, inicia la ejecución. |
| Técnico asignado | En progreso | Sin alerta | — | La ejecución está en curso. Registra avances, evidencias y consumos desde la lista de requisitos. |
| Técnico asignado | Bloqueada | Aviso informativo | Orden bloqueada | Revisa el motivo del bloqueo. Cuando se resuelva, retoma la ejecución desde esta pantalla. |
| Técnico asignado | Terminal (orden cerrada) | Sin alerta; solo lectura | — | La orden está cerrada. Puedes consultar el resumen, los requisitos y el historial. |
| Técnico o contratista sin asignación (orden sin responsable) | Pre-inicio (orden lista para empezar) | Sin alerta; botón de inicio más texto de ayuda | — | Esta orden no tiene responsable. Si está disponible para tomar, puedes tomarla e iniciar la ejecución. |
| Técnico o contratista sin asignación (orden sin responsable) | En progreso | Sin alerta | — | La ejecución está en curso. Puedes registrar avances desde la lista de requisitos. |
| Técnico o contratista sin asignación (orden sin responsable) | Bloqueada | Aviso informativo | Orden bloqueada | La orden está bloqueada. Revisa el motivo; cuando se resuelva, puedes retomar la ejecución. |
| Técnico o contratista sin asignación (orden sin responsable) | Terminal (orden cerrada) | Sin alerta; solo lectura | — | La orden está cerrada. Puedes consultar el resumen y el historial. |
| Supervisión (administración, monitoreo operativo o soporte inicial) | Pre-inicio (orden lista para empezar) | Sin alerta; acciones de supervisión | — | Supervisa esta orden desde aquí: asigna o reasigna al responsable y crea órdenes de seguimiento cuando haga falta. El inicio lo registra el técnico en campo. |
| Supervisión (administración, monitoreo operativo o soporte inicial) | En progreso | Sin alerta | — | La ejecución está en curso. Puedes seguir el avance en la lista de requisitos y crear una orden de seguimiento si hace falta. |
| Supervisión (administración, monitoreo operativo o soporte inicial) | Bloqueada | Aviso informativo | Orden bloqueada | La orden está bloqueada. Revisa el motivo con el equipo en campo y crea una orden de seguimiento si hace falta. |
| Supervisión (administración, monitoreo operativo o soporte inicial) | Terminal (orden cerrada) | Sin alerta; solo lectura | — | La orden está cerrada. Puedes consultar el resultado y crear una orden de seguimiento si hace falta. |

## Confirmación de cobertura 12/12

- Filas de rol: 3 (técnico asignado; técnico o contratista sin asignación; supervisión).
- Columnas de estado: 4 (pre-inicio, en progreso, bloqueada, terminal).
- Celdas redactadas: 12 de 12. Cobertura 12/12. Ninguna celda quedó pendiente o ambigua.

## Nota explícita sobre sincronización

Ninguna de las 12 celdas afirma ni sugiere que la sincronización condicione el inicio. La palabra sincronización no aparece en ningún título ni descripción de la tabla, conforme al paso 2 del prompt (`start()` no la valida y fuera de sincronía la alerta ni se renderiza).

## Nota de accesibilidad (apoyo `wcag-audit-patterns`, `ui-ux-pro-max` subordinada)

Cada aviso de la tabla se comunica con título y descripción en texto, anunciable por lector de pantalla (región viva o alerta), y nunca solo con color o icono. Cada texto de error o estado indica causa y siguiente paso. No se define ningún token, color ni componente: eso pertenece a ds-owner y fe-platform.

## Supuestos registrados

1. Fe-platform acota la condición de la alerta a pre-inicio y la deriva de las acciones permitidas que calcula el backend; el portal no decide permisos en el cliente.
2. El botón "Iniciar ejecución" se conserva donde ya existe; el copy de pre-inicio lo acompaña como ayuda, no lo sustituye.
3. La celda de pool en pre-inicio usa forma condicional ("si está disponible para tomar") porque la orden recién creada aún no ofrece toma al pool; así la celda no afirma de más.
4. El copy de bloqueada presupone que el motivo del bloqueo es visible en su propia sección; esta tabla no redacta ese motivo.
5. "Orden cerrada" cubre todos los estados terminales sin nombrarlos en el texto visible.

## Marcadores del protocolo §6.3

- `[BLOQUEO]`: ninguno (DoR superado contra código).
- `[CONSULTA]`: ninguna emitida. Se deja constatado: este encargo de copy no necesita ningún primitive del design system; si en implementación surgiera uno inexistente, fe-platform emitirá `[CONSULTA]` a AI-DS-OWNER, no se inventará localmente.
- `[DESEMPATE]`: ninguno.

## Handoff a fe-platform (C3 implementación)

Copy final por rol y estado entregado en la tabla de arriba, sin ambigüedad. Condición a implementar (referencia, no código): alerta solo en pre-inicio; en progreso, bloqueada y terminal la alerta de inicio no se renderiza para ningún rol (CA-03); supervisión nunca ve copy dirigido a técnicos (CA-04).
