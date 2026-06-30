# INFORME - MOD12 Catalogo de Productos y Categorias Administrables

**Version:** 1.0  
**Fecha:** 2026-06-30  
**Estado:** Diseno propuesto  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Modulo base:** MOD12 Inventario / SCM  
**Spec fuente:** docs/specs/2026-06-30-mod12-catalogo-productos-categorias-design.md

---

## 1. Resumen

Se documento la evolucion de `Inventario > Catalogo` para que el maestro operativo de MOD12 gestione **productos** y **categorias administrables** por empresa.

La decision conserva `inventory_items` como fuente de verdad del producto operativo e introduce `inventory_categories` como entidad tenant-aware. Cada producto debera pertenecer a una categoria obligatoria.

## 2. Artefactos actualizados

| Artefacto | Cambio |
| --- | --- |
| `docs/specs/2026-06-30-mod12-catalogo-productos-categorias-design.md` | Nuevo spec de Fase 02 propuesta |
| `docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` | Addendum con impacto arquitectonico y enlace al spec |

## 3. Decisiones tomadas

| Decision | Resultado |
| --- | --- |
| Source of truth de producto | Se mantiene en `inventory_items` dentro de MOD12 |
| Ubicacion UI | `Inventario > Catalogo` |
| Superficie interna | `Productos` y `Categorias` |
| Modelo de categoria | Entidad administrable por tenant |
| Relacion producto-categoria | Un producto pertenece a una categoria obligatoria |
| Subcategorias | Fuera de alcance de esta fase |
| ADR nuevo | No requerido en esta fase |

## 4. Razonamiento arquitectonico

La decision no crea un nuevo bounded context ni cambia el stack aprobado. Es una evolucion interna del Catalogo Maestro de Articulos bajo el ownership de MOD12, alineada con ADR-048.

El cambio si tiene impacto de persistencia tenant-aware, por lo que el spec exige migracion versionada, backfill conservador, rollback y pruebas de compatibilidad.

## 5. Riesgos pendientes

| Riesgo | Severidad | Mitigacion propuesta |
| --- | --- | --- |
| Backfill incorrecto desde enum historico | Alta | Migracion tenant con pruebas y verificacion por tenant |
| Productos sin categoria despues de migracion | Alta | Constraint `NOT NULL` posterior al backfill |
| UI mezclando categoria enum y categoria administrable | Media | Migrar contratos y labels en el mismo plan |
| Compras sin categoria resuelta en selector | Media | Extender `listCatalogOptions` con categoria resuelta |

## 6. Stop / go

**Go condicionado** para plan de implementacion, sujeto a revision del spec por el usuario.

No hay [ESCALACION AL CTO] obligatoria en esta fase. Se recomienda revaluar ADR si una fase posterior elimina fisicamente el enum/campo historico de categoria.

