---
name: observability-engineer
description: Observabilidad para iWana neXt con logs utiles, metricas accionables, trazabilidad operativa y diseno gradual de monitoreo alineado al stack real del repo.
---

# Observability Engineer

## Proposito

Usa esta skill cuando necesites diseñar, revisar o mejorar observabilidad del sistema dentro del baseline real de iWana neXt.

El foco no es desplegar una plataforma enterprise completa por defecto. El foco es definir logs, metricas, alertas y trazabilidad operativa que sirvan al stack actual y a la evolucion esperada del sistema, sin inventar madurez inexistente.

## Cuando usarla

Activa esta skill para tareas como:

- Diseñar estrategia de logs, metricas o healthchecks.
- Definir SLIs o alertas basicas para componentes criticos.
- Revisar trazabilidad de errores, jobs o flujos sensibles.
- Preparar una siguiente ola de monitoreo o observabilidad operativa.
- Conectar operacion, auditoria y soporte con evidencia tecnica util.

## Reglas del repo

### 1. Observabilidad gradual y alineada al baseline

- Diseña sobre el stack real, no sobre una plataforma hipotetica.
- Prioriza señales utiles antes que tooling exuberante.
- Si una propuesta requiere nueva infraestructura relevante, documenta el gap y no la asumas como disponible.

### 2. Zero-trust PII tambien aplica a logs y metricas

- No registrar PII real, secretos, tokens ni payloads sensibles completos.
- Sanitizar eventos y errores antes de persistirlos o exportarlos.
- Trazabilidad si, fuga de datos no.

### 3. Tenant, boundaries y operaciones sensibles deben ser observables

- Si un flujo depende de tenant, la trazabilidad debe permitir aislar problemas sin mezclar tenants.
- Los jobs, retries, errores y operaciones de escritura sensibles deben dejar evidencia suficiente.
- No uses observabilidad para romper boundaries que el sistema no aprueba.

## Patrones preferidos

### Logs

- logs estructurados y consistentes
- correlation ids cuando aporten trazabilidad
- severidad y contexto operativo claros
- mensajes utiles para soporte y debugging real

### Metricas

- medir salud, latencia, error rate y backlog donde aplique
- priorizar señales ligadas a flujos criticos
- evitar metricas vanity sin accion asociada
- definir umbrales solo cuando haya criterio operativo razonable

### Alertas

- pocas, accionables y con propietario claro
- evitar ruido de alerta temprana sin runbook minimo
- preferir alertas ligadas a impacto de usuario o flujo critico

### Trazabilidad

- seguir request, job o evento a traves de capas cuando el caso lo amerite
- distinguir productor, consumidor y dependencia externa en procesos asincronos
- cruzar operacion con auditoria cuando haya escritura sensible

## Checklist de revision

- Los logs son utiles y no filtran datos sensibles.
- Existen señales minimas para detectar caidas, errores o degradacion.
- Los flujos criticos tienen trazabilidad razonable.
- Las alertas propuestas son accionables y no cosméticas.
- La estrategia es compatible con la madurez operativa real del repo.
- No se introducen dependencias no aprobadas sin dejarlo explicito.

## Heuristica para revisar implementaciones

Busca y corrige estas señales:

- logs ruidosos sin contexto o imposibles de correlacionar
- falta de visibilidad en jobs, retries o errores criticos
- metricas sin relacion con decisiones operativas
- alerts pensadas para impresionar, no para actuar
- payloads completos o secretos volcados en logs
- trazabilidad que mezcla tenant o modulo de forma ambigua

## Anti-patrones

Evita:

- implantar observabilidad enterprise como requisito inmediato sin roadmap real
- medir todo y entender nada
- usar dashboards como sustituto de runbooks o criterios operativos
- registrar datos sensibles por conveniencia de debugging
- proponer tooling de observabilidad fuera del baseline sin dejar la dependencia explicita

## Escalacion

Usa [ESCALACION AL CTO] si:

- una propuesta de observabilidad exige nueva infraestructura relevante o cambio de stack
- la estrategia requerida choca con restricciones de seguridad o cumplimiento
- existe necesidad de monitoreo transversal que cambie la forma de operar el sistema
