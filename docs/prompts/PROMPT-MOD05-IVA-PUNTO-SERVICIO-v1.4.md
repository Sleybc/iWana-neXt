# PROMPT DE EJECUCIÓN — MOD05/MOD06/MOD07 · IVA de internet por punto de servicio (ADR-093)

**Version:** 1.4 — sucede a [v1.3](PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.3.md) (superado). v1.0–v1.3 siguen siendo fuente de lo que esta versión no cambia
**Estado:** Emitido — G4 vigente
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md) v1.5 · **Fase hermana:** [D-PDF](../plans/2026-10-12-mod05-iva-soporte-pdf.md)

## 0. Resolución de los bloqueos de la Ola 3-bis

| Bloqueo | Causa | Decisión AI-EM-ARCH |
| --- | --- | --- |
| **T11** `[BLOQUEO]` | v1.3 §2.3 asignó a T11 corregir el tipo de `contractsApi.create` (`apps/portal/src/lib/api-client.ts:6582-6587`), que está **fuera** de su propiedad de backend. **Defecto del emisor** | Se **retira de T11** y pasa al bloque P3 (`fe-platform`) de la fase D-PDF, que ya toca ese archivo. Es un menor de deriva y no bloquea el G6 de esta fase. T11 se relanza con el resto del alcance de v1.3 §2 sin cambios: sanitizador, `@SkipAudit` con evento explícito, alineación de `planId` en el backend y tests de ramas |
| **T12** conteos N/D | `postgres-dev` no estaba disponible en la sesión. El script `scripts/audit-contract-fiscal-pii-readonly.sql` está verificado como de solo lectura (`BEGIN TRANSACTION READ ONLY`, sin DML ni DDL, exige el rol `iwana_readonly`) | **No se re-despacha T12.** Los conteos los obtiene el CTO ejecutando el script con el rol de solo lectura, o se relanza T12 cuando `postgres-dev` vuelva a conectar. **No bloquea G6**: el defecto de código lo cierra T11; el inventario solo alimenta la decisión sobre la redacción histórica |

## 1. Bloque relanzado

### T11 · `sr-backend` — v1.3 §2 T11, pasos 1, 2 y 4, más el paso 3 solo en el backend

La propiedad exclusiva no cambia: `audit/audit-sanitize.policy.ts` y su spec, y `crm/contracts/**`.

El paso 3 queda reducido a **alinear la validación de `planId`** entre `POST /crm/contracts` y la creación desde expediente, en el backend. El tipo del helper del portal ya no es de T11.

**Stop/go:** el de v1.3 §2 T11, sin cambios.

**Restricción de secuencia:** T11 tiene la propiedad de `crm/contracts/**`. El bloque P2 de D-PDF, que también toca `crm/contracts`, **no arranca hasta que T11 cierre**.

## 2. Re-verificación y G6 (tras T11)

Sin cambios respecto a v1.3 §3: `sec-eng` revisa solo S-T7-01, en paralelo con `gate-verifier`.
