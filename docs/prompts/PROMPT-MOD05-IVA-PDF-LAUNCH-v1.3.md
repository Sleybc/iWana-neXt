# LAUNCH — MOD05 · IVA + D-PDF · Cierre: P4 (OpenAPI) → gate delta

**Plan:** `docs/plans/2026-10-12-mod05-iva-soporte-pdf.md` v1.3 (§Estado: disposición de la Ola 3) · **Informes de entrada:** `INFORME-MOD05-IVA-PDF-{GATES,SEC,QA}-v1.0.md`
**Ola que lanza:** micro-ola de cierre, **secuencial** (paso 2 tras paso 1) · **Gates:** SEC en GO; QA y gates en NO-GO solo por las causas (a) y (b) del plan
**Cerrado, no re-despachar:** P1–P3, T1–T12, `sec-eng` y `sr-qa`. **No alterar `dbiw`:** la evidencia de integración es la corrida 19/19 de P2 más G6.5 en CI (decisión del plan v1.3).

| Paso | Subagente | Encargo | Skills | Salida |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | **P4:** corregir el `ApiBody` de `POST /crm/contracts/:id/stratum-evidence` (`contracts.controller.ts:241-242`) para que diga PDF, JPEG, PNG o WEBP, máximo 10 MiB, y documentar el 422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED`. Nada más | `openapi-spec-generation`, `nestjs-expert` | `INFORME-MOD05-IVA-PDF-P4-v1.0.md` |
| 2 | `gate-verifier` | Delta: OpenAPI del endpoint; `tsc`, lint y `turbo --force` de `@iwana/api`; identificar las suites omitidas de la corrida amplia; Adenda 2 del G6 de IVA | (sus propias reglas) | `INFORME-MOD05-IVA-PDF-GATES-v1.1.md` + Adenda 2 |

**Cierre:** paso 2 en GO → AI-EM-ARCH consolida el G6 de D-PDF y re-confirma el G6 de IVA → commit del CTO (116 rutas de código + 41 de documentación) → G6.5.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-12-mod05-iva-soporte-pdf.md` v1.3 (§Estado) y los informes `INFORME-MOD05-IVA-PDF-GATES-v1.0.md` y `-SEC-v1.0.md`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Haz solo tu paso. No apliques migraciones, no crees bases ni alteres `dbiw`. El árbol tiene unas 157 rutas sin commitear: no las reviertas.
> Verifica que la ruta de tu informe esté libre antes de escribirlo. Cierra con conteo real sin `cache hit` y GO/NO-GO.
