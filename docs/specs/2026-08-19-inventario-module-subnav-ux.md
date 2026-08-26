# UX + DS — Inventario · subnavegación horizontal lima (`PortalModuleSubnav`)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.2 |
| **Estado** | Congelado |
| **Fecha** | 2026-08-19 |
| **Módulo** | MOD12 Inventario · portal `/dashboard/inventory` |
| **Identidad** | [Firma iWana 2026-07-12](./2026-07-12-firma-iwana-diseno-visual-design.md) §3 elem. 1 |
| **Antecesor de receta** | [2026-08-19-comercial-module-subnav-ux.md](./2026-08-19-comercial-module-subnav-ux.md) v1.1 |
| **Informe** | [INFORME-INVENTORY-MODULE-SUBNAV-v1.0.md](../informes/INFORME-INVENTORY-MODULE-SUBNAV-v1.0.md) |

**Postura:** visualmente sobrio, interactivamente denso. El menú de módulo es **navegación** (`<nav>` + `aria-current`), no tabs de un mismo recurso. Activo `lg+` = subrayado lima inferior. Las subtabs internas de recurso (Productos/Categorías, Por bodega/Kardex, Lista/Comodatos) usan la receta de Oportunidades: tira con `border-b`, icono + label, activo = `portalTabLimeActiveClassName`.

**Cambio v1.1:** las subtabs internas dejan el fill navy.

**Cambio v1.2:** Vista general deja de duplicar Catálogo. KPI sueltos (`PortalMetricCard`) + un panel «Atención ahora». Sin tabla preview ni rankings de workspace.

**Supersede:** Comercial v1.1 reservaba Inventario en tabs navy. Esta spec lo migra a `PortalModuleSubnav` (módulo) + tira lima (recurso). No se sube a `@iwana/ui`.

---

## 1. IA

Aterrizaje = **Vista general** (solo dashboard). Al elegir una sección, el dashboard se sustituye por el workspace. El menú lima permanece arriba.

```text
Operación
  Vista general          ← aterrizaje (?tab omitido)
  Catálogo
  Existencias
  Compras
  Proveedores
  Bodegas
  Salidas
  Conteos

Seguimiento
  Activos
  Movimientos
  Bajas
```

**URL:** sin `?tab` → overview. `?tab=catalog|stock|…` sin cambio de ids. Legacy `?tab=summary` → overview. Deep links `commercialRef`, `serializedAssetId` y `custody=mobile` siguen forzando Catálogo o Existencias.

---

## 2. Contrato

Misma primitive `PortalModuleSubnav` que Comercial. Sticky `lg:top-(--portal-sticky-offset)`. Ítems `min-h-11` + icono Lucide 16 px (`aria-hidden`). Activo: `bg-iwana-surface-soft` + `h-0.5 bg-iwana-secondary` + icono `text-iwana-secondary-700`.

`<lg`: `Sección: {label} ▾` + Dialog en columna.

### 2.1 Subtabs de recurso

Dentro de Catálogo, Existencias y Activos la tira interna replica Oportunidades (`/dashboard/crm/expedientes`): `role="tablist"` + `border-b`, `min-h-11`, icono + label, activo = `portalTabLimeActiveClassName` + icono `text-iwana-secondary-700`. Tokens: `portalResourceTabListClassName` / `portalResourceTabTriggerClassName` / `portalResourceTabIconClassName`.

Fuera de alcance: tabs de composer/workbench (Salidas, compras).

---

## 3. Criterios de aceptación

1. `/dashboard/inventory` muestra KPIs de salud y el panel de excepciones; no la tabla de catálogo ni rankings de bodegas/categorías.
2. El menú de 11 destinos está arriba; Vista general lleva lima.
3. `?tab=catalog` oculta el dashboard y muestra el workspace de catálogo.
4. Atrás restaura `?tab`.
5. Subtabs internas de Catálogo, Existencias y Activos: subrayado lima + icono; sin fill navy.
6. «Activos a vigilar» incluye CTA «Ver activos», simétrico a «Ver reposición».
