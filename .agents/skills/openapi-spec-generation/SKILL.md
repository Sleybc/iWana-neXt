---
name: openapi-spec-generation
description: Generacion y mantenimiento de OpenAPI para iWana neXt con NestJS, REST versionada, DTOs validados y trazabilidad documental.
---

# OpenAPI Spec Generation

## Proposito

Usa esta skill cuando necesites diseñar, actualizar o revisar contratos OpenAPI en iWana neXt.

El foco no es producir un YAML aislado. El foco es mantener contratos REST versionados, coherentes con NestJS, DTOs validados, seguridad declarada y trazabilidad con PRD, HLD, ADR e informe de ejecucion cuando corresponda.

## Cuando usarla

Activa esta skill para tareas como:

- Nuevos endpoints o cambios contractuales en APIs del backend.
- Sincronizacion entre implementacion NestJS y especificacion OpenAPI.
- Documentacion de autenticacion, autorizacion, errores y payloads.
- Revision de compatibilidad de contrato antes de merge.
- Preparacion de APIs para consumo interno, portal o integraciones futuras.

## Reglas del repo

### 1. La API externa es REST versionada con OpenAPI

Toda modificacion relevante debe responder:

- que version de ruta o contrato afecta
- si rompe compatibilidad
- que consumidores impacta
- que evidencia documental debe actualizarse

### 2. El contrato debe reflejar validacion real

OpenAPI no debe mentir.

- Si el backend valida con DTOs, pipes o Zod en boundaries, el contrato debe reflejarlo.
- Si un campo es opcional, nullable o enumerado, debe verse en el spec.
- Si un endpoint requiere tenant, autenticacion o scopes, debe declararse.

### 3. Seguridad documentada, no implicita

El contrato debe dejar claro:

- esquema de autenticacion aplicable
- requisitos de autorizacion cuando sean visibles a nivel de endpoint
- codigos de error relevantes
- restricciones de payload, paginacion o filtros si son parte del contrato publico

### 4. El multi-tenant no se oculta en el diseño

Aunque el aislamiento real sea interno por schema:

- el contrato debe reflejar correctamente el contexto autenticado cuando afecte comportamiento
- evita exponer detalles de infraestructura como schemas internos
- documenta headers, contexto o reglas visibles para el consumidor cuando correspondan

## Que debe cubrir un buen spec aqui

### Operaciones

- resumen y descripcion utiles
- tags coherentes por modulo o bounded context
- request params, query, body y responses tipados
- ejemplos sinteticos sin PII real
- errores esperados y estructura de error consistente

### Seguridad

- bearer auth u otro esquema aprobado
- endpoints publicos identificados claramente
- respuestas 401 y 403 donde aplique
- notas sobre rate limiting o constraints si impactan integracion

### Consistencia

- nombres estables
- convencion uniforme para paginacion, filtros y ordenamientos
- evitar respuestas ad hoc distintas para el mismo tipo de problema
- versionado claro si hay breaking change

## Checklist de revision

- El endpoint nuevo o modificado esta documentado.
- El spec coincide con la validacion y los DTOs reales.
- Los codigos de estado y errores son coherentes.
- La seguridad requerida esta declarada.
- Los ejemplos no usan PII real ni datos sensibles.
- El cambio de contrato tiene trazabilidad en informe o decision documental si aplica.
- No se exponen detalles internos del modelo multi-tenant.

## Heuristica para revisar implementacion y spec

Busca y corrige estas señales:

- endpoints implementados sin decoradores o sin reflejo en OpenAPI
- campos documentados como opcionales cuando backend los exige
- respuestas 200 genericas para errores de dominio
- ejemplos con emails, documentos o telefonos reales
- contratos que filtran nombres de tablas, schemas o detalles internos
- cambios breaking sin versionado ni nota documental

## Anti-patrones

Evita:

- tratar OpenAPI como tarea secundaria que se actualiza despues si hay tiempo
- documentar seguridad de forma vaga
- publicar contratos que no coinciden con el codigo real
- usar ejemplos productivos o datos reales
- mezclar rutas de distintos bounded contexts sin una taxonomia clara

## Escalacion

Usa [ESCALACION AL CTO] si:

- un cambio contractual rompe integraciones sin estrategia de versionado
- se quiere exponer una API fuera del baseline REST aprobado
- el contrato requiere excepciones de seguridad o gobernanza no resueltas
