---
name: mermaid-expert
description: Diagramas Mermaid para iWana neXt orientados a modulith, flujos de negocio, ADRs, integraciones y documentacion tecnica consistente.
---

# Mermaid Expert

## Proposito

Usa esta skill cuando necesites representar visualmente arquitectura, boundaries, procesos, secuencias, ERDs o decisiones tecnicas del proyecto.

El objetivo no es dibujar por dibujar. El objetivo es producir diagramas Mermaid que sirvan a PRDs, HLDs, ADRs, informes y prompts operativos del repo sin contradecir la arquitectura aprobada.

## Cuando usarla

Activa esta skill para tareas como:

- Diagramas de arquitectura del modulith.
- Flujos de autenticacion, tenant resolution o auditoria.
- Secuencias de APIs, jobs o eventos de dominio.
- ERDs o mapas de entidades dentro de un bounded context.
- Visualizacion de fases, dependencias o hitos en documentos operativos.

## Reglas del repo

### 1. Diagramar el sistema real, no una arquitectura aspiracional

Todo diagrama debe respetar:

- modulith como base
- boundaries explicitos
- multi-tenancy por schema PostgreSQL
- stack aprobado
- trazabilidad con el documento donde vive

No dibujes microservicios, brokers o capas que el repo no haya aprobado solo porque el diagrama se vea mas sofisticado.

### 2. Un diagrama debe responder una pregunta concreta

Antes de diagramar, define que debe entender el lector:

- estructura de modulos
- secuencia de un flujo
- dependencia entre artefactos
- relacion de entidades
- cronologia de una fase o entrega

Si no hay una pregunta clara, el diagrama probablemente sobra.

### 3. Prioriza legibilidad documental

- nombres cortos y consistentes
- pocos nodos por diagrama cuando sea posible
- separar diagramas si el tema crece
- evitar estilos recargados o colores arbitrarios

## Tipos de diagrama recomendados

### Flowchart

Util para:

- flujos operativos
- decisiones de negocio
- pipelines documentales
- secuencias de aprobacion o escalacion

### Sequence Diagram

Util para:

- request y response entre UI, API y modulos
- login, refresh token y MFA
- jobs, eventos y confirmaciones
- interacciones entre actor, gateway, servicio y persistencia

### ER Diagram

Util para:

- entidades dentro de un modulo
- relaciones y cardinalidades principales
- boundaries de datos antes de aterrizar migraciones

Evita usar ERD para mezclar todo el sistema si eso borra los limites del modulith.

### State Diagram

Util para:

- estados de negocio
- lifecycle de sesiones, tickets o recursos
- transiciones con validaciones o eventos relevantes

### Gantt o Timeline

Util para:

- fases de modulo
- dependencias de sprint
- hitos documentales o entregables

## Convenciones sugeridas para este repo

- Nombra modulos con la terminologia real del proyecto.
- Si el diagrama toca tenancy, deja explicito donde se resuelve el tenant.
- Si toca seguridad, deja claro donde ocurre autenticacion, autorizacion y auditoria.
- Si toca datos, evita representar acceso cruzado a tablas de otro modulo como si fuera normal.
- Si acompaña un ADR, el diagrama debe reforzar la decision, no introducir otra arquitectura diferente.

## Checklist de calidad

- El tipo de diagrama corresponde a la pregunta que debe responder.
- El diagrama respeta modulith, tenancy y stack aprobado.
- Los nombres son coherentes con el repo.
- La complejidad visual esta contenida.
- El diagrama sirve al documento y no lo contradice.
- Si hay color o estilo, mejora lectura en vez de distraer.

## Heuristica para revisar diagramas

Busca y corrige estas señales:

- microservicios dibujados sin soporte documental
- cajas genericas como "Core" o "Service Layer" sin valor explicativo
- demasiados nodos en un solo bloque ilegible
- flujos sin actor inicial o sin resultado claro
- entidades mezcladas de distintos bounded contexts sin delimitar
- diagramas que ocultan donde se autentica, audita o resuelve tenant pese a ser parte del problema

## Anti-patrones

Evita:

- usar Mermaid como sustituto de una decision arquitectonica aun no tomada
- diagramas enormes para impresionar en lugar de aclarar
- colores y estilos arbitrarios sin significado documental
- copiar ejemplos genericos de internet sin adaptarlos al repo
- usar un ERD global para justificar acoplamiento entre modulos

## Resultado esperado

Cuando uses esta skill, entrega:

- el bloque Mermaid listo para renderizar
- una breve nota de que representa
- si aplica, una recomendacion de dividir el diagrama si crece demasiado
