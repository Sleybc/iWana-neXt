# PROMPT DE EJECUCIÓN — MOD12 Compras · Recepciones multi-OC — Fase 22

**Versión:** 1.0
**Gate:** G4 — AI-EM-ARCH
**Ejecutores:** AI-FE-PLATFORM + AI-SR-FULL
**Spec:** [2026-07-17-mod12-compras-recepciones-multi-oc-fase22-design.md](../specs/2026-07-17-mod12-compras-recepciones-multi-oc-fase22-design.md)

## Objetivo

Operar todas las OCs generadas por adjudicación partida: recepción por OC, lista Órdenes, create robusto, E2E.

## STOP

- No flete en OC; no enforcement approvalLevel; no regenerar OC tras CONVERTED_TO_PO.

## Entregables

- Create rethrow + drawer try/catch
- `selectedOrderId` + GoodsReceiptPanel selector
- Lista Órdenes con proveedor + Recibir
- E2E mock `orders[]`
- Informe vivo

## Informe

`docs/informes/INFORME-MOD12-COMPRAS-RECEPCIONES-MULTI-OC-FASE-22-v1.0.md`
