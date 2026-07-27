# PROMPT — Gate QA paginación tablas operativas (Ola 4)

**Emisor:** AI-EM-ARCH  
**Destinatario:** AI-SR-QA  
**Fecha:** 2026-07-24  
**Precondición:** ADR-064 Aprobado; Olas 1–3 en curso o cerradas parcialmente  
**Spec UX:** CA-PAG-01…10 (PROD-UX, sesión 2026-07-24)

## Checklist (bloqueo merge)

Mapear a CA-PAG:

| CA | Check |
| --- | --- |
| CA-PAG-01 | Primera pintura ≤20 filas de datos (salvo excepción §5 ADR) |
| CA-PAG-02 | Si `total > 20`, existe «Cargar más» en footer del shell |
| CA-PAG-03 | Load-more hace append; filtros intactos |
| CA-PAG-04 | Si `!hasMore`, **sin** footer ni «Fin de resultados» |
| CA-PAG-05 | Conteo estable solo en `PortalResultsStrip` |
| CA-PAG-06 | Filtros fuera del shell |
| CA-PAG-07 | Cambio de filtro reinicia lista (no append) |
| CA-PAG-08 | Empty filtro ≠ primera vez |
| CA-PAG-09 | «Cargar más» operable por teclado |
| CA-PAG-10 | Target ≥44px; no solo-hover |

Extra:

- [ ] Request con `limit` (ideal 20); meta `total` + cursor/`hasMore` (o page documentada).
- [ ] No soft-cap silencioso (`page:1` sin UI de avance) en tablas operativas.
- [ ] Excepciones PREVIEW/matrices documentadas.

## Entregable

Informe corto PASS/FAIL por módulo + hallazgos P0/P1. No implementa fixes.
