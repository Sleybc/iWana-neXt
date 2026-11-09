# LAUNCH — privacy · H-EXP Fase 1 · B5 (cierre documental y P3)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.5 a §1.11 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 · **ADR:** ADR-104, ADR-105
**Ola que lanza:** 1 y 2 en paralelo; 3 al terminar ambas · **Gates:** G6.5 ✅ 2026-11-08 (`b48b2ba7`, CI 42548805100)
**Bloqueos abiertos:** ninguno. G7 sigue diferido hasta la beta.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Dos P3 de `sec-eng` en `retention-expiry.service.ts` | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` |
| 2 | `general-purpose` como AI-DOCS | Informe de cierre, HLD v1.6 y runbook | `docs-architect` |
| 3 | `docs-governance` | Revisión de los documentos de 2 | — |

**Siguiente:** G2 de AI-EM-ARCH → commit y push con rutas explícitas → CI verde → cierre de la Fase 1. **Cierre:** sin P1; integración como en CI verde si 1 toca código.
**Reglas:** `main` sin ramas, **sin stash** ni commit, cero PII, nunca `tenant_iwana`. Sin Prettier en `docs/`. Cada documento es versión nueva: no se editan versiones aprobadas.

```text
===== 1 · P3 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md y el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.7 y §1.10. Lee antes los SKILL.md de nestjs-expert, test-driven-development e iwana-test-evidence.
1. retention-expiry.service.ts:383 y :869: los puertos ya son obligatorios, así que las guardas ?.bind no se alcanzan nunca. Llama a los métodos directamente y elimina las ramas muertas.
2. selectProspectos (:369): un prospecto que la selección no concilia debe dejar una fila ATTENTION_REQUIRED con su reason_code, igual que en processProspecto. Hazlo solo con códigos que ya existen en el CHECK de la 179. Si no hay ninguno adecuado, [BLOQUEO] y no cambies la migración.
Primero la prueba en rojo, contra PostgreSQL real. Entrega: diff, rojo y verde, unitarias de api sin caché, integración completa de apps/api como en CI en un PostgreSQL desechable nuevo (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true, MFA_ENCRYPTION_KEY efímera, PII_HASH_KEY ausente, .env* apartados y restaurados), typecheck, ESLint y Prettier. Retira el contenedor.
===== 2 · AI-DOCS · general-purpose =====
Actúa como AI-DOCS. Lee AGENTS.md (Documentation Rules), el SKILL.md de docs-architect, el plan §1 completo, la spec H-EXP v1.1, ADR-104, ADR-105 y, como modelo, docs/informes/INFORME-PRIVACY-BARRIDO-TEXTO-LIBRE-CIERRE-v1.0.md. Escribe:
a) docs/informes/INFORME-PRIVACY-H-EXP-FASE-1-CIERRE-v1.0.md. Partes: resultado; olas y gates con su SHA (81c9be55 y b48b2ba7; CI 42536520408 rojo y 42548805100 verde); cifras de G6 y de CI (en el plan); errores del camino (prospectos nunca anonimizados en B3, P1 mixto, la regresión M-1 de la ruta API, la clave HMAC tomada del .env que dejó CI en rojo); qué bloquea G7.
Deuda preexistente (B-6): PqrRetentionReadAdapter devuelve «sin PQR» si faltan tablas o columnas; se ignoran contratos con deleted_at; anonymize-titular.ts solo verifica el deber de PQR; las guardas de TRUNCATE no cubren party_privacy_marks ni otras tres tablas; R4 no protege closed_at, retention_closed_at, resolved_at ni legal_basis.
Pendientes: verificar que iwana_app ya no puede hacer TRUNCATE tras 5229e023; cobertura pgAudit; A22 y OpenAPI maxLength, fuera de alcance.
b) docs/hlds/HLD-PRIVACY-HABEAS-DATA-v1.6.md, reemplaza a la v1.5: la fila de la línea 254 pasa a «implementado en Fase 1»; la de la 256 queda cerrada por H-EXP; sección nueva del motor de vencimiento (relojes, ledger, job, CLI y fallo cerrado).
c) docs/runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.1.md, reemplaza a la v1.0. En §A.4: el preview del CLI imprime UUID técnicos, que van al ticket y nunca a canales abiertos; paso de G7 para verificar con pgAudit que el ledger y la 179 quedan registrados.
Cero PII; enlaces relativos. Sin commit.
===== 3 · docs-governance (tras 2) =====
Actúa como docs-governance. Revisa los documentos nuevos o modificados de la ola 2, junto con el plan y los lanzadores H-EXP, contra Documentation Rules de AGENTS.md: nombre, carpeta, versión, estado, enlaces y límite de 40 líneas por lanzador. Solo lectura; archivo:línea y severidad.
```
