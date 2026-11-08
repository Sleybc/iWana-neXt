# LAUNCH — privacy · Correcciones de G7 · R1 (cierre de MOD14 y de tenants)

**Plan:** `docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md` v1.0 §6 · **Spec:** barrido v1.2 · ADR-104
**Ola que lanza:** R1, dos perfiles en paralelo con rutas disjuntas · **Gates:** firma ✅; H-EXP sin G0 (no se construye aquí)
**Bloqueos abiertos:** ninguno para R1. El perfil 2 repite `--verify-only` cuando el perfil 1 termine.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Cerrar G7-M: codificación, formato, informe y pruebas | `nestjs-expert`, `testing-patterns`, `iwana-test-evidence` |
| 2 | `plat-ops` | Cerrar G7-T: causas, remediación del fixture y verificación final | `database-migration`, `postgresql`, `verification-before-completion` |

**Siguiente:** G7-R (`sec-eng`) y G7-Q (`gate-verifier`) con el lanzador de revisión.
**Cierre:** manifiesto sin U+FFFD, integración completa como en CI en verde, informe de tenants con cada tenant explicado.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII ni identificadores de titulares en la evidencia.

```text
===== R1.1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md y el plan docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md §2 (G7-M) y §6. Lee antes los SKILL.md de nestjs-expert, testing-patterns, iwana-test-evidence.
1. apps/api/src/cli/text-erasure-manifest.ts tiene 56 caracteres U+FFFD en los motivos de MOD14 (tildes y «§» perdidos). Restáuralos en UTF-8 y comprueba con un conteo de U+FFFD = 0. Revisa también .tmp-mod14-classification.json y bórralo si era temporal tuyo.
2. Prettier falla en 6 archivos del diff de G7-M: aplícalo solo a esas rutas.
3. El manifiesto cita docs/informes/INFORME-MOD14-PRIVACY-CLASIFICACION-v1.0.md, que no existe: escríbelo con las 37 columnas, su escritor, su consumidor y el motivo, o quita la cita. Sin Prettier en docs/.
4. Integración completa de apps/api como en CI (DB_NAME=test, sin filtro, --no-cache), incluida billing-titular-erasure.postgres.integration.spec.ts nueva, y unitarias completas sin caché.
Sin migración, sin tocar audit-sanitize.policy.ts. Cambios de aserción solo si los ordena una regla nueva de G7-M, y nombrándola. Entrega: diff, conteos y duración.
===== R1.2 · plat-ops =====
Actúa como plat-ops. Lee el plan §2 (G7-T) y §6, y docs/informes/evidence/privacy-g7-2026-11-07/tenant-verification.json. Lee antes los SKILL.md de database-migration, postgresql, verification-before-completion.
1. Causa de los 17 INACTIVE con exit 1: léela del stderr local sin copiar PII y regístrala por tenant (alias) con un código.
2. nonproductionKeyFallback=true en todos: explica de dónde sale y si afecta a la verificación de columnas cifradas. Si afecta, repite con las claves reales del entorno de desarrollo.
3. T01, fixture E2E de privacidad: los 25 titulares tienen residuos de reglas posteriores a su anonimización. Remédialos con anonymize-titular --apply por solicitud (D-BT-12) y repite --verify-only hasta 0. Solo T01; nunca otro tenant ACTIVE con datos reales.
4. Cuando R1.1 termine, recompila y repite --verify-only en los 7 ACTIVE con las reglas finales.
5. Escribe docs/informes/INFORME-PRIVACY-G7-TENANTS-v1.0.md: por alias, estado, migración, resultado y causa; separa desarrollo de lo que exige G7 en producción.
Sin nombres, UUID, HMAC ni texto de titulares en la evidencia. Entrega: informe, JSON actualizado y conteos.
```
