# INFORME — MOD12 Compras RFQ · Registrar oferta por invitación — Fase 17

**Versión:** 1.0
**Estado:** Implementado — pendiente gates G5/G6 y GO CTO
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Ejecutor:** AI-FE-PLATFORM (track frontend; activación de sesión AI-SR-FULL sin tocar backend)
**Spec:** [2026-07-17-mod12-compras-rfq-registro-oferta-fase17-design.md](../specs/2026-07-17-mod12-compras-rfq-registro-oferta-fase17-design.md)
**Prompt:** [PROMPT-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md](../prompts/PROMPT-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md)
**Antecede:** [Fase 15 — RFQ PDF ZIP](INFORME-MOD12-COMPRAS-RFQ-PDF-ZIP-FASE-15-v1.0.md), [Fase 14 — RFQ PDF personalizado](INFORME-MOD12-COMPRAS-RFQ-PDF-PERSONALIZADO-FASE-14-v1.0.md)

## Contexto / hueco

Con ronda RFQ activa, el drawer bloqueaba la ruta manual «Nueva oferta» y remitía a «Invitar proveedores», pero `RfqInvitationsPanel` **no tenía** UI para registrar la respuesta del proveedor con `rfqInvitationId`. El backend (`addSupplierQuote` + `applyQuoteToInvitation`) y `purchasingApi.addQuote` ya existían.

## Cambios

### Portal (`apps/portal`) — solo frontend

- `RfqInvitationsPanel.tsx`:
  - Prop `quotes?: SupplierQuoteRecord[]` (default `[]`).
  - Estado local del form por invitación (`quoteFormInvitationId`, número, monto, moneda).
  - Gating `canRegisterQuote`: RFQ `SENT`/`RECEIVING` + invitación `INVITED`.
  - Botón **«Registrar oferta»** (aria-label con nombre del proveedor) → form inline (número, monto, moneda) → `purchasingApi.addQuote` vía `runAction`.
  - Invitación con quote ligada: monto solo lectura (`formatInventoryCurrency`), sin botón de registro.
- `PurchaseRequestWorkbenchDrawer.tsx`: `quotes={detail?.quotes ?? []}` al panel.
- `RfqInvitationsPanel.spec.tsx`: CA-17-01..05 + 4 tests previos (PDF/ZIP) verdes.

### Fuera de alcance (cumplido)

- Sin cambios de backend, DTO, OpenAPI ni migraciones.
- Ruta manual «Nueva oferta» intacta (CA-17-06; drawer spec sigue verde).

## Criterios de aceptación

| CA | Descripción | Estado |
| --- | --- | --- |
| CA-17-01 | RFQ `SENT`/`RECEIVING` + `INVITED` → «Guardar oferta» llama `addQuote` con `partyRefId`, `rfqInvitationId`, número, monto, moneda | Implementado + RTL |
| CA-17-02 | Tras éxito `onRefresh`; `RESPONDED` muestra monto y oculta «Registrar oferta» | Implementado + RTL |
| CA-17-03 | Sin botón en RFQ `DRAFT`/`CLOSED` ni invitaciones no `INVITED` | Implementado + RTL |
| CA-17-04 | «Guardar» deshabilitado con monto ≤ 0 o número vacío; error inline de monto | Implementado + RTL |
| CA-17-05 | 409/400 de `addQuote` → alerta de error; panel usable | Implementado + RTL |
| CA-17-06 | Ruta manual «Nueva oferta» sin cambio de comportamiento | Cumplido (drawer spec) |
| CA-transversal | Sin backend/DTO/OpenAPI/migración; español sentence case | Cumplido |

## Verificación

| Suite | Resultado |
| --- | --- |
| Portal `RfqInvitationsPanel.spec` (4 previos + CA-17 incl. RECEIVING y estados excluidos) | **11/11 pass** |
| Portal `PurchaseRequestWorkbenchDrawer.spec` | **8/8 pass** |
| API `rfq.service.spec` + `purchasing.flow.integration` (regresión, sin cambios) | **17/17 pass** |
| `tsc --noEmit` (`@iwana/portal`) | **OK** |
| ESLint archivos tocados | **OK** |

## Protocolo multiagente

| Gate | Rol | Estado |
| --- | --- | --- |
| G4 | AI-EM-ARCH — prompt de ejecución emitido | Cumplido (entrada de esta fase) |
| G5 | AI-FE-PLATFORM — implementación + tests + informe | Cumplido |
| G6 | AI-SR-QA (CA + a11y) · AI-PROD-UX (cierre de callejón de flujo) | **PASS** |
| G7 | AI-EM-ARCH recomienda · CTO aprueba producción | Pendiente |

**Nota de rol:** la sesión se activó como AI-SR-FULL; el prompt G4 asigna **AI-FE-PLATFORM** y prohíbe backend. Se ejecutó el track frontend sin modificar API/contratos (Protocolo §3bis).

### G6 — Review QA (sesión principal; subagente falló por límite API)

**Veredicto:** PASS → **recomendación a AI-EM-ARCH: go a G7**.

| CA | Evidencia | Resultado |
| --- | --- | --- |
| CA-17-01 | RTL: `addQuote` con payload completo; también botón visible en RFQ `RECEIVING` | OK |
| CA-17-02 | RTL: `onRefresh` + fila `RESPONDED` con monto, sin botón | OK |
| CA-17-03 | RTL: sin botón en RFQ `DRAFT`/`CLOSED` y en invitaciones `DECLINED`/`EXPIRED`/`CANCELLED` | OK |
| CA-17-04 | RTL: «Guardar» disabled + mensaje inline de monto | OK |
| CA-17-05 | RTL: error 409 en `PortalAlert`, panel usable | OK |
| CA-17-06 | Drawer: «Nueva oferta» / `canAddQuote` intactos; drawer spec 8/8 | OK |
| a11y | `aria-label` con proveedor; `Input`/`Select` con label; error textual (no solo color); foco vía primitives `@iwana/ui` | OK |
| Boundaries | Sin cambios API/DTO/OpenAPI/migración | OK |

| Severidad | Hallazgo |
| --- | --- |
| Bloqueante | Ninguno |
| Importante | Ninguno |
| Deuda aceptada | Ninguna (RTL ampliado 2026-07-17). E2E manual del prompt §8 queda como verificación operativa opcional fuera del gate G6. |

## E2E manual recomendado

`pnpm dev` → RFQ en Borrador → invitar 2 proveedores → «Enviar solicitud» → «Registrar oferta» por fila → confirmar `RESPONDED` + monto en comparación → segundo intento 409 → solicitud puede avanzar a aprobación.

## Deuda / fuera de alcance

- Editar/reemplazar oferta ya registrada.
- Adjudicación por ítem, contra-oferta, envío automático de PDF/ZIP.
