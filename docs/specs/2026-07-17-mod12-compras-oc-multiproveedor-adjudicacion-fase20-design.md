# SPEC — MOD12 Compras · OC multiproveedor desde adjudicación — Fase 20

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4/G5
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras
**Autor:** AI-EM-ARCH
**Prompt:** [PROMPT Fase 20](../prompts/PROMPT-MOD12-COMPRAS-OC-MULTIPROVEEDOR-ADJUDICACION-FASE-20-v1.0.md)

## 1. Problema

El API ya admite adjudicación por línea (split entre proveedores) y `POST /purchasing/orders` con `orders[]`. El portal solo crea **una** OC en modo legado, sin ligar awards ni heredar `unitCost` de quote lines. Tras la primera OC la PR pasa a `CONVERTED_TO_PO` y bloquea la segunda.

## 2. Objetivo

Permitir, desde el portal: adjudicar líneas a distintos proveedores → generar **N OCs** en un solo POST batch, con `unitCost` prefilled desde líneas de cotización.

## 3. Decisiones

| Tema | Valor |
| --- | --- |
| Agrupación | Por `awardedPartyRefId` |
| Contrato | `orders[]` (ya existente); tipado en `api-client` |
| Precio | Resolver en **portal** desde `supplier_quote_lines` vía `supplierQuoteId` + `purchaseRequestLineId` |
| Awards | Solo si PR está `APPROVED` (backend) |
| Sin awards | No ofrecer batch; CTA a Adjudicación; legado opcional oculto en happy path con awards |
| Fuera | Enforcement de `approvalLevel`; cambio de `estimatedAmount`; split qty multi-proveedor en no-PROJECT |

## 4. CA

| CA | Descripción |
| --- | --- |
| CA-20-01 | Dos awards → un POST `orders[]` → 2 OCs; PR → `CONVERTED_TO_PO` |
| CA-20-02 | Cada OC solo líneas del proveedor adjudicado |
| CA-20-03 | `unitCost` prefilled desde quote line si hay `supplierQuoteId` |
| CA-20-04 | Sin awards → no batch; empty/CTA adjudicación |
| CA-20-05 | Adjudicar con PR ≠ `APPROVED` → 400 |
| CA-20-06 | RTL builder + preview drawer |
