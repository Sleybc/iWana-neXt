# RFQ PDF Firma iWana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear el PDF de RFQ (PDFKit) al contrato visual Firma iWana sin cambiar endpoints ni UI.

**Architecture:** Un solo builder compartido (`buildRfqPdfDocument`) usado por `renderForInvitation` y `renderAllInvitationsZip`; assets estáticos bajo `apps/api/assets/`; tipografías OFL embebidas.

**Tech Stack:** NestJS, PDFKit, Jest, Exo 2 + JetBrains Mono (TTF)

---

### Task 1: Spec + prompt

- [x] Spec Fase 16
- [x] Prompt de ejecución

### Task 2: Assets

- [x] Copiar logo y descargar fuentes TTF + LICENSE

### Task 3: Tests en rojo / verde

- [x] Extender `rfq-pdf.service.spec.ts` con anatomía Firma iWana

### Task 4: Builder

- [x] Reescribir layout PDFKit

### Task 5: Verificación + informe

- [x] Tests + typecheck + INFORME Fase 16
