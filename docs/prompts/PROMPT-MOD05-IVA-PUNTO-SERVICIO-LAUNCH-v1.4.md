# LAUNCH — MOD05/MOD06/MOD07 · IVA por punto de servicio · Corrección S-T7-01

> **Superado el 2026-10-12** por [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md](PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md): T11 se relanza sin el arreglo del portal. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.4 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.3.md`
**Ola que lanza:** 3-bis — PII en auditoría de contratos (S-T7-01, causa transversal) · **Gates:** G4 vigente; G6 NO-GO hasta esta ola
**Cerrado, no re-despachar:** T1–T10 y T8 (GO). **Bloqueos abiertos:** ninguno para esta ola. D-PDF sigue pendiente del CTO y no bloquea.

| # | Subagente | Encargo | Skills a leer antes de empezar | Propiedad exclusiva |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.3 §2 T11 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `testing-patterns` | `audit/audit-sanitize.policy.ts` (+ spec), `crm/contracts/**` |
| 2 | `data-eng` | prompt v1.3 §2 T12 | `postgresql`, `backend-security-coder` | informe T12 y un script de consulta de solo lectura en `scripts/` |

**Paralelo:** los dos; T12 no escribe en ninguna base.
**Cierre de ola:** T11 con turbo API `--force`, integración sin PII en `audit_logs` y branches de `crm/contracts` ≥ 80 % sin la integración; T12 con conteos y propuesta. Después: `sec-eng` (solo S-T7-01) ∥ `gate-verifier` → G6.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.4, el informe `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T7-v1.0.md` (S-T7-01) y tu encargo `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.3.md` §1–§2 bloque `{T#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Trabaja solo dentro de tu propiedad exclusiva. No borres ni modifiques filas existentes de `audit_logs`. El árbol tiene cambios sin commitear de T1 a T10: no los reviertas.
> Si necesitas salir de tu propiedad o cambiar un contrato, emite `[BLOQUEO]` y para.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-{T#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.
