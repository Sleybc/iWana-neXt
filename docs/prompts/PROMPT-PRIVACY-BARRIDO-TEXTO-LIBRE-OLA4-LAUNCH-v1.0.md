# LAUNCH — privacy · Barrido de texto libre · Ola 4 (B5)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.2 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.1, Aprobada
**Ola que lanza:** 4, B5 · **Gates:** G2 ✅ y G3 ✅ 2026-11-07 (Olas 2 y 3, sin commit)
**Bloqueos abiertos:** [BLOQUEO] B3-R3 debe estar hecho: `reencrypt-aes.pii.postgres.integration.spec.ts` con los tres proveedores nuevos y 5/5 en base `iwana_it_g7_*`.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sec-eng` | Alcance de tickets, D-BT-1, D-BT-7 y D-BT-8; ninguna otra ruta de lectura del texto | `security-auditor`, `backend-security-coder` |
| 2 | `test-change-reviewer` | CA-BT-15: toda expectativa cambiada en Olas 1 a 3 | — |
| 3 | `boundary-reviewer` | Diff completo, sobre todo participantes nuevos y puerto CRM de D-BT-7 | — |
| 4 | `contract-drift-reviewer` | `SUPPLIER_PROFILE_LINKED` en `packages/shared`, OpenAPI y portal | — |
| 5 | `gate-verifier` | CA-BT-16; suites completas de `apps/api` sin caché; typecheck y lint | — |

**Paralelo:** los cinco, solo lectura. **Siguiente:** commit y push, G6.5 y B6.
**Cierre de ola (G6):** sin hallazgos abiertos de severidad P1 o mayor; CA-BT-15 y 16; suites completas en verde.
**Reglas:** solo lectura, `main`, cero PII, nunca `tenant_iwana`. Hallazgos con archivo:línea y severidad.

```text
===== B5.1 · sec-eng =====
Actúa como sec-eng. Lee AGENTS.md, plan §4 B5 y spec v1.1 Aprobada: D-BT-1, D-BT-2, D-BT-7, D-BT-8, §10 y §11. Lee antes los SKILL.md de security-auditor y backend-security-coder. Revisa el diff sin commit de las Olas 2 y 3 (git status en main): que el alcance de tickets no alcance a otro titular (tipo y referencia comparados como texto), que no quede otra ruta que lea o copie el texto suprimido, que la guarda D-BT-7 no tenga carrera y que D-BT-8 no filtre datos del proveedor. Solo lectura; hallazgos con archivo:línea y severidad.
===== B5.2 · test-change-reviewer =====
Actúa como test-change-reviewer. Plan §4 B1c, B1c-2, B3-R y B3-R2 listan las únicas expectativas autorizadas. Revisa toda spec existente modificada en el diff sin commit y en 90d42c7f, frente al cambio de producción que la motiva. CA-BT-15: clasifica cada ajuste como exigido por regla o como posible regresión oculta. Solo lectura.
===== B5.3 · boundary-reviewer =====
Actúa como boundary-reviewer. Revisa el diff sin commit de apps/api contra las reglas de Modulith y tenancy de AGENTS.md: módulos privacy nuevos de assurance, network e inventory, el puerto CRM de D-BT-7, el cableado del adaptador y del CLI, y los valores por defecto de su constructor (plan §4 B3-R). Solo lectura.
===== B5.4 · contract-drift-reviewer =====
Actúa como contract-drift-reviewer. Revisa SUPPLIER_PROFILE_LINKED en packages/shared/src/schemas/privacy/requests.ts frente a productores y consumidores: personal-data-erasure.port.ts, crm-personal-data-erasure.adapter.ts, requests.service.ts, privacy-openapi.schemas.ts y el portal (privacy-labels.ts, PrivacyRequestDetail). Solo lectura.
===== B5.5 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge de AGENTS.md sobre api, shared y portal: unitarias sin caché, integración completa de apps/api como en CI (DB_NAME=test, migraciones, sin filtro) con duración, y además reencrypt-aes.pii.postgres.integration.spec.ts con IWANA_K2_REENCRYPT_INTEGRATION=true en base iwana_it_g7_*; typecheck y lint. CA-BT-16: conteo real, cero PII, nunca tenant_iwana. Solo lectura.
```
