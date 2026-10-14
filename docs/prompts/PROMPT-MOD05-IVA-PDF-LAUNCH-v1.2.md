# LAUNCH — MOD05 · Verificación consolidada IVA + D-PDF (cierre antes del commit)

> **Superado el 2026-10-14** por [PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md](PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md): la Ola 3 cerró con NO-GO por OpenAPI e integración. No relanzar desde este archivo.

**Planes:** `docs/plans/2026-10-12-mod05-iva-soporte-pdf.md` v1.2 · `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.7 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md` §2 Ola 3
**Ola que lanza:** Ola 3 de D-PDF + re-confirmación del G6 de IVA sobre el árbol consolidado · **Gates:** G4 vigente
**Cerrado, no re-despachar:** P1, P2, P3 y T1–T12. **Estado de `dbiw` verificado por AI-EM-ARCH:** CHECK original restaurado, 0 assets `stratum_evidence`, 0 registros de la 026.
**Bloqueos abiertos:** ninguno. Todos los revisores son de solo lectura sobre el código productivo.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| 1 | `gate-verifier` | `tsc`, lint y `turbo --force` en `@iwana/api`, `@iwana/portal`, `@iwana/shared` y `@iwana/db`; integración de contratos en `dbiw` con `E2E_TENANT_SLUG=iwana`; lista de rutas de los dos commits | (agente con sus propias reglas) | adenda 2 del informe G6 de IVA + informe de gates |
| 2 | `sec-eng` | Prompt D-PDF §2 Ola 3: C-MEDIA-1, bytes mágicos de PDF, cierre de S-T7-02 y S-T7-03, severidad de la falta de antivirus | `security-auditor`, `backend-security-coder`; apoyo: `frontend-security-coder` | GO/NO-GO |
| 3 | `sr-qa` | Matriz de los stop/go de P1–P3 ↔ test; cobertura ≥ 80 % en statements y branches de `media` y `crm/contracts`, sin caché | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | GO/NO-GO |

**Paralelo:** los tres.
**Cierre:** los tres en GO → G6 de D-PDF y G6 de IVA re-confirmado → commit del CTO (dos commits) → G6.5 por SHA en CI.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, los dos planes (D-PDF v1.2 y IVA v1.7, sección de estado), el prompt `docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md` y los informes de P1, P2, P3 y T11 v1.2.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Solo lectura sobre el código productivo y los contratos; no apliques migraciones en `dbiw` ni crees bases. `sr-qa` solo escribe tests si falta cobertura. El árbol tiene unas 150 rutas sin commitear: no las reviertas.
> Verifica que la ruta de tu informe esté libre antes de escribirlo. Cierras con veredicto GO/NO-GO y evidencia con `archivo:línea` o conteo real sin `cache hit`.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PDF-{GATES|SEC|QA}-v1.0.md` con hallazgos o deuda por severidad.
