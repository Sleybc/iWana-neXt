# MOD13 — Red y Aprovisionamiento · Especificación UX

**Versión:** 1.0 · **Fecha:** 2026-10-22 · **Estado:** En revisión · **Contrato:** HLD-MOD13 Fase 01 v1.0 congelado

## [BLOQUEO] Identidad de quien certificó

**Referencias:** [PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md) §5, RF-NET-14; [HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md) §3.2, §4, §6.5 y §9.

El flujo «Servicio técnico» debe mostrar quién certificó y cuándo. El HLD persiste `certified_by` como UUID y `certified_at`, pero no define un campo de identidad legible para la persona que certificó. Además, §6.5 solo referencia `ServiceProvisioningDto` sin especificar su forma ni cómo resolver ese UUID a una etiqueta visible.

No es posible especificar ese contenido sin asumir que el UUID es una identidad para mostrar o inventar un campo, contrato o consulta. P0 se detiene aquí conforme al contrato congelado. Se requiere resolverlo mediante una resincronización versionada del HLD antes de completar los flujos y estados UX.
