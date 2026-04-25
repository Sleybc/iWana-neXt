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

## Referencias

- `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md`
- `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-03-v1.0.md`
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
