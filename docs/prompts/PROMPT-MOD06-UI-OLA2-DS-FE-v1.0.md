---
description: "Wave 2 Comercial UI — DS-OWNER + FE: thead token, offerStatus, filtros planes, simulador, edit PATCH ofertas."
name: "Commercial UI Wave2 DS-FE"
argument-hint: "Solo tras Wave 1 GO SR-QA; ejecutar DS contrato luego FE"
agent: "agent"
---

# Prompt de ejecución — Wave 2 · DS-OWNER → FE-PLATFORM

**Precondición:** Wave 1 **GO** ([commercial-ui-wave1-sr-qa](./commercial-ui-wave1-sr-qa.prompt.md)).  
**Plan:** [2026-07-23-commercial-ui-audit-remediation](../../docs/plans/2026-07-23-commercial-ui-audit-remediation.md) · W2.1–W2.6  
**Informe:** v1.5 hallazgos H26–H31, H34.

## Fase A — AI-DS-OWNER (sin código de app)

1. Aprobar valor de `portalDataTableHeadRowClassName` (= alias comercial actual).  
2. Decidir si densidad `tbody`/opacity inactiva se promueve a class-token portal o solo se unifica en commercial.  
3. Opcional: boceto contrato `PortalNavListRow` (puede diferirse a Wave 3).  
4. Entregar nota GO de contrato a EM-ARCH.

**Fuera de alcance DS:** tokens de marca nuevos, rediseño Firma.

## Fase B — AI-FE-PLATFORM

Orden:

1. **W2.1** Promover thead; migrar managers; limpiar alias muerto.  
2. **W2.2** `offerStatus` vs `status` catálogo; alias legacy `status=expiring`.  
3. **W2.3** Filtros/búsqueda en Planes.  
4. **W2.4** Densidad unificada + `TaxSimulatorPanel` sin paneles anidados.  
5. **W2.5** Actualizar spec UX post-H19 (con PROD-UX si hace falta copy).  
6. **W2.6** Exponer `updateBundle` / `updatePromotion` en `api-client` + side peek edición (API PATCH ya existe — ver decisión EM-ARCH en plan § Escalación).

## Consulta SR-BACKEND (solo W2.6, on-demand)

Preguntar límites de `BundleService.update` / `PromotionService.update` (código promo inmutable, ítems del bundle, etc.). **No** pedir endpoints nuevos para campos ya en `Update*Dto`.

## Stop / go

- Jest + `audit-ui.mjs` limpios.  
- Oferta en riesgo editable en vigencia/nombre **o** form acotado con justificación backend.  
- EM-ARCH consolida; SR-QA smoke Wave 2.
