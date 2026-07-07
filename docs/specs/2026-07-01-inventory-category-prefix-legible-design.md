# Prefijo legible de categorías de inventario

**Fecha:** 2026-07-01  
**Estado:** Aprobado

## Objetivo

Reemplazar el truncado ciego de prefijos (`CONSUMIB`, `CONSUMI2`) por siglas legibles (base + distintivo) con unicidad verificada en servidor.

## Decisiones

| Eje | Decisión |
| --- | --- |
| Algoritmo | Base (4 chars del token ancla) + distintivo (siguiente token o iniciales) |
| Unicidad | Backend consulta prefijos ocupados del tenant; variantes legibles antes de sufijo numérico |
| UI operador | Ocultar columna Código; mostrar Nombre + Prefijo de producto |
| Fuente de verdad | `@iwana/shared` compartido entre API y portal |

## Formato

- `codePrefix`: 2–8 chars `^[A-Z0-9]{2,8}$` (sin cambio de schema)
- Productos: `{codePrefix}-{NNNNNN}` (sin cambio)

## Endpoint

`GET /api/v1/inventory/categories/suggest-prefix?name=...&codePrefix=...`

Respuesta: `{ code, codePrefix, sortOrder }`
