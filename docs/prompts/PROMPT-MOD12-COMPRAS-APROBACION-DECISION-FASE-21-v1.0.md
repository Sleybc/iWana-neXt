# PROMPT DE EJECUCIÓN — MOD12 Compras · Aprobación decisión — Fase 21

**Versión:** 1.0
**Gate:** G4 — AI-EM-ARCH
**Ejecutores:** AI-FE-PLATFORM (+ AI-SR-FULL tipado si aplica)
**Spec:** [2026-07-17-mod12-compras-aprobacion-decision-fase21-design.md](../specs/2026-07-17-mod12-compras-aprobacion-decision-fase21-design.md)

## Objetivo

Reemplazar el stub del tab Aprobación por `ApprovalDecisionPanel` con contexto de decisión.

## STOP

- No cambiar política ni `estimatedAmount`.
- No enforzar `approvalLevel` por rol.
- CTA Aprobar/Rechazar/Cancelar permanecen en footer del drawer.

## Frontend

- `ApprovalDecisionPanel.tsx` + wire en `PurchaseRequestWorkbenchDrawer`.
- Notas → `onApprove({ notes, exceptionReason })`.
- Tipar `resolutionReason` / `resolvedByUserId` en portal (si faltan).

## Informe

`docs/informes/INFORME-MOD12-COMPRAS-APROBACION-DECISION-FASE-21-v1.0.md`
