# SPEC — MOD12 Compras · Recepciones multi-OC — Fase 22

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4/G5
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras
**Autor:** AI-EM-ARCH
**Prompt:** [PROMPT Fase 22](../prompts/PROMPT-MOD12-COMPRAS-RECEPCIONES-MULTI-OC-FASE-22-v1.0.md)

## 1. Problema

Tras adjudicación partida, Fase 20 genera N OCs, pero el portal solo opera `orders[0]` en recepción; un create fallido cierra el drawer; la lista Órdenes no muestra proveedor ni CTA recibir.

## 2. Objetivo

Cerrar happy path: recepción seleccionable por OC, lista usable, create robusto, E2E batch.

## 3. Decisiones

| Tema | Valor |
| --- | --- |
| Recepción | Selector de OC; líneas de la OC activa |
| Lista | Proveedor + CTA Recibir |
| Create error | No cerrar drawer; rethrow |
| Shipping → OC | Fuera |

## 4. CA

| CA | Descripción |
| --- | --- |
| CA-22-01 | Create fallido no cierra ni salta a Recepciones |
| CA-22-02 | Lista muestra N OCs con proveedor |
| CA-22-03 | Selector recepción OC A luego B |
| CA-22-04 | CTA Recibir selecciona OC |
| CA-22-05 | RTL + E2E mock batch |
