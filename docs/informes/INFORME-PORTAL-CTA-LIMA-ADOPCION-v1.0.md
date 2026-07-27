# INFORME-PORTAL-CTA-LIMA-ADOPCION-v1.0

**Módulo:** Portal — adopción CTA lima (Firma iWana / UI-18)
**Fase:** Carril rápido de UI · cierre G7
**Modo:** AI-EM-ARCH Orchestrator
**Fecha:** 2026-07-23
**Plan G4:** [docs/plans/2026-07-23-portal-cta-lima-adopcion.md](../plans/2026-07-23-portal-cta-lima-adopcion.md)

---

## Veredicto

**SUPERSEDIDO (CTO 2026-07-23, opción C).** La adopción lima como CTA de página queda anulada por enmienda Firma: CTA de página = `primary` (azul). Ver [INFORME-PORTAL-CTA-LIMA-VS-AZUL-DESEMPATE-v1.0.md](INFORME-PORTAL-CTA-LIMA-VS-AZUL-DESEMPATE-v1.0.md). Migración FE en curso.

---

## Veredicto histórico (pre-enmienda)

**GO** en su momento. Deuda de adopción del contrato «lima = CTA de página» cerrada en Comercial, Inventario, CRM, Assurance y Access Control. Submits de modal/drawer siguen `primary`. `Button.defaultVariants` intacto.

## Protocolo

| Fase | Agente | Resultado |
| --- | --- | --- |
| Contrato IN/OUT | DS-OWNER | GO afinado |
| Implementación + gaps | FE-PLATFORM | GO |
| G6 | SR-QA | GO con deuda P3 (empties sin createAction en 2 paneles) |
| G7 | EM-ARCH | **GO** |

## Deuda

| Ítem | Estado |
| --- | --- |
| Empty `StockLocationsPanel` / `StockCountsWorkspace` con CTA lima | **Cerrada** (2026-07-23) |
| `InventoryClient` «Nuevo proveedor» header + empty → lime | **Cerrada** (2026-07-23) |
| Scheduling / PurchaseRequest / `apps/web` | Fuera de alcance (diferida) |

## Sin escalación CTO

No hay cambio de tokens de marca globales; solo adopción de variante existente `lime`.

---

*Firmado por AI-EM-ARCH tras G6. Aprobador G6 ≠ productor FE.*
