# SPEC: Contrato UI — Ingreso directo / Compra de mostrador (MOD12)

**Versión:** 1.0  
**Estado:** Aprobado (carril rápido DS-OWNER)  
**Fecha:** 2026-07-16  
**Módulo:** MOD12 Inventario / SCM — Submódulo Compras  
**Superficie:** Portal tenant → `/dashboard/inventory?tab=purchasing` → modo `counter-purchase`  
**Responsable contrato:** AI-DS-OWNER  
**Ejecución:** AI-FE-PLATFORM  
**Clasificación:** Uso interno

---

## 1. Trazabilidad

| Artefacto | Relación |
| --- | --- |
| [ADR-050](../adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md) | Alcance funcional / API (inmutable en este contrato) |
| [SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0](./SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md) | Alineación visual Compras; este doc cubre el hueco «mostrador» |
| [Lienzo apilado compositor](./2026-07-14-mod12-compras-composer-lienzo-apilado-design.md) | Referencia de create-mode / zonas |
| [Firma iWana](./2026-07-12-firma-iwana-diseno-visual-design.md) | Dirección visual vigente |

**Sin cambio de:** endpoints, DTO, RBAC, multi-tenancy, tokens de marca.

---

## 2. Anatomía de pantalla (contrato)

Shell: `PurchaseCreateModeShell` + `PurchaseCreateModeHeader` (eyebrow/título/descripción configurables).

| Zona | Contenido | Primitives |
| --- | --- | --- |
| Header | Eyebrow «Ingreso directo», título «Compra de mostrador», badge de líneas, «Volver al listado» | `PurchaseCreateModeHeader` |
| 1 — Datos del ingreso | Proveedor, factura, fecha, bodega | `PortalSectionHeader`, `SupplierPicker`, `Input`, `DatePicker`, `Select` |
| 2 — Líneas | Búsqueda de producto + tabla borrador | `PortalSectionHeader`, `PurchaseProductSearch`, `CounterPurchaseLinesTable` (`portalDataTable*`) |
| 3 — Notas | Textarea | `PortalSectionHeader`, `portalTextareaClassName`, label sentence case como `Input` |
| Footer | Resumen + CTA primaria | `CreateModeSummaryFooter` |

Mobile: mismas zonas en stack vertical (sin wizard multipaso).

---

## 3. Estados requeridos

| Estado | Comportamiento |
| --- | --- |
| Empty líneas | `PortalEmptyState` cuando no hay filas |
| Loading submit | Botón footer `loading` |
| Error página | `PortalAlert` error (submit API) |
| Validación | Mensaje visible al intentar registrar incompleto (no solo `disabled`) |
| Success | `PortalAlert` success + CTA «Registrar otro ingreso» (reset form + limpiar resultado) |
| Dirty back | Confirmación al volver si hay cambios |

---

## 4. Reglas Firma iWana

- Labels sentence case; SKUs/totales `font-mono` / `tabular-nums`.
- Sin cards anidadas; una superficie de tabla.
- Lima solo acción primaria / éxito; errores en escala `error`.
- Sombras: `shadow-iwana-soft` en shell create-mode.
- Sin hex nuevos ni `dark:bg-gray-*`.

---

## 5. Criterios de aceptación

1. La pantalla se reconoce como create-mode iWana (shell + secciones + footer sticky).
2. Productos vía búsqueda de catálogo, no `Select` monolítico.
3. Fecha vía `DatePicker`.
4. Tests unitarios del panel en verde; sin regresión de `SupplierPicker` / `Select`.
