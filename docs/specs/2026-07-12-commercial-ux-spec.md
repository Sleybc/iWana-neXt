# UX spec — Módulo Comercial (tab Resumen y jerarquía)

**Fecha:** 2026-07-12  
**Estado:** Aprobado (AI-PROD-UX)  
**Alcance:** `/dashboard/commercial`

## Tarea principal del operador

Consultar de un vistazo el estado del catálogo comercial y acceder rápido a la sección que necesita editar (planes, productos, reglas tributarias, ofertas).

## Jerarquía de tabs

1. **Operación:** Resumen (default)
2. **Catálogo:** Planes, Productos adicionales, Servicios
3. **Reglas:** Combos y promociones, Compatibilidad, Tributación

Deep-links existentes (`?tab=plans`, etc.) se preservan.

## KPIs núcleo (tab Resumen)

| KPI | Eyebrow | Descripción |
| --- | --- | --- |
| Planes activos | Catálogo | Planes habilitados para venta |
| Productos activos | Catálogo | Productos adicionales activos |
| Servicios activos | Catálogo | Servicios adicionales activos |
| Combos activos | Ofertas | Combos vigentes |
| Promociones vigentes | Ofertas | Promociones activas y en fecha |
| Reglas de compatibilidad | Reglas | Reglas activas entre ítems |
| Reglas tributarias | Reglas | Reglas de aplicación activas |

Máximo 7 KPIs por vista (spec Firma iWana §2.1).

## Empty states

- **Primera vez / sin datos:** explicación + CTA primario (ej. "Nuevo plan")
- **Sin resultados de filtro:** mensaje + botón "Limpiar filtros" (`Button variant="secondary"`)

## Acciones de página

- `PageHeader` incluye botón "Actualizar" para recargar summary y datos del tab activo.
