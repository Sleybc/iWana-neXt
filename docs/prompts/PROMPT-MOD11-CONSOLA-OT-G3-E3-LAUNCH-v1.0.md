# LAUNCH — MOD11 · Consola de OT · Dictamen G3 + Origen E3

**Plan:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1
**Gates:** G1 cerrado · **G2 cerrado (2026-10-05)** · G3 abierto: lo cierra el bloque 1 · G4 emitido para los dos bloques
**Cerrado, no re-despachar:** Ola 1, hotfix de ventana nula, R0 (UX v1.1), R1 (contrato v1.0 y tablas v1.2), origen E1/E2, corrección T0/T2, acta T1, línea de tiempo T1.
**Re-sync:** tablas operativas **v1.2** supera a la v1.1. Consumen la nueva versión `fe-platform` y `sr-qa`.

| # | Subagente | Encargo | Skills a leer | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md` (dictamen, sin código) | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `wcag-audit-patterns` | UX v1.1 · componente v1.0 · tablas v1.2 · `execution-orders.ts` v1.4 |
| 2 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-v1.0.md` | `nestjs-expert`, `bullmq-specialist`, `typescript-expert`, `testing-patterns` | `execution-orders.ts` v1.4 |

**Paralelo:** sí. El bloque 1 lee el portal y el 2 escribe el backend, así que no comparten archivo.
**Secuencia:** corrección T1 **no** se lanza hasta que E3 esté en GO, porque ambos tocan `execution-orders.service.ts`.
**Cierre:** dictamen G3 en GO y E3 en GO. Después, AI-EM-ARCH emite los prompts y el launcher de la Ola 2b (R2-R4 + E4-portal), y por separado los datos de E4 (`sr-backend`).

---

### Bloque copiar-pegar — `fe-platform` (G3)

> Actúa como `fe-platform`. Lee `AGENTS.md`, el plan de consola v1.2 y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md` completo.
> Antes de escribir lee los `SKILL.md` de `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components` y `wcag-audit-patterns`.
> Emite el dictamen de factibilidad G3 sobre la UX v1.1, el contrato de componente v1.0 y tablas v1.2. Responde las ocho preguntas del §2 con evidencia de código: transporte y `expiresAt` de la firma, librería frente a canvas nativo, corte del drawer de 92 KB sin archivos compartidos, refetch selectivo, custodia bajo demanda, tipos del api-client, copy duplicado y regresión.
> No escribas código de producción, no instales dependencias y no toques contratos. Si un contrato es infactible, `[BLOQUEO]` citando ruta y sección.
> Entrega `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md`, con el corte propuesto para la Ola 2b.

### Bloque copiar-pegar — `sr-backend` (E3)

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1 y tu encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-v1.0.md` completo.
> Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `bullmq-specialist`, `typescript-expert` y `testing-patterns`.
> Una OT despachada sin cita recibe ventana desde MOD09: se crea el evento, el chequeo de conflicto corre **sin excepción** (ADR-091 §D4) y se vincula a la OT existente sin crear otra. Después, la propagación de ADR-068 opera igual que siempre.
> MOD09 no escribe tablas de MOD11: el vínculo va por un puerto tipado o un evento BullMQ, justificado. Fuera de alcance: datos de E4, T1 y portal.
> Cierras con el §6 del encargo en GO: CA-09 probado por negación, CA-10 y CA-11, Postgres real, `tasks` ≥ 676 con `Cached: 0` y la suite completa terminando sola.
