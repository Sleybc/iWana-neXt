# SPEC — MOD12 Compras · Panel de decisión de aprobación — Fase 21

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4/G5
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras
**Autor:** AI-EM-ARCH
**Prompt:** [PROMPT Fase 21](../prompts/PROMPT-MOD12-COMPRAS-APROBACION-DECISION-FASE-21-v1.0.md)

## 1. Problema

El tab Aprobación del workbench es un stub (mensaje + botones). El aprobador no ve comparación, nivel ni monto en el momento de decidir.

## 2. Objetivo

Panel de decisión rico: política (`approvalLevel`, `estimatedAmount` landed), comparación de ofertas (solo lectura), notas editables, ficha post-aprobado/rechazado.

## 3. Decisiones

| Tema | Valor |
| --- | --- |
| Componente | `ApprovalDecisionPanel` en portal inventory |
| Comparación | Reutilizar `QuoteComparisonPanel` (sin selección) |
| Notas | Editables; enviadas en `approve.notes` |
| `estimatedAmount` | Sin cambio de fórmula |
| `approvalLevel` | Mostrar; no enforzar por rol |
| Terminales | Mostrar estado + `resolutionReason` / excepción |

## 4. CA

| CA | Descripción |
| --- | --- |
| CA-21-01 | Tab muestra monto, nivel y comparación |
| CA-21-02 | Notas editables en approve |
| CA-21-03 | Ficha post APPROVED/REJECTED/CANCELLED |
| CA-21-04 | Excepción urgencia sigue funcionando |
| CA-21-05 | RTL panel |
