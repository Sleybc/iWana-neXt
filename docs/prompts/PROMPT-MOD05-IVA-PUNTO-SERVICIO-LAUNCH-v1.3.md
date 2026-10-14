# LAUNCH — MOD05/MOD06/MOD07 · IVA por punto de servicio · Cierre (Ola 3)

> **Superado el 2026-10-12** por [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.4.md](PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.4.md): el cierre dio NO-GO por S-T7-01. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.3 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.2.md` §4 (con v1.0 §3 y v1.1 §3) · **Spec:** v1.0 ratificada (§8, §8.1)
**Ola que lanza:** Ola 3 — revisión de seguridad y evidencia de calidad → G6 de la fase · **Gates:** G4 vigente
**Cerrado, no re-despachar:** T1 a T6, T9 y T10 (verificados contra el árbol; sin commitear). **Bloqueos abiertos:** ninguno. La decisión sobre PDF (plan §Estado, D-PDF) no bloquea este cierre.

| # | Subagente | Encargo | Skills a leer antes de empezar | Revisa |
| --- | --- | --- | --- | --- |
| 1 | `sec-eng` | prompt v1.2 §4 + puntos R1–R4 del plan §Estado | `security-auditor`, `backend-security-coder`; apoyo: `frontend-security-coder` (carga del soporte) | diff completo T1–T10 contra C-TAX-1, C-DDL-2 y C-API-3 v1.2 |
| 2 | `sr-qa` | prompt v1.0 §3 T8 | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | 23 CA ↔ test; tabla de verdad; cobertura ≥ 80 % en stmts y branches de `taxation`, `crm/contracts` y `commercial` |

**Paralelo:** los dos; ambos de solo lectura sobre el código productivo (`sr-qa` solo escribe tests si falta cobertura, dentro de los specs de esos tres módulos).
**Cierre:** después, `boundary-reviewer` ∥ `contract-drift-reviewer` ∥ `gate-verifier` ∥ `docs-governance`. Con todos en GO → G6 de la fase y cierre de SUB-C03.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-093, el plan v1.3 (§Estado, incluidos R1–R4 y D-PDF), la spec ratificada y tu encargo (prompt v1.2 §4; v1.0 §3 T7/T8; v1.1 §3).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques código productivo ni contratos. Un hallazgo que exija código se reporta como bloque nuevo para su dueño. El árbol tiene cambios sin commitear de T1 a T10: no los reviertas.
> Cierras con veredicto GO/NO-GO y evidencia con `archivo:línea` o conteo real (`pnpm exec turbo run test --filter=<paquete> --force`).
> Reporta en `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-{T7|T8}-v1.0.md` con hallazgos o deuda por severidad.
