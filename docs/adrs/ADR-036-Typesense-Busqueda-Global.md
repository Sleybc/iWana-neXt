---
title: "ADR-036 — Incorporar Typesense para busqueda global indexada"
status: "Aprobado"
date: "2026-05-02"
author: "AI-EM-ARCH (Modo Architect)"
module: "TRANSVERSAL"
references:
  - AGENTS.md
  - docs/prds/Stack_Tecnologico.md
  - docs/hlds/HLD-TRANSVERSAL-BUSQUEDA-GLOBAL-v1.0.md
  - docs/specs/2026-05-02-busqueda-global-typesense-design.md
  - docs/plans/PLAN-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md
---

# ADR-036: Incorporar Typesense para busqueda global indexada

## Estado

Aprobado. El CTO autorizo la incorporacion de Typesense y la ejecucion de cambios de infraestructura, dependencias y codigo productivo para la busqueda global.

## Contexto

La consola administrativa `apps/web` tiene hoy una barra de busqueda en `TopHeader`, pero su comportamiento es limitado:

- El input escribe `q` en la URL actual.
- Solo el dashboard consume `q` para filtrar empresas en memoria.
- No existe busqueda global cross-tenant.
- El indicador visual `Cmd/Ctrl + K` no tiene handler real.
- No hay resultados agrupados ni ranking fuzzy tipo UISP.

El objetivo de producto es evolucionar a un buscador global como el de UISP/Ubiquiti: resultados vivos mientras se escribe, agrupados por dominio, navegables con teclado y capaces de encontrar empresas, usuarios y modulos desde cualquier pantalla.

Una implementacion basada solo en consultas PostgreSQL por cada tecla podria resolver una primera version, pero limita ranking, typo tolerance, relevancia y escalabilidad. El usuario eligio una opcion con motor dedicado.

## Decision

Se propone incorporar **Typesense** como motor dedicado de busqueda global para la consola administrativa.

La primera version indexara estos dominios:

1. `tenants` — empresas de la plataforma.
2. `users` — usuarios cross-tenant de las empresas.
3. `navigation_modules` — modulos, pantallas y acciones de navegacion de `apps/web`.

El backend NestJS incorporara un modulo transversal `SearchModule` responsable de:

- abstraer el cliente Typesense,
- exponer un endpoint protegido `GET /api/v1/search/global?q=&limit=`,
- aplicar RBAC y filtros de seguridad antes de responder,
- construir el contrato agrupado para frontend,
- ejecutar rebuild inicial de indices,
- publicar o consumir jobs BullMQ para actualizacion incremental.

El frontend `apps/web` reemplazara el comportamiento actual del buscador del header por un overlay tipo UISP:

- resultados incrementales con debounce,
- grupos Empresas, Usuarios y Modulos,
- ranking fuzzy,
- atajo `Cmd/Ctrl + K`,
- flechas/Enter/Escape,
- estados loading, empty y error.

## Alternativas consideradas

### A. Busqueda local con datos precargados

Descartada para el objetivo global. Es rapida de implementar, pero no escala con usuarios cross-tenant, datos crecientes ni relevancia avanzada.

### B. Endpoint backend incremental sobre PostgreSQL

Viable como MVP tecnico, pero no cumple plenamente la expectativa de ranking fuzzy y experiencia tipo UISP. Mantenerlo como fallback operativo o etapa de contingencia es aceptable.

### C. Typesense como motor dedicado

Elegida como direccion de diseno. Entrega busqueda-as-you-type, typo tolerance, ranking y operacion mas liviana que OpenSearch para el alcance actual.

### D. OpenSearch

Descartada para esta fase por mayor costo operativo, memoria, complejidad de despliegue y mantenimiento on-premise frente al alcance inicial.

## Consecuencias

### Positivas

- Busqueda global real desde cualquier pantalla de `apps/web`.
- Mejor experiencia operativa: resultados vivos, fuzzy ranking y grupos como UISP.
- Separacion clara entre datos transaccionales PostgreSQL e indice de consulta rapida.
- Base extensible para futuros dominios: auditoria, CRM, tickets, pagos, suscriptores y acciones rapidas.
- Permite observabilidad especifica de latencia y calidad de resultados.

### Costos y tradeoffs

- Nuevo servicio en Docker/dev/staging/prod.
- Nuevas variables de entorno y secretos operativos.
- Necesidad de rebuild de indice y estrategia de sincronizacion incremental.
- Nuevo vector de consistencia eventual: PostgreSQL es fuente de verdad, Typesense es indice derivado.
- Requiere pruebas de contrato y recuperacion ante indice desactualizado.

### Riesgos aceptados

- Drift temporal entre base transaccional e indice si fallan jobs incrementales.
- Exposicion accidental de PII si el modelo de indice no se gobierna estrictamente.
- Sobrecarga operativa inicial por nueva dependencia.

### Mitigaciones obligatorias

- No indexar documentos, telefonos ni otros datos sensibles en v1.
- No registrar terminos completos de busqueda en logs por defecto.
- Rebuild manual y documentado del indice.
- Jobs BullMQ idempotentes para reindexacion incremental.
- Endpoint backend como unica via de busqueda desde frontend; nunca exponer API key de Typesense al browser.
- Tests de RBAC y ausencia de PII sensible en payloads.

## Impacto en stack e infraestructura

Se debe actualizar infraestructura solo tras aprobacion:

- `docker-compose.dev.yml`: servicio `typesense`.
- Variables esperadas: `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY`.
- Secretos fuera de git.
- Health check operativo.
- Runbook de rebuild y troubleshooting.

## Impacto en boundaries

`SearchModule` sera transversal. No se convierte en dueno de datos de Tenants ni Users. Solo consume puertos/servicios aprobados o jobs de indexacion. PostgreSQL sigue siendo fuente de verdad.

Regla no negociable: ningun modulo de dominio debe consultar Typesense para validar reglas transaccionales.

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/hlds/HLD-TRANSVERSAL-BUSQUEDA-GLOBAL-v1.0.md
- docs/specs/2026-05-02-busqueda-global-typesense-design.md
- docs/plans/PLAN-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md
