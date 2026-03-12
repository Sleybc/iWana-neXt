---
name: bullmq-specialist
description: Patrones BullMQ para iWana neXt con Redis, jobs idempotentes, payloads seguros, trazabilidad por tenant y procesamiento asincrono confiable.
---

# BullMQ Specialist

## Proposito

Usa esta skill cuando necesites diseñar, implementar o revisar colas y jobs con BullMQ dentro del stack real de iWana neXt.

El foco no es BullMQ en abstracto. El foco es usar Redis + BullMQ en un modulith NestJS para procesos asincronos confiables, idempotentes, auditables y compatibles con tenancy, boundaries y seguridad del repo.

## Cuando usarla

Activa esta skill para tareas como:

- Jobs diferidos, reintentos o procesamiento en background.
- Flujos asincronos de notificacion, auditoria, provisioning o integraciones.
- Workers y colas con control de concurrencia y observabilidad.
- Recuperacion de jobs fallidos, DLQ o retries.
- Revision de payloads, trazabilidad o acoplamiento entre productor y consumidor.

## Reglas del repo

### 1. Un job no rompe boundaries

- Un productor no debe acoplarse a internals de otro modulo.
- El payload del job debe representar un contrato estable y minimo.
- Si un job cruza modulos, debe hacerlo por interfaz o evento de dominio bien definido.

### 2. Idempotencia obligatoria en procesos sensibles

Todo flujo financiero, de provisioning, auditoria o integracion sensible debe asumir:

- retries reales
- duplicados posibles
- procesamiento tardio
- reejecucion tras reinicio o error

Si el job no es idempotente, no esta listo.

### 3. Tenant y contexto deben ser explicitos

Si el flujo depende de tenant:

- el contexto necesario debe viajar de forma segura
- nunca debe inferirse de forma ambigua en el worker
- no deben hardcodearse schemas, tenants ni rutas de datos

### 4. Payloads pequenos y seguros

- No envies objetos gigantes ni snapshots completos de entidades.
- Prefiere ids, claves de correlacion y contexto minimo necesario.
- No pongas PII sensible, secretos ni tokens en el payload si no es imprescindible.

## Patrones preferidos

### Productores

- Encolar desde servicios de aplicacion, no desde capas aleatorias.
- Definir nombres de cola y job de forma estable.
- Adjuntar metadata util para trazabilidad, no para duplicar estado.

### Consumers y workers

- Validar payload al entrar al worker.
- Rehidratar datos necesarios desde fuentes seguras si hace falta.
- Aplicar limites de concurrencia y retry coherentes con el dominio.
- Registrar resultado, error y correlacion sin exponer datos sensibles.

### Retries y fallos

- Retry con criterio, no infinito por defecto.
- Separar errores transitorios de errores definitivos.
- Definir DLQ o manejo equivalente para jobs no recuperables.
- Evitar loops de reencolado sin control.

### Observabilidad

- Usar correlation ids o job ids trazables.
- Medir fallos, retries, latencia y backlog.
- Distinguir claramente productor, worker y dependencia externa en el diagnostico.

## Checklist de implementacion

- El job tiene nombre y contrato claros.
- El payload es minimo, seguro y validable.
- El procesamiento es idempotente si el dominio lo exige.
- El contexto de tenant esta resuelto sin ambiguedad.
- Existe estrategia de retry y fallo terminal.
- Los logs permiten rastrear ejecucion sin filtrar PII o secretos.
- El flujo no rompe boundaries entre modulos.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- payloads con entidades completas o demasiados campos
- workers que escriben directamente en tablas de otros modulos
- retries infinitos o demasiado agresivos
- jobs que dependen de estado efimero del proceso emisor
- falta de idempotencia en operaciones de negocio sensibles
- errores permanentes tratados como transitorios

## Anti-patrones

Evita:

- usar BullMQ para disfrazar acoplamiento entre modulos
- meter logica de negocio compleja y no testeada dentro del processor
- asumir que el job corre exactamente una vez
- usar Redis como deposito de datos persistentes del dominio
- esconder fallos reales detras de retries interminables

## Escalacion

Usa [ESCALACION AL CTO] si:

- el flujo asincrono compromete idempotencia o trazabilidad obligatoria
- se propone una arquitectura de colas fuera del baseline Redis + BullMQ
- el diseño rompe aislamiento multi-tenant o boundaries del modulith
