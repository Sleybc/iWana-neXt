# SPEC — MOD12 Compras · Registrar la oferta de cada proveedor invitado (RFQ) — Fase 17

**Versión:** 1.0
**Estado:** Diseño aprobado (etapa 2) — pendiente G4 (prompt de ejecución) y G5 (implementación)
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Autor (diseño):** AI-EM-ARCH
**Ejecuta (etapa 5):** AI-FE-PLATFORM (frontend) — **sin cambios de backend**
**Antecede:** [Fase 14 — RFQ PDF personalizado](../informes/INFORME-MOD12-COMPRAS-RFQ-PDF-PERSONALIZADO-FASE-14-v1.0.md), [Fase 15 — RFQ PDF ZIP](../informes/INFORME-MOD12-COMPRAS-RFQ-PDF-ZIP-FASE-15-v1.0.md)
**Prompt de ejecución:** [PROMPT-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md](../prompts/PROMPT-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md)

---

## 1. Contexto y problema

En una ronda de cotización formal (RFQ) **no existe hoy en la UI ninguna forma de registrar las ofertas que responden los proveedores invitados**. La ronda queda como un callejón sin salida: se puede invitar y enviar la RFQ, pero nunca capturar respuestas → la solicitud no junta cotizaciones → no se puede aprobar (`PurchasingPolicyService` exige `hasQuote`).

**El backend ya soporta el flujo completo — el hueco es solo de frontend:**

| Capa | Estado |
| --- | --- |
| `PurchasingService.addSupplierQuote` acepta `rfqInvitationId` | Implementado ([purchasing.service.ts:186](../../apps/api/src/modules/inventory/services/purchasing.service.ts)) |
| `RfqService.applyQuoteToInvitation` (valida proveedor, 1 oferta/invitación, `RESPONDED`, `SENT→RECEIVING`) | Implementado ([rfq.service.ts:349](../../apps/api/src/modules/inventory/services/rfq.service.ts)) |
| DTO `AddSupplierQuoteSchema.rfqInvitationId` (uuid, opcional) | Implementado ([dto/index.ts:1172](../../apps/api/src/modules/inventory/dto/index.ts)) |
| Endpoint `POST /purchasing/requests/:id/quotes` | Implementado |
| `purchasingApi.addQuote(id, dto)` (dto incluye `rfqInvitationId`) | Implementado ([api-client.ts:6901](../../apps/portal/src/lib/api-client.ts)) |
| **UI que envíe `rfqInvitationId`** | **NO existe** ← este spec |

El único botón "Registrar cotización" es el de la **ruta manual** (panel "Nueva oferta"), que se deshabilita cuando hay una RFQ activa (`canAddQuote` exige `!hasActiveRfq`, [PurchaseRequestWorkbenchDrawer.tsx:272](../../apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx)) y muestra el aviso *"Registra la oferta desde la invitación correspondiente en «Invitar proveedores»"* — pero ese camino **no está construido** en `RfqInvitationsPanel`.

## 2. Objetivo

Durante una ronda RFQ en estado `SENT`/`RECEIVING`, permitir registrar **por cada proveedor invitado** la oferta que respondió, ligándola a su invitación (`rfqInvitationId`), reutilizando el backend existente. La oferta queda visible en "Comparación de ofertas" y habilita la aprobación.

## 3. Alcance

**Dentro:** solo frontend del portal — `RfqInvitationsPanel.tsx` (+ cableado mínimo desde `PurchaseRequestWorkbenchDrawer.tsx`), su spec RTL y el informe vivo.

**Fuera:**
- Cualquier cambio de backend, DTO, endpoint u OpenAPI (ya existe todo).
- Editar/reemplazar una oferta ya registrada (el backend rechaza duplicado con 409; la UI lo trata como estado terminal por invitación).
- La ruta manual "Nueva oferta" (se conserva intacta para el caso "sin ronda formal").
- Adjudicación por ítem, contra-oferta, envío automático.

## 4. Decisiones de diseño (brainstorming aprobado)

1. **Ubicación:** registro **por fila de invitación** en `RfqInvitationsPanel` (el proveedor queda fijado por la invitación; no hay búsqueda). Cierra el callejón al que ya remite el aviso.
2. **Campos:** los mismos 3 del registro manual — **número de cotización, monto, moneda**.
3. **Ya respondida:** invitación `RESPONDED` = **solo lectura** (sin re-registrar); el 409 del backend es el respaldo.

## 5. Arquitectura / contrato

**Sin contrato nuevo.** Se consume el contrato de API existente:

```
POST /purchasing/requests/{purchaseRequestId}/quotes
body: {
  partyRefId: <invitation.partyRefId>,     // fijado por la invitación
  rfqInvitationId: <invitation.id>,         // clave: liga la oferta a la invitación
  quoteNumber: string,
  amount: number,                            // > 0
  currency: PurchaseCurrencyOption
}
→ 201 SupplierQuoteRecord   (invitación pasa a RESPONDED, RFQ SENT→RECEIVING)
→ 409 "Esta invitación ya tiene una cotización registrada."
→ 400 "La cotización no corresponde al proveedor invitado." | "La ronda de cotización no está recibiendo respuestas."
```

**Componente:** `RfqInvitationsPanel` es dueño de su estado local (mismo patrón que `handleCreateRfq`/`handleInvite`/`handleClose`, todos vía `purchasingApi` + helper `runAction`). No se introduce prop-drilling de callbacks: el panel ya recibe `purchaseRequestId` y `onRefresh`.

## 6. Máquina de estados (gating de la UI)

Por cada invitación, con `rfqStatus` de la ronda:

| `rfqStatus` | `invitation.status` | Acción visible |
| --- | --- | --- |
| `SENT` / `RECEIVING` | `INVITED` | **"Registrar oferta"** (abre form inline) |
| `SENT` / `RECEIVING` | `RESPONDED` | Monto registrado (solo lectura), sin botón |
| cualquiera | `DECLINED` / `EXPIRED` / `CANCELLED` | Sin acción de oferta |
| `DRAFT` / `CLOSED` | cualquiera | Sin acción de oferta |

Regla: **un formulario abierto a la vez** (`quoteFormInvitationId`).

## 7. UX / flujo

- En la tarjeta de invitación (junto a "Descargar PDF" / "Declinar"), botón `size="sm"` **"Registrar oferta"**.
- Al pulsarlo se despliega un mini-formulario **inline bajo la fila**: `Input` "Número de cotización", `Input type="number"` "Monto" (`min=0.01 step=0.01`, `inputMode="decimal"`), `Select` "Moneda" (`PURCHASE_CURRENCY_OPTIONS`, default = `rfq.currency` o `'COP'`), y botones **"Guardar oferta"** / **"Cancelar"**.
- "Guardar oferta" deshabilitado si `quoteNumber` vacío o `amount ≤ 0`; muestra el error de monto de forma inline (patrón del drawer: `Number.parseFloat` + `> 0`).
- Al éxito: `runAction` fija el mensaje de éxito, `onRefresh()` recarga detalle + quotes → la invitación muestra `RESPONDED` + monto; se cierra el form y se limpian campos.
- Errores del backend (409/400) se muestran vía el `PortalAlert` de error ya existente en el panel.

**Reutilización obligatoria (no crear nuevo):** `purchasingApi.addQuote`; `PURCHASE_CURRENCY_OPTIONS` / `PurchaseCurrencyOption` y `formatInventoryCurrency` de `./inventory-labels`; `runAction`, `interactiveFocusClassName`, `Button`/`Input`/`Select` de `@iwana/ui`.

**Cableado del drawer:** pasar `quotes={detail?.quotes ?? []}` a `<RfqInvitationsPanel />` para resolver el monto por invitación (`quote.rfqInvitationId === invitation.id`). `detail.quotes` ya está disponible (lo usa `QuoteComparisonPanel`).

## 8. Criterios de aceptación

| CA | Descripción |
| --- | --- |
| CA-17-01 | Con RFQ `SENT`/`RECEIVING` e invitación `INVITED`, "Registrar oferta" abre el form y "Guardar" llama `addQuote(purchaseRequestId, { partyRefId, rfqInvitationId, quoteNumber, amount, currency })` con los valores correctos. |
| CA-17-02 | Tras registrar, `onRefresh` se invoca; la invitación queda `RESPONDED` mostrando el monto en solo lectura y sin botón de registro. |
| CA-17-03 | El botón **no** aparece con ronda `DRAFT`/`CLOSED` ni en invitaciones `DECLINED`/`EXPIRED`/`CANCELLED`/`RESPONDED`. |
| CA-17-04 | Validación: "Guardar" bloqueado con monto ≤ 0 o número vacío; monto inválido muestra mensaje inline. |
| CA-17-05 | Un 409/400 del backend se muestra como alerta de error sin romper el panel. |
| CA-17-06 | La ruta manual "Nueva oferta" (sin RFQ) permanece sin cambios de comportamiento. |
| CA-transversal | Sin cambios backend/DTO/OpenAPI/migración; texto en español sentence case; tenant desde contexto (no aplica input directo). |

## 9. Accesibilidad (WCAG 2.2 AA)

- El botón "Registrar oferta" con `aria-label` que incluya el nombre del proveedor (evita botones ambiguos repetidos).
- Inputs con `label` asociado; foco visible vía `interactiveFocusClassName`.
- El form inline debe ser operable por teclado y no depender solo de color para el error de monto.

## 10. Riesgos y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Doble envío / doble oferta | Botón deshabilitado durante `isBusy` (`panelDisabled`); backend impone 409. |
| `rfq.currency` ausente | Default `'COP'` (coincide con el manual). |
| Moneda de la oferta distinta de la RFQ | Permitido (el DTO acepta `currency`); la comparación ya la muestra por oferta. |

## 11. Protocolo multiagente

- **Etapa 2 (este spec):** AI-EM-ARCH define flujo + reutilización de contrato. Gate **G2** (alcance) — no toca contrato de datos ni boundary → **carril rápido de UI** (Protocolo §3bis regla 3): AI-DS-OWNER no requiere cambios de token/componente nuevos.
- **Etapa 5:** AI-FE-PLATFORM implementa contra el prompt de ejecución.
- **Etapa 6 (G6):** AI-SR-QA verifica CA-17-01..06 + a11y; AI-PROD-UX valida que se cierra el callejón de flujo. Sin SEC-ENG bloqueante (no hay nuevo endpoint ni PII).
- **G7:** AI-EM-ARCH recomienda; CTO aprueba producción.
