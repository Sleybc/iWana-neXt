# PRD - MOD06 Comercial - Addendum Fase 02: commercialApi y endurecimiento de integracion del portal

**Version:** 1.0  
**Estado:** Deprecado  
**Fecha:** 2026-04-20  
**Modo activo:** Architect  
**Autor:** Lead Software Architect Senior (AI-EM-ARCH)  
**Convencion documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Estado documental

Este addendum deja de ser la fuente normativa del diseño.

Su contenido fue consolidado en el PRD base actualizado:

- `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md`

Desde esta fecha, la especificación final de MOD06 debe leerse únicamente desde el PRD base consolidado.

## Alcance histórico conservado

El addendum capturó y ya transfirió al PRD base estos puntos:

- `commercialApi` como entrypoint frontend explícito del catálogo comercial.
- retiro de planes y productos comerciales desde `tenantSelfApi`.
- consumo de catálogo comercial desde Settings y Expediente con ownership correcto.
- permanencia de `coverage` dentro de `tenantSelfApi`.
- validación focalizada del portal sin cambios de contrato backend ni migraciones.

## Trazabilidad

- PRD consolidado: `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md`
- HLD del modulo: `docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md`
- ADR aplicable: `docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md`
- Informe vivo relacionado: `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`
- Prompt de ejecucion de salida: `docs/prompts/PROMPT-MOD06-FASE-02-v1.0.md`