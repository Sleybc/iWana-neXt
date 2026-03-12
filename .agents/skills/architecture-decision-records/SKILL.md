---
name: architecture-decision-records
description: Guia practica para escribir y mantener ADRs alineados a iWana neXt, su stack aprobado y su gobernanza documental.
---

# Architecture Decision Records

## Proposito

Usa esta skill cuando la tarea requiera documentar una decision tecnica significativa o revisar un ADR existente dentro de iWana neXt.

En este repo, un ADR no es documentacion ornamental. Sirve para dejar trazabilidad de decisiones que afectan stack, boundaries, seguridad, multi-tenancy, integraciones, despliegue, cumplimiento o politica de ejecucion modular.

## Cuando crear o actualizar un ADR

Crea o actualiza un ADR cuando ocurra alguno de estos casos:

- Cambio o excepcion sobre el stack base aprobado.
- Decision que afecte boundaries entre modulos o el modulith.
- Cambio en estrategia multi-tenant, persistencia o acceso a datos.
- Introduccion de un patron transversal relevante: colas, eventos, cache, auditoria, observabilidad, autenticacion.
- Cambio operativo que afecte despliegue, pipelines o runtime del sistema.
- Conflicto entre alternativas tecnicas con impacto de largo plazo.

No abras ADR para cambios pequenos de implementacion local sin impacto estructural.

## Fuentes obligatorias

Antes de redactar, revisa como minimo:

- AGENTS.md
- PRD vigente del sistema o del modulo
- HLD del modulo, si existe
- ADRs ya aprobados relacionados
- Stack_Tecnologico.md
- Plan o informe vigente si la decision nace de una fase en ejecucion

Si falta una fuente critica, dejalo explicito. No inventes contexto.

## Enfoque para iWana neXt

Toda decision debe evaluarse contra estas restricciones base:

- Arquitectura modulith con boundaries explicitos.
- Multi-tenant por schema PostgreSQL desde el inicio.
- NestJS, Next.js App Router, TypeORM, Turborepo, Redis/BullMQ, OpenAPI y Docker on-prem como baseline.
- Sin acceso directo a tablas de otro modulo.
- Sin imports circulares entre bounded contexts.
- Seguridad, auditoria y cumplimiento como criterios de decision, no anexos.

## Estructura recomendada

Usa una estructura corta, concreta y auditable:

### 1. Titulo

Debe describir la decision, no el problema de forma vaga.

Ejemplos:

- Mantener multi-tenancy por schema PostgreSQL para modulos core
- Usar TypeORM con migraciones versionadas en el backend NestJS
- Mantener despliegue MVP en Docker on-prem

### 2. Estado

Usa uno de estos estados:

- Propuesto
- Aprobado
- Reemplazado
- Deprecado

### 3. Contexto

Describe solo el contexto relevante:

- Restricciones del negocio o del modulo.
- Limites del stack aprobado.
- Problema real que fuerza la decision.
- Riesgos si no se decide.

### 4. Decision

Declara la decision en lenguaje directo.

### 5. Consecuencias

Separa consecuencias positivas, costos y tradeoffs:

- Beneficios tecnicos y operativos.
- Costos de implementacion o mantenimiento.
- Riesgos aceptados.
- Impacto en testing, OpenAPI, migraciones, despliegue o documentacion.

### 6. Referencias

Incluye PRD, HLD, ADRs previos, informes o planes relacionados.

## Plantilla breve sugerida

```md
# ADR-XXX-Titulo-De-La-Decision

## Estado

Aprobado

## Contexto

Se requiere resolver ...
Las restricciones vigentes del sistema son ...
La alternativa debe respetar ...

## Decision

Se adopta ...

## Consecuencias

### Positivas

- ...

### Costos y tradeoffs

- ...

### Riesgos aceptados

- ...

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD\_...
- docs/hlds/HLD-...
```

## Criterios de calidad

Un ADR bueno en este repo:

- Explica una decision real y verificable.
- Aterriza la decision al stack y a las restricciones del proyecto.
- Hace explicitos los tradeoffs.
- Permite entender por que se eligio una alternativa y no otra.
- Deja claro si la decision exige cambios en codigo, pruebas, infraestructura o documentacion.

## Ejemplos de decisiones que si ameritan ADR aqui

- Confirmar o cambiar el patron multi-tenant por schema.
- Introducir una estrategia de eventos de dominio entre modulos.
- Cambiar la politica de colas BullMQ o Redis para procesos core.
- Definir estrategia de auditoria para operaciones sensibles.
- Aprobar una variacion en despliegue fuera del baseline Docker on-prem.

## Ejemplos de decisiones que normalmente no ameritan ADR

- Renombrar un servicio interno.
- Reordenar archivos sin cambio de responsabilidad.
- Ajustar una prueba local o un mock sin impacto estructural.
- Cambiar estilos de un componente aislado sin efecto transversal.

## Anti-patrones

Evita:

- ADRs genericos que no mencionan el stack real del repo.
- Contextos inflados con historia irrelevante.
- Decisiones ambiguas que no dicen que se adopta.
- Documentar tecnologia fuera del baseline sin pedir escalacion o aprobacion.
- Usar ejemplos ajenos al proyecto como MongoDB, Prisma o microservicios por defecto cuando no aplican al baseline actual.
