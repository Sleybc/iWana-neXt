# MOD06 — Deuda alertas operativas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las tres deudas del spec [2026-07-23-mod06-deuda-alertas-operativas-design.md](../specs/2026-07-23-mod06-deuda-alertas-operativas-design.md): CTA catálogo, precio en productos, alta guiada de tax rule + vínculo.

**Architecture:** FE resuelve tab por `attentionItems`; productos espejan el flujo de servicios con `POST …/prices`; backend añade `POST /commercial/tax-rules` tras hacer `tax_classification_id` nullable; UI encadena create regla → create aplicación.

**Tech Stack:** NestJS · TypeORM · migraciones tenant · Next.js portal · Jest

---

## Archivos

| Acción | Ruta |
| --- | --- |
| Modify | `apps/portal/.../commercial-alerts.ts` + `.spec.ts` |
| Modify | `apps/portal/.../api-client.ts` (productos + createTaxRule) |
| Modify | `apps/portal/.../AdditionalProductsPanel.tsx` |
| Create | `packages/database/.../086_tax_rules_classification_nullable.ts` + `runner.ts` |
| Modify | `apps/api/.../tax.dto.ts`, `tax-application.service.ts`, `tax.controller.ts` (+ specs) |
| Modify | `apps/portal/.../TaxApplicationRulesManager.tsx` |
| Update | spec estado → Aprobado |

### Task 1 — CTA catálogo

- [x] Tests `resolveCatalogIncompleteTab` + update buildCommercialAlerts
- [x] Implementar resolver y cablear alerta
- [x] `pnpm --filter @iwana/portal exec jest --testPathPattern=commercial-alerts`

### Task 2 — Precio productos

- [x] Ampliar DTOs/mapper/create/update en `api-client.ts`
- [x] Form + columna precio en `AdditionalProductsPanel.tsx`
- [x] Jest del panel si existe; smoke typecheck portal

### Task 3 — Tax rules create (B)

- [x] Migración 086 nullable + registrar en runner
- [x] `createRule` service + `POST tax-rules` + DTO opcional classification
- [x] HTTP/unit specs
- [x] Client `createTaxRule` + UI formulario guiado
- [x] `pnpm db:migrate` tenant / tests api tax

### Task 4 — Cierre

- [x] Actualizar estado del spec a Aprobado
- [x] Suite commercial portal + tax api relevantes
