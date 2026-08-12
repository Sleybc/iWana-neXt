# PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2

## Prompt de ejecución — bugfix: fuente del filtro del resumen

**Versión:** 1.2  
**Estado:** Emitido — en ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 (A+B bump) → G4/G5 (C) → G6 (D) · §3bis · carril rápido  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)

> Delta sobre FILTRO-RESUMEN-v1.1. **No** reabre API. **No** portal.

---

## 0. Root cause (evidencia)

| Pieza | Fuente de datos |
| --- | --- |
| Cifras del resumen (`AuditSummary`) | `platformSummaryEntries` / `tenantSummaryEntries` — `list({ limit: SUMMARY_LIMIT })` **sin** filtros de chrome de tabla |
| Filtro v1.1 (bug) | `platformTable.entries` / `tenantTable.entries` — página del pager (`pageSize`) |

**Síntoma:** «Accesos» filtra bien (LOGIN suele estar en página 1). «Empresas con cambios» aplica preset `tenants` (`entityType === 'Tenant'`) sobre la página del pager → **0 filas**, aunque el resumen sí vio Tenant en el lote `SUMMARY_LIMIT`. Empty C engañoso: el operador creyó que no hay empresas con cambios.

**Decisión EM-ARCH (desempate):** el preset del resumen filtra el **mismo lote que alimenta las cifras del resumen** (summary entries + ventana 24h/7d del resumen), **no** la página del pager. Al quitar el preset, la tabla vuelve al lote del pager.

---

## 1. Contratos a bump

| Artefacto | Dueño | Cambio |
| --- | --- | --- |
| UX Historial → **v1.2** | A | §5: fuente = lote del resumen; chip copy; empty; CA-FR |
| DS Historial → **v1.2** | B | Chip copy (si cambia); pager oculto/deshabilitado con preset; GO |

### Copy canónico propuesto (A confirma / ajusta)

- Chip: `Mostrando: {label} · lote del resumen`  
  (sustituye «solo esta página» — ya no es la página del pager)
- Clear / empty: A revisa si el hint debe decir «lote del resumen» en lugar de «esta página»

---

## 2. Implementación C (tras A+B Congelado)

1. Con `summaryPreset` activo:
   - `displayedEntries` = `summaryEntries` filtrados por ventana del resumen (`splitWindow` / helper compartido) **y** `matchesSummaryPreset`
   - No usar `platformTable.entries` como fuente del filtro
2. Sin preset: comportamiento actual (pager)
3. Con preset: deshabilitar o ocultar controles de cursor/pager (no tiene sentido paginar el lote del resumen mezclado)
4. Empty C solo si el lote del resumen + ventana + predicado = 0
5. Tests de regresión: fixture donde summary tiene Tenant y table page no → preset `tenants` **muestra** las filas Tenant del summary
6. Predicado `tenants` se mantiene (`entityType === 'Tenant'`) salvo que A diga ampliar

---

## 3. CA delta

| ID | Criterio |
| --- | --- |
| **CA-FR-11** | Preset `tenants` con Tenant solo en summary lote (no en page) → tabla muestra esas filas, no empty. |
| **CA-FR-12** | Chip indica lote del resumen (no «esta página» del pager). |
| **CA-FR-13** | Quitar filtro restaura entries del pager. |

CA-FR-01…10 siguen; se corrige la interpretación de «lote» (= summary, no pager page).

---

## 4. Fuera de alcance

API multi-action, unificar fetches summary/table, portal, rediseño tarjetas.

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.2 | Fuente del filtro = lote del resumen; corrige empty falso en Empresas con cambios |
