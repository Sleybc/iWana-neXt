# INFORME - MOD12 Compras RFQ: desbloqueo de envío («Escribe al menos 2 caracteres»)

**Fecha:** 2026-09-03
**Módulo:** MOD12 Inventario / SCM — Compras (purchasing)
**Superficie:** Portal tenant → `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Cotizar → Invitar proveedores
**Tipo:** Corrección de defecto UX + guard preventivo (sin cambio de backend, sin cambio de contrato HTTP, sin tokens nuevos)

## 1. Síntoma reportado

Al crear la solicitud de cotización (RFQ en Borrador) el operador selecciona un proveedor (chip visible, p. ej. «Syscom Colombia»), pero no logra pulsar «Enviar solicitud»: queda desplegado el aviso «Escribe al menos 2 caracteres» y la ronda permanece en «Sin invitaciones».

## 2. Causa raíz (verificada en código + 2 agentes expertos)

1. **El aviso no es un error de validación:** es el estado S1 (umbral) del `SearchableMultiPicker`. Tras elegir un proveedor, `addItem()` limpiaba la query y **reabría** el listbox (`SearchablePicker.tsx`), que con query vacía solo puede mostrar S1. El dropdown absoluto (`z-30`, `md:top-full`) queda flotando sobre la botonera «Invitar seleccionados / Enviar solicitud» y la tapa: el clic cae sobre el aviso, no sobre el botón.
2. **Enfocar reabría con el campo vacío:** `onFocus` hacía `setOpen(true)` incondicional, contra lo que fija la spec UX §5.2 («abrir al enfocar **si ya hay ≥ minChars**»).
3. **Confusión selección ≠ invitación:** el chip es estado local (`selectedSuppliers`); la invitación real solo existe tras pulsar «Invitar seleccionados» (`POST .../invitations`). Pero «Enviar solicitud» se habilitaba con solo estar en `DRAFT`, de modo que el envío llegaba al backend sin invitaciones y era rechazado con 400 «Debes invitar al menos un proveedor antes de enviar» (`rfq.service.ts:219-221`). El operador percibía el S1 como la causa del bloqueo.

## 3. Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/shared/SearchablePicker.tsx` (`SearchableMultiPicker`) | `addItem()` ahora **cierra** el listbox tras añadir (aborta búsqueda pendiente y resetea S2/S5); la segunda búsqueda sigue siendo inmediata porque al tipar se reabre (CA-PICK-16: exige no impedirla, no mantener S1 abierto). `onFocus` solo abre si `query.trim().length >= minChars` (UX §5.2). Supresión de reapertura en el refoco programático posterior a `addItem` (mismo patrón que el single picker). |
| `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx` | «Enviar solicitud» se deshabilita sin invitaciones persistidas o con selección pendiente de invitar, con `title` y texto guía bajo la botonera («Invita al menos un proveedor…» / «Pulsa Invitar seleccionados…» / «Tienes proveedores seleccionados sin invitar…»). `handleSend()` retorna temprano sin invitaciones (el backend sigue siendo la fuente de verdad). Descripción de la sección explicita el flujo en 2 pasos. |
| `SearchablePicker.spec.tsx` | Test CA-PICK-16 actualizado (cierra + tipar reabre con resultados) + test nuevo (foco en vacío no abre). |
| `RfqInvitationsPanel.spec.tsx` | Tests nuevos: DRAFT sin invitaciones (Enviar deshabilitado + guía + sin llamada) y DRAFT con invitación (Enviar habilitado y envía). |

No se toca backend, contrato OpenAPI, migraciones ni permisos. Etiquetas de botones intactas (`Invitar seleccionados`, `Enviar solicitud`): el E2E `portal-inventory-scm.spec.ts` («ejecuta flujo RFQ…», su `dismissOpenListbox` pasa a ser no-op) sigue válido.

## 4. Evidencia de verificación

- `jest SearchablePicker.spec + RfqInvitationsPanel.spec`: **32/32 pasan**.
- Regresión: `SupplierPicker.spec + PurchaseRequestWorkbenchDrawer.spec + CommercialInterestSection.spec` (consumidores del picker): **pasan**.
- `tsc --noEmit` portal: limpio. `eslint` en los 4 archivos: 0 errores (1 warning preexistente `exhaustive-deps` en `invitations`, sin tocar).

## 5. Tensión normativa a escalar (DS-OWNER)

El contrato DS v1.0 (`2026-07-25-searchable-picker-ds-contrato.md` §3, anatomía multi: «permanece abierta tras añadir») es más estricto que la spec UX v1.0 §5.2 («**puede** permanecer abierto»). Este fix adopta la lectura de la spec UX por ser la que desbloquea el flujo sin romper CA-PICK-16 observable. Si DS-OWNER requiere mantener «siempre abierto», pedir versionado v1.1 del contrato con una excepción para pickers embebidos junto a acciones (el overlay S1 tapa botones hermanos).

## 6. Seguimiento sugerido

- Mismo patrón `onFocus` incondicional en el single `SearchablePicker`: revisar si causa bloqueos equivalentes en otros formularios (fuera de alcance de este reporte).
- E2E del flujo RFQ ya cubre crear → invitar → enviar; considerar aserción de que «Enviar» nace deshabilitado sin invitaciones.
