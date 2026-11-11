# Spec — MOD05 Cierre de venta · Fase 2: contrato automático y cobro de la instalación

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-11 · Plan: [2026-11-11-mod05-cierre-de-venta-fase-2](../plans/2026-11-11-mod05-cierre-de-venta-fase-2.md)
**Fecha:** 2026-11-11
**Emisor:** Claude Code, con criterio de AI-PROD-UX y AI-SR-FULL
**Módulos:** MOD05 CRM · MOD06 Comercial · MOD14 Facturación
**Relacionado:** [spec Cierre de venta](2026-11-11-mod05-cierre-de-venta-contrato-firmado.md) · [ADR-109](../adrs/ADR-109-Contrato-Firmado-en-Instalacion-y-PDF-en-Worker.md) · [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) · [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) · [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md)

---

## 0. Principio

Complementar sin retroceso: la creación manual del contrato desde la ficha y la activación manual se conservan.

## 1. Hechos verificados (2026-11-11, `main` en `26b0a81e`)

| # | Hecho | Fuente |
|---|---|---|
| H1 | Al pasar la oportunidad a «lista para instalación» se crea el suscriptor, pero no el contrato | `subscriber-creation.service.ts:55-59` |
| H2 | El contrato desde la oportunidad solo se crea a mano y exige que el operador confirme `billingCycleDay` | `contracts.controller.ts:362`; `create-contract-from-expediente.dto.ts:89-97` |
| H3 | El cargo de instalación existe dos veces: `installation_fee` en el historial de precios por segmento (MOD06) y `connectionFee` en `plan_details` (migración 183) | `catalog-price-history.entity.ts:44`; `183_contract_permanence.ts` |
| H4 | La generación de MOD14 no tiene línea de instalación; el primer cobro solo trae el plan y los adicionales | `apps/api/src/modules/billing/generation/` |
| H5 | La vista previa del alta ya muestra el costo de instalación desde `installation_fee` | `FirstChargePreview.tsx` |

## 2. Decisiones del usuario (2026-11-11)

| # | Decisión |
|---|---|
| D1 | El cargo de instalación oficial es `installation_fee` (precios del plan, por segmento, con historial). La permanencia toma ese valor y `connectionFee` se retira |
| D2 | La instalación se cobra como línea del primer documento de cobro. Con permanencia aceptada se cobra solo la parte no descontada; con descuento total la línea sale en cero con el descuento visible |
| D3 | Al pasar la oportunidad a «lista para instalación» se crea el contrato en borrador con el ciclo de la oportunidad. Si no lo tiene, se crea igual, la ficha muestra «Falta ciclo» y la firma lo exige antes de activar |

## 3. Alcance

| Bloque | Qué | Se conserva |
|---|---|---|
| **A · Contrato automático** | Listener de `crm.expediente.ready-for-installation` (después de crear el suscriptor) que crea el contrato `DRAFT` reutilizando `createFromExpediente`: plan, precio, adicionales, punto de servicio, estrato y ciclo de la oportunidad. Idempotente: si el expediente ya tiene contrato, no crea otro. Si falta un dato obligatorio distinto del ciclo, no crea y deja un aviso en la ficha («No se pudo crear el contrato: falta X») | Creación manual desde la ficha |
| **B · Falta ciclo** | El contrato puede quedar sin ciclo en `DRAFT`; la ficha y el paso «Contrato» muestran «Falta ciclo de facturación» y la firma responde 409 `BILLING_CYCLE_REQUIRED` hasta que se asigne | Exigencia actual del ciclo para activar |
| **C · Instalación unificada** | La permanencia (bloque H anterior) lee el cargo de `installation_fee` vigente del plan y segmento; migración que retira `plan_details.connection_fee` copiando antes los valores no nulos que difieran a un registro de auditoría | Historial de precios |
| **D · Línea de instalación** | El primer documento de cobro (y solo él) agrega la línea «Instalación» con `installation_fee` congelado en el contrato al crearlo; con permanencia aceptada, cobra `installation_fee − valor descontado o diferido` y muestra el descuento; IVA según la regla vigente para la línea (ver D-F1). Idempotente: nunca se cobra dos veces | Primer cobro del mes sin cambios |
| **E · Contrato y vista previa** | El contrato guarda el `installation_fee` congelado; la vista previa del alta y el PDF del contrato usan ese mismo valor | — |

**Fuera de alcance:** cobro de la penalidad por terminación anticipada; factura electrónica DIAN.

## 4. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Al pasar la oportunidad a «lista para instalación» existe un contrato `DRAFT` con los datos de la oportunidad, uno solo aunque el evento se repita |
| CA-2 | Sin ciclo en la oportunidad, el contrato se crea, la ficha muestra «Falta ciclo de facturación» y la firma responde 409 hasta asignarlo |
| CA-3 | Si falta otro dato obligatorio, no se crea el contrato y la ficha dice qué falta; la creación manual sigue funcionando |
| CA-4 | El primer documento de cobro trae la línea «Instalación» con `installation_fee`; los siguientes no |
| CA-5 | Con permanencia aceptada, la línea cobra el cargo menos lo descontado y muestra el descuento; con descuento total sale en cero |
| CA-6 | La vista previa del alta, el PDF del contrato y el cobro muestran el mismo valor de instalación |
| CA-7 | `connection_fee` deja de existir y la permanencia sigue funcionando con `installation_fee` |

## 5. Decisiones abiertas

| # | Decisión | Dueño |
|---|---|---|
| D-F1 | **Resuelta 2026-11-11:** la línea de instalación sigue el tratamiento de IVA del servicio de internet del contrato (ADR-093). Pendiente la confirmación del contador antes de producción | Usuario |
| D-F2 | **Resuelta 2026-11-11:** el aviso «No se pudo crear el contrato» aparece en la ficha y le llega al responsable comercial de la oportunidad | Usuario |
