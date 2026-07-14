# Prompt de ejecución — Comercial UI alignment Fase 01

**Gate:** G4 (EM-ARCH)  
**Fecha:** 2026-07-12  
**Referencias:** [contrato UI](../specs/2026-07-12-commercial-ui-alignment-contract.md), [UX spec](../specs/2026-07-12-commercial-ux-spec.md)

## Alcance exacto

1. Backend: `GET /api/v1/commercial/dashboard/summary` con agregación tenant-scoped.
2. Frontend: tab Resumen default, `CommercialDashboard`, reubicación catálogo a `commercial/catalog/`.
3. Alineación visual Firma iWana en todos los managers del módulo.
4. Tests unitarios + E2E evidencia actualizada.

## Restricciones

- No TanStack Table enterprise (fuera de alcance; ADR requerido).
- No alterar contratos de catálogo existentes (CRM depende de `getPlans`).
- Texto visible en español, sentence case, sin enums crudos.
- WCAG 2.2 AA en flujos afectados.

## Stop/go

- **Go** tras specs congeladas y tests ≥80% en servicio summary.
- **Stop** si se requiere cambio de tokens de marca o nueva dependencia UI.
