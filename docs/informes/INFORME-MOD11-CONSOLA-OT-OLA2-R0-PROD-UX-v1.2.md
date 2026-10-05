# Informe — MOD11 consola de OT · Ola 2 · R0 + UX de E4

**Versión:** 1.2  
**Fecha:** 2026-10-05  
**Agente:** AI-PROD-UX (`prod-ux`)  
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md`, adenda A2  
**Estado:** **R0 entregado · GO para la mitad R0 de G2; G2 global parcial hasta R1**  
**Relación:** supera el informe R0 v1.1; conserva los informes v1.0 y v1.1 como historial.

## Trazabilidad

- Gobernanza: `AGENTS.md`, `.github/copilot-instructions.md` y `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` §§3bis y 6.
- Perfil aplicado: `docs/roles/Perfil_IA_Product_Designer_UX_v1.md`.
- Plan vigente: [MOD11 consola OT, remediación v1.2](../plans/2026-09-14-mod11-consola-ot-remediacion.md).
- Encargo y decisiones: [R0 + UX de E4](../prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md), adendas A1 y A2.
- Spec corregida: [UX spec R0 v1.1](../specs/2026-10-05-mod11-consola-ot-requisito-ux.md), estado «Borrador para G2».
- Contratos consumidos sin modificación: `execution-orders.ts` v1.4 según su historial, `execution-orders-completion.ts` v1 y contrato de tablas operativas v1.1.
- Fuentes funcionales y visuales consultadas: PRD/HLD de MOD11, spec base de consola v1.2, origen OT §3.5 y CA-12, acta de instalación §4.2, spec Firma iWana, prototipo de expedientes y primitives/tokens existentes.
- Skills leídas: `system-vocabulary-review`, `ui-ux-pro-max`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `docs-architect` y `verification-before-completion`. `brainstorming` se consume como ejecutada en la sesión de origen, según el encargo.

## 1. Resultado

Se aplicaron las cuatro correcciones de A2 a la UX spec y se subió a v1.1 con changelog. La spec ya no promete borrador offline; conserva el copy vigente y bloquea escrituras sin conexión. E4 usa el orden de servidor `planned_window_start_at DESC NULLS FIRST, id DESC`; la propuesta de tres tramos queda diferida. El requisito opcional conserva su etiqueta de snapshot y muestra «Sin registrar». La firma distingue el trazo exceptuado de los controles e instrucciones que sí deben ser accesibles por teclado.

## 2. Entregables

| Artefacto | Resultado |
| --- | --- |
| `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` | v1.1; las secciones aprobadas permanecen vigentes salvo las correcciones A2 descritas en su changelog. |
| Este informe | v1.2; supera el informe de fase v1.1 sin modificar los informes anteriores. |

## 3. Verificación de las fuentes de A2 y Definition of Ready

| Decisión/fuente | Evidencia verificada | Resultado |
| --- | --- | --- |
| Offline | `apps/portal/src/components/operations/use-execution-order-console.ts:122` solo detecta `navigator.onLine`; `ExecutionOrderDrawer.tsx:888-890` publica el copy vigente. La búsqueda en `apps/portal/src/components/operations/` no encontró persistencia de borradores de OT; las coincidencias de «borrador» corresponden al filtro local de la bandeja de tareas. | Sin persistencia local contratada. La spec bloquea escrituras y no promete guardar o recuperar borradores. |
| Orden y nulabilidad | `ExecutionOrderListItem` publica `schedule.window: ... | null`, `id`, `status` y `createdAt` en `packages/shared/src/contracts/operations/execution-orders-list.ts`. `ExecutionOrdersService.list()` ya ordena por ventana descendente e id descendente (`apps/api/src/modules/tasks/services/execution-orders.service.ts:601-628`); la migración 130 creó `idx_execution_orders_tenant_window_start` con esos campos. | Los datos contratados bastan; el orden E4 queda alineado con servidor e índice existentes. No se requiere un campo ni DDL nuevos para R0. |
| Orden aprobado predecesor | `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` §4.7.1 establece `planned_window_start_at DESC, id DESC`. | A2 conserva el sentido de orden aprobado y explicita `NULLS FIRST`, que es el orden de PostgreSQL para `DESC`. |
| Render de tabla | `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.1 §7.2 fija raya para valor nulo y deja `sortableFields` vacío. | No se altera v1.1. La diferencia con «Por programar» queda asignada a R1. |
| Etiqueta de snapshot | `packages/database/src/migrations/tenant/131_publish_instalacion_estandar_v2.ts` publica literalmente «Registro de la actividad en bitácora (NO requerido)» para `installation-activity`. | La interfaz no reescribe la etiqueta; el estado opcional sin registro es «Sin registrar». El «NO» en mayúscula queda como deuda de copy de una futura v3 de plantilla. |
| Firma | `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` §4.2 / ADR-088 §D4 fija el propósito de la evidencia; `execution-orders.service.ts:1517-1520` exige `method = SIGNATURE`. WCAG 2.1.1 exceptúa entradas dependientes de la trayectoria, como el dibujo libre ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/keyboard)). | La excepción aplica al trazo. Instrucciones y controles conservan acceso por teclado, foco gestionado y anuncios; no se acepta nombre escrito como evidencia `SIGNATURE`. |

## 4. Cobertura contra §7 del encargo

| Criterio | Evidencia | Estado |
| --- | --- | --- |
| Cinco requisitos v2 tienen estado, razón y acción o ausencia de acción, con copy. | Spec §§3 y 5; razón/acción originadas en el snapshot y `completion.requirements`. | Cumple |
| Matriz momento × rol completa; pre-inicio sin captura. | Spec §4: cuatro momentos por tres perfiles de visualización; no se monta captura ni consulta de custodia en pre-inicio. | Cumple |
| Custodia solo dentro del acto de consumo. | Spec §6. | Cumple |
| OT sin ventana tiene presentación y orden definidos para bandeja y detalle. | Spec §7 define estados para no terminal/terminal y orden server-owned; la compatibilidad del render visual queda en el handoff de R1. | Cumple en R0 |
| Arrastre de archivos decidido. | Spec §5: selector de archivo, sin promesa de arrastre. | Cumple |
| OT viva bajo snapshot v1 declarada. | Spec §8: se conserva el snapshot de tres requisitos; no se incorporan requisitos v2 retroactivamente. | Cumple |

## 5. Correcciones A2 aplicadas

1. **Offline sin borrador:** §§5 y 9 conservan «Sin conexión; vuelve a intentar cuando recuperes la red.», bloquean escrituras y no presentan persistencia local. Se retiró de §11.2 la antigua necesidad de verificar borrador local.
2. **Orden de E4:** §7.2 fija `planned_window_start_at DESC NULLS FIRST, id DESC`. El orden de tres tramos pasa a mejora diferida, sujeta a dictamen de DATA-ENG sobre índice/paginación y enmienda a la spec de subrutas del 2026-09-13.
3. **Snapshot opcional:** §3 conserva la etiqueta exacta «Registro de la actividad en bitácora (NO requerido)»; §§3 y 5 usan «Sin registrar». La mayúscula «NO» queda identificada como deuda de la plantilla, sin reescribir el snapshot.
4. **Firma accesible:** §§3.1 y 9 exceptúan solo el trazo libre dependiente de trayectoria por WCAG 2.1.1. Las instrucciones y «Limpiar», «Guardar firma» y «Cancelar» requieren acceso por teclado, foco gestionado y anuncios para lector de pantalla. No se especifica nombre escrito como evidencia `SIGNATURE` ni se elige librería.

## 6. Necesidades finales para R1 — AI-DS-OWNER

El handoff está enumerado en la spec §11.1. R1 debe cerrar:

1. El contrato de `RequirementChecklist` y `RequirementActionSheet` para estado, razón, acción contextual, requisito opcional y estado desconocido, sin inferir permisos.
2. Los estados textuales «Cumplido», «Pendiente», «Sin registrar» y «Estado no disponible», sin depender solo del color.
3. La incompatibilidad entre la raya para ventana nula del contrato de tablas v1.1 y «Por programar» para órdenes no terminales (más «Sin ventana planificada» para terminales): justificar el uso semántico dentro de v1.1 o tramitar formalmente la v1.2. El contrato no se modifica en R0.
4. La composición del historial bajo cada requisito y la superficie temporal de captura. Para firma, incluir instrucciones accesibles y los tres controles de teclado, con foco gestionado y anuncios; tratar únicamente el trazo como excepción por WCAG 2.1.1.
5. Los estados de carga, error y offline mediante primitives existentes; offline bloquea escrituras y no contiene un borrador persistido.

## 7. Entradas para G3 — AI-FE-PLATFORM

La lista ejecutable está en spec §11.2: comprobar el envío de la captura como `SIGNATURE` por el endpoint existente, MIME/tamaño/expiry; identificar biblioteca aprobada o tramitar dependencia antes de instalar una nueva; validar teclado/foco/anuncios en controles; consultar custodia solo al abrir el acto MATERIAL; aplicar refetch selectivo; mantener el orden de servidor estable con paginación; consumir la decisión R1 para ventana nula; y conservar `close()` con la evidencia referenciada. No queda una consulta de R0 sobre alternativa equivalente de firma: el usuario que no puede usar puntero conserva una deuda de producto en v1.

## 8. Alcance y marcadores

- Cambios solo en la UX spec de ownership R0 y en este informe nuevo. No se tocaron los informes v1.0/v1.1, código, contratos, plan, prompt, tokens ni componentes.
- No se ejecutaron pruebas: el trabajo es documental.
- Deuda registrada: etiqueta de plantilla con «NO» en mayúsculas, sin corregir hasta una futura versión de plantilla; falta de alternativa de firma para quien no usa puntero (cualquier alternativa de aceptación electrónica requiere verificación con fuente oficial, incluida Ley 527 de 1999, fuera de alcance); propuesta de orden en tres tramos diferida.
- No queda `[BLOQUEO]` ni `[CONSULTA]` de R0 abierta. El cierre global de G2 espera la salida de R1.

## 9. Decisión de salida

**GO para la mitad R0 de G2.** Los seis criterios de §7 continúan cumplidos y no falta un campo de los contratos congelados para la definición UX. La spec v1.1 entrega a R1 la compatibilidad entre «Por programar» y la raya de tabla; hasta que R1 cierre ese punto, G2 global permanece parcial.
