# INFORME-INVENTORY-SKU-AUTOGENERADO-v2

**Módulo:** Inventario / SCM (MOD12) — Catálogo de productos  
**Fase:** Implementación  
**Versión:** 2  
**Fecha:** 2026-07-02

---

## Resumen

Se reemplaza la autogeneración de SKU `{prefijo-categoria}-{NNNNNN}` por un SKU compuesto:

```text
{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}
```

El nuevo formato aplica solo a productos creados sin SKU explícito. Los productos existentes no se
modifican y el SKU continúa siendo inmutable.

## Decisiones de diseño

| Eje | Decisión | Justificación |
| --- | --- | --- |
| Trigger | Híbrido: `sku` vacío autogenera; `sku` provisto se respeta | Mantiene flexibilidad B2B |
| Formato | Segmentado con guiones | Legible para operación |
| Límite | `varchar(60)` | Evita migrar la longitud del SKU |
| Categoría | `codePrefix` de 2-3 caracteres | Deja espacio al resto de segmentos |
| Tipo | Código fijo por `InventoryItemKind` (`STK`, `CON`, `SER`, `SVC`) | Compacto y estable |
| Colisión | Sufijo `-001` a `-999` | Evita duplicados sin cambiar segmentos base |
| Inmutabilidad | SKU no editable en `PATCH` | Protege movimientos y referencias |

## Cambios esperados

- Nuevo builder compartido en `@iwana/shared` para componer SKUs.
- `InventoryCategory.codePrefix` se reduce de 8 a 3 caracteres.
- Migración tenant `055` ajusta categorías sin productos asociados.
- `InventoryItemService.generateSku()` usa campos del producto y categoría.
- Portal muestra vista previa del SKU en creación y deja el SKU como solo lectura en edición.

## Compatibilidad

Los SKUs existentes con formato v1 se conservan. La migración de prefijos de categoría acorta
`codePrefix` para nuevas emisiones, pero no recalcula los SKUs ya emitidos.

## Verificación

- Tests unitarios del builder de SKU compuesto.
- Tests del generador backend con colisiones.
- Tests del portal para la vista previa.
- Typecheck de shared, database, API y portal.
