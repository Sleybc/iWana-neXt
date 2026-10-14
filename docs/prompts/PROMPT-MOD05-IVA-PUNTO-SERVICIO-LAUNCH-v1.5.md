# LAUNCH — MOD05/MOD06/MOD07 · IVA por punto de servicio · Relanzamiento de T11

**Plan:** `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.5 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md` (con v1.3 §1–§3)
**Ola que lanza:** 3-bis, relanzamiento de T11 sin el arreglo del portal · **Gates:** G4 vigente; G6 NO-GO hasta T11 y su re-verificación
**Cerrado, no re-despachar:** T1–T10, T8 (GO) y T12 (entregado; sus conteos los completa el CTO con el script de solo lectura, sin bloquear G6).
**Secuencia:** corre en paralelo con la Ola 1 de D-PDF (`PROMPT-MOD05-IVA-PDF-LAUNCH-v1.0.md`). P2 de D-PDF espera a que T11 cierre.

| # | Subagente | Encargo | Skills a leer antes de empezar | Propiedad exclusiva |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.4 §1 (T11 de v1.3 §2, sin el helper del portal) | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `testing-patterns` | `audit/audit-sanitize.policy.ts` (+ spec), `crm/contracts/**` |

**Cierre de ola:** turbo API `--force` con conteo real; integración sin PII fiscal en `audit_logs`; `crm/contracts` ≥ 80 % de branches sin contar la integración. Después: `sec-eng` (solo S-T7-01) ∥ `gate-verifier` → G6.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan v1.5, el informe T7 (S-T7-01), tu informe previo `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.0.md` y tu encargo: `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md` §0–§1 sobre v1.3 §2 T11.
> Antes de escribir código lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Tu `[BLOQUEO]` está resuelto: el tipo de `contractsApi.create` del portal ya **no** es tuyo (pasó a D-PDF P3). No toques `apps/portal/**`.
> Trabaja solo en tu propiedad exclusiva; no borres ni modifiques filas existentes de `audit_logs`. El árbol tiene cambios sin commitear: no los reviertas.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.1.md` con ruta, conteo real y deuda nueva por severidad.
