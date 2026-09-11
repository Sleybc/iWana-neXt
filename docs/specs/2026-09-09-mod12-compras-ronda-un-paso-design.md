# SPEC — MOD12 Compras · Ronda de cotización en un paso — Fase 28

**Versión:** 1.0
**Estado:** Diseño aprobado para ejecución
**Fecha:** 2026-09-09
**Autor:** AI-PROD-UX (Track T1 del plan de orquestación)
**Plan:** [`2026-09-09-mod12-compras-ronda-un-paso-fase-28.md`](../plans/2026-09-09-mod12-compras-ronda-un-paso-fase-28.md)
**Prompt:** [`PROMPT-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md`](../prompts/PROMPT-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md)
**ADR rector:** [`ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md`](../adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md) — Aprobado (CTO, 2026-07-11)
**Modo:** Product Architect + UX (qué/flujo; sin diseño detallado de componente ni código)

## 1. Problema

Superficie: portal tenant → `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Decidir → Cotizar → Ronda de cotización.

El acordeón promete «Invita proveedores y registra respuestas de la ronda» y al expandirlo no hay ningún proveedor a la vista. Causas verificadas en código (ver plan §3):

- **G1** — `RfqInvitationsPanel.tsx:168` (`canStartRfq`) + picker dentro de `{rfq ? …}` en `:509`. En `DRAFT` sin ronda el formulario solo ofrece moneda, fecha límite y notas; el selector aparece después de crear la ronda.
- **G2** — `PurchaseRequestWorkbenchDrawer.tsx:606` (`showRondaSection`). En `PENDING_QUOTES` sin ronda la sección no se renderiza; cero rutas para invitar. El backend sí lo permite (`rfq.service.ts:68` no valida `request.status`; `:238` contempla `PENDING_QUOTES`).
- **Agravante** — `getCotizarPrimarySection` (`purchase-workbench.ts:126-135`) devuelve el bloque manual como primario en `DRAFT`, de modo que la ronda nace colapsada y el camino visible por defecto es cotizar sin ronda.

Nada fue borrado: `SupplierMultiPicker` existe y el backend está completo desde la Fase 04. El defecto es de alcanzabilidad, no de capacidad.

## 2. Decisión de flujo: un solo acto «Crear e invitar»

El proveedor es el objeto de la tarea y va **primero** en el formulario, por encima de moneda, fecha límite y notas internas.

Orden del formulario de apertura (sin ronda):

1. Selector de proveedores (`SupplierMultiPicker`, reutilizado tal cual).
2. Moneda.
3. Fecha límite.
4. Notas internas.
5. Botón primario «Crear e invitar» + hint.

Al pulsar «Crear e invitar» el sistema encadena `createRfq` → `inviteSuppliers` con los `partyRefIds` seleccionados dentro de un solo `runAction`. El operador percibe **un acto**: la ronda queda abierta y las N invitaciones en estado *Invitado*, con «Enviar solicitud» habilitado.

La misma instancia del selector sigue sirviendo al bloque de ronda existente para invitar proveedores adicionales («Invitar seleccionados»). Se reutiliza el estado `selectedSuppliers` existente, sin duplicarlo.

### Fallo parcial (tratamiento obligatorio)

`createRfq` no es idempotente: una segunda ronda activa es rechazada (`rfq.service.ts:80-89`). Si `createRfq` tiene éxito e `inviteSuppliers` falla:

- No limpiar `selectedSuppliers`.
- Ejecutar `onRefresh()` para caer al modo «ronda existente» con el selector poblado y «Invitar seleccionados» disponible.
- Emitir el error de fallo parcial del §5 (la ronda quedó creada, solo falta invitar).

Un reintento ciego de «Crear e invitar» produciría un 400 opaco; este tratamiento lo evita.

## 3. Matriz primaria actualizada (desviación declarada frente a Fase 24 D3)

La spec de Fase 24 §D3 congeló la matriz dominante en `2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md:79-84`:

1. `hasActiveRfq` → invitaciones.
2. Si no, `quotes.length > 0` → comparación.
3. Si no, `canAddQuote` → nueva cotización.
4. Si no → empty / info.

**Desviación declarada de esta fase:** se inserta un escalón nuevo entre 1 y 2:

1. `hasActiveRfq` → primario = ronda (invitaciones).
2. **Nuevo — `canStartRfq` (sin ronda y sin cotizaciones) → primario = ronda (formulario «Crear e invitar»).**
3. Si no, `quotes.length > 0` → primario = comparación (CA-24-06 intacto).
4. Si no, `canAddQuote` → nueva cotización.
5. Si no → empty / info.

Efecto: en `DRAFT` o `PENDING_QUOTES` sin ronda ni cotizaciones, «Ronda de cotización» nace **expandida** y el selector es visible sin ningún clic previo (CA-28-01). Con cotizaciones ya registradas y sin ronda, la comparación conserva la prioridad (CA-28-06).

`getCotizarPrimarySection` recibe el campo nuevo `canStartRfq: boolean`, evaluado inmediatamente después de `hasActiveRfq` y antes del caso de cotizaciones existentes. El drawer pasa el valor derivado del estado de la solicitud.

## 4. Nota de continuidad y segunda desviación declarada

- **Continuidad con Fase 24 §L75 (no es ruptura).** La spec de Fase 24 ya preveía para el caso «Empty histórico `PENDING_QUOTES` sin ronda» un *«Bloque "Abrir ronda" colapsado (opcional)»* que la implementación omitió. Esta fase **cierra lo que esa spec previó**: la sección existe en `PENDING_QUOTES` sin ronda y permite crear la ronda e invitar (CA-28-05). La única diferencia es que, por la nueva matriz del §3, el bloque nace expandido cuando no hay cotizaciones — es la consecuencia directa de volver la ronda el camino primario, no un cambio de criterio.
- **Desviación consciente frente a Fase 10 §L70.** La spec de Fase 10 (`2026-07-17-mod12-compras-cotizar-fase10-design.md:70`) remitía el caso `PENDING_QUOTES` sin ronda a Fase 11 (multi-ronda). Esta fase se desvía de esa remisión de forma declarada y acotada: el backend nunca impuso la restricción (`createFromRequest` no mira `request.status`), y el gate sigue exigiendo que **no exista ronda**. No se habilita reapertura tras `CLOSED` o `CANCELLED` (ver §6, CA-28-08). Multi-ronda sigue en Fase 11 con decisión de producto del CTO.

## 5. Copy definitivo

Vocabulario congelado (`INFORME-MOD12-COMPRAS-UX-UI-VOCABULARIO-AUDITORIA-v1.0.md:90`): **«ronda de cotización»**; prohibidos «RFQ», «OC», «oferta», «landed» y `partyRefId` en texto visible. Español, sentence case, sin enums crudos.

| Pieza | Texto |
| --- | --- |
| Cabecera del panel (`PortalSectionHeader`) | Eyebrow: «Ronda de cotización» · Título: «Invitar proveedores» · Descripción: «Selecciona proveedores y pulsa Crear e invitar para abrir la ronda con las invitaciones listas.» |
| Texto introductorio del formulario | «Elige primero a quién invitar; luego completa moneda, fecha límite y notas internas.» |
| Etiqueta del selector | «Proveedores a invitar» |
| Botón primario | «Crear e invitar» |
| Hint bajo el botón (sin selección) | «Selecciona al menos un proveedor para abrir la ronda.» |
| Éxito crear-e-invitar | «Ronda de cotización creada y proveedores invitados.» |
| Error de fallo parcial | «La ronda quedó creada, solo falta invitar. Revisa la selección y pulsa Invitar seleccionados.» |
| Comentario de `showRondaSection` (`:605`) | «Mostrar Ronda si existe o se puede crear (DRAFT o PENDING_QUOTES sin ronda).» |

Sin cambios en las etiquetas que resolvieron el defecto del 2026-09-03 («Invitar seleccionados», «Enviar solicitud» y guías de `sendBlockedReason`): se conservan.

## 6. Criterios de aceptación

| ID | Criterio |
| --- | --- |
| CA-28-01 | Solicitud en `DRAFT` sin ronda: al abrir Cotizar, «Ronda de cotización» nace expandida y el selector de proveedores es visible sin ningún clic previo. |
| CA-28-02 | Seleccionar N proveedores y pulsar «Crear e invitar» crea la ronda e inscribe las N invitaciones en estado *Invitado* en un solo acto; «Enviar solicitud» queda habilitado. |
| CA-28-03 | «Crear e invitar» está deshabilitado sin proveedores seleccionados, con hint visible. |
| CA-28-04 | Fallo parcial (`createRfq` correcto, `inviteSuppliers` falla): la selección se conserva, el panel muestra la ronda creada con «Invitar seleccionados» disponible, y el mensaje explica que solo falta invitar. Ningún reintento produce un 400 opaco. |
| CA-28-05 | Solicitud en `PENDING_QUOTES` sin ronda: la sección existe y permite crear la ronda e invitar. |
| CA-28-06 | Con cotizaciones ya registradas y sin ronda, el bloque primario sigue siendo «Comparación» (CA-24-06 intacto). |
| CA-28-07 | Con ronda activa, el panel conserva invitar / enviar / cerrar / descargar ZIP y sigue bloqueando la cotización manual (C1, CA-24-05). |
| CA-28-08 | En `PENDING_APPROVAL` no aparece el formulario de crear ronda: la reapertura sigue fuera de alcance. Tras cerrar una ronda la solicitud pasa a `PENDING_APPROVAL`, no a `PENDING_QUOTES`, y `getRequestDetail` deja de adjuntar rondas no activas. |

## 7. Fuera de alcance

Multi-ronda / reapertura tras `CLOSED` o `CANCELLED` (Fase 11, ADR-051 §L126). Envío automático al proveedor (excluido por ADR-051 §L30). Comparación por ítem (Fase 13). Filtro por rubro en el selector (sin fase). Cualquier cambio en `apps/api`, `packages/database` o `packages/shared`.

## 8. Trazabilidad

- ADR-051 (Aprobado, CTO 2026-07-11): alcance de la ronda, máquina de estados, superficie de API, boundary por `partyRefId`.
- PRD rector `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (RF-06-05/07/08/09): flujo «Trabajar solicitud». Hueco normativo declarado: ningún PRD/HLD contiene un RF de «invitar proveedores»; no se subsana aquí.
- Fase 24 (`2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md`): matriz D3 (§L79-84) y caso «Empty histórico» (§L75).
- Fase 10 (`2026-07-17-mod12-compras-cotizar-fase10-design.md:70`): remisión a Fase 11, de la que esta fase se desvía de forma declarada.
- Defecto previo (`INFORME-MOD12-COMPRAS-RFQ-ENVIO-BLOQUEO-v1.0.md`): máquina `canInvite`/`canSend`/`canClose` y `sendBlockedReason` intactas.
- Contrato DS (`2026-07-25-searchable-picker-ds-contrato.md` v1.0): `SupplierMultiPicker` se reutiliza tal cual.
