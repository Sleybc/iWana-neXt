# ADR-027 — Conversión Expediente → Subscriber en dos etapas

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17

## Contexto

MOD05 requiere desacoplar el cierre del expediente de la activación final del subscriber, manteniendo trazabilidad y operación multi-tenant por schema.

## Decisión

Se adopta una conversión **two-stage** por eventos de dominio intra-módulo CRM:

1. `LISTO_PARA_INSTALACION` emite `crm.expediente.ready-for-installation` y crea/reutiliza subscriber `PROSPECT` idempotente por `expedienteId`.
2. `CLIENTE_ACTIVO` emite `crm.expediente.activated` y promueve `PROSPECT → ACTIVE` asignando `activatedAt`.
3. `DESCARTADO` emite `crm.expediente.discarded` y cancela automáticamente subscriber `PROSPECT` vinculado.

La transición del expediente **no se revierte** si falla el downstream de subscriber; el fallo se registra para reintento operativo.

## Consecuencias

1. Se agrega trazabilidad en `subscribers`: `expediente_id`, `converted_at`, `activated_at`, `manual_override_reason`.
2. Se formaliza orquestación intra-módulo con `EventEmitter2` sin introducir BullMQ.
3. Se habilita contrato 360° con `expedienteSummary` y `timelineSeed`.

## Alternativas descartadas

1. Conversión directa en `CLIENTE_ACTIVO`: pierde visibilidad operacional de prospecto post-venta.
2. Llamadas directas servicio→servicio sin eventos: mayor acoplamiento y menor extensibilidad.

## Aclaración (2026-10-15, AI-EM-ARCH)

No cambia la decisión. Tras emitir un evento del pipeline, el emisor puede hacer una **lectura de postcondición** (por ejemplo, comprobar con `SubscribersService.findByExpedienteId` que exista el suscriptor esperado) para decidir si el fallo queda registrado para reintento. Esa lectura está permitida porque:
- es de **solo lectura** y no reemplaza la orquestación por eventos;
- ocurre dentro del mismo bounded context CRM, donde `ExpedienteService` ya depende de `SubscribersService`.

La alternativa descartada n.º 2 se refiere a **escrituras** directas en lugar de eventos. Origen: hallazgo SEC-G4-03 de E-3 ([prompt E-3 §8](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md)).

## Referencias

- `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md`
- `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-03-v1.0.md`
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
