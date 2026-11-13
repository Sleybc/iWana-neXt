# LAUNCH — MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP · v1.1

Rige `AGENTS.md`. **Plan:** [docs/plans/2026-11-13-mod05-mod14-facturacion-en-la-ficha.md](../plans/2026-11-13-mod05-mod14-facturacion-en-la-ficha.md) v1.1 · **Spec:** [docs/specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md](../specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md) v1.1 · Sustituye a la v1.0 (c8c06f8a).
**Ola que lanza:** Ola 1 (las olas 2 y 3 se ejecutan desde el plan §3 en la misma sesión) · **Gates verificados:** G0 ✅ sobre v1.0 · G1–G4 sin registro: el encargo es el plan §2
**Bloqueos abiertos:** ninguno, una vez reafirmado G0 sobre el spec v1.1

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §2 W0 | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | — (solo lectura) |
| 2 | `sr-backend` | Plan §2 A · migración 207 | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | Produce `billing-payments.contract.ts` |
| 3 | `sr-backend` | Plan §2 B · migración 208 | las de A + `bullmq-specialist` | Produce `billing-accounts.contract.ts` (aditivo) y los contratos de correo |

**Paralelo:** 1, 2 y 3. Restricción de secuencia: B no toca `billing-payments.*` ni `allocation.ts`, y registra en `runner.ts`, `billing.module.ts` y `packages/shared/.../index.ts` solo después de que A cierre.
**Cierre de ola:** suite completa de `api` sin caché con conteo real, integración con `DB_NAME=test` y `migration-order.spec.ts` en verde; contratos de la ola 1 registrados en el informe como contrato congelado de la ola 2. Sin commit hasta el final de la fase.

---

### Bloque copiar-pegar

```text
Rige AGENTS.md. Ejecuta la fase «Facturación en la ficha estilo UISP» con executing-plans (modo subagente).
Lee el plan docs/plans/2026-11-13-mod05-mod14-facturacion-en-la-ficha.md v1.1 y el spec v1.1; el plan §2 es el encargo de cada bloque.
Ola 1 en paralelo: sr-qa W0 · sr-backend A (migración 207, dueño de billing-payments.*) · sr-backend B (migración 208, archivos nuevos; registra runner/módulo/index después de A).
Olas 2 y 3 desde el plan §3, en esta sesión. Reglas del plan §1; fuera del commit, plan §6.
Un commit y push al final; CI de main y G6.5 en docs/informes/INFORME-MOD05-MOD14-FACTURACION-FICHA-CIERRE-v1.0.md.
```
