# Plan de orquestación — `privacy` · K2: recifrado PII con titulares anonimizados

**Versión:** 1.1
**Estado:** Aprobado. G0 del CTO el 2026-11-04. No se lanza hasta cerrar las precondiciones de §1
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-03-privacy-k2-recifrado-anonimizados-spec.md](../specs/2026-11-03-privacy-k2-recifrado-anonimizados-spec.md) v1.1 · **Lanzador:** [PROMPT-PRIVACY-K2-ANONIMIZADOS-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-K2-ANONIMIZADOS-LAUNCH-v1.0.md)

Este plan ejecuta la salida B de la spec (§3.4), elegida en el G0.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-06 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §9) | **Cerrada** el 2026-11-04 |
| P2 | Diff del inventario ADR-058 publicado: 4 archivos en `apps/api/src/cli/` | **Cerrada** el 2026-11-04: `4557df41`, CI 41805430065 en verde en el intento 2 (el 1 falló por `AssuranceClient.spec.tsx` de portal, ajeno al diff). La integración K2 sigue omitida en CI hasta B4 |
| P3 | Migraciones 173–175 de MOD14 commiteadas y `runner.ts` sin cambios ajenos | **Cerrada** el 2026-11-06: `de0bcfa7`. Número libre: 176, se confirma al lanzar |
| P4 | Rojos de MOD14 corregidos: `TRUNCATE` sin `CASCADE` (12 pruebas), TS2322 en `billing-policy.controller.ts` (8) y permisos del catálogo (3) | **Cerrada** por la publicación de MOD14 (`de0bcfa7`, G6.5 del 2026-11-06). B5 repite la suite completa |
| P5 | MOD14 B2 fuera de vuelo sobre `reencrypt-aes.pii.ts` y la integración K2 | **Cerrada:** MOD14 ya añadió `billingDocument.buyerDocumentEncrypted` y su fila. La integración K2 cuenta 21 |
| P6 | CI de `main` en verde | `84cba824` en verde (run 42298936387, intento 2; el 1 falló por `SuppliersPanel.spec.tsx` de portal, ajeno al commit). Se comprueba al lanzar |
| P7 | H-2 B1 y barrido fuera de vuelo sobre `crm-titular-erasure.participant.ts` | H-2 y la Ola 1 del barrido publicados en `90d42c7f`. La Ola 2 del barrido espera su G0: **mismo archivo, nunca en paralelo con B1**. Se comprueba al lanzar |

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · borrado, `CHECK` y lectura | `sr-backend` | P1, P3 | `packages/database/src/migrations/tenant/176_*`, `runner.ts`, `crm-titular-erasure.participant.ts`, `subscribers.service.ts` |
| B2 · sonda del dry-run y guarda | `sr-backend` (2.ª instancia) | P1, P2 | `reencrypt-aes.pii.ts`, `reencrypt-aes.db-adapter.ts`, `reencrypt-aes.integration-safety.ts` y sus unitarias |
| B3 · prueba invertida e integración | `sr-qa` | B1, B2 | `reencrypt-aes.pii.postgres.integration.spec.ts`, `reencrypt-aes-migrations.invariant.spec.ts`, `privacy-erasure-api.postgres.integration.spec.ts`, `anonymize-titular.postgres.integration.spec.ts` |
| B4 · CI y runbooks | `plat-ops` | B3 | `.github/workflows/ci.yml`, `apps/api/integration-expected-skips.json`, runbooks |
| B5 · verificación | `sec-eng`, `boundary-reviewer`, `test-change-reviewer`, `gate-verifier` | B4, P4 | Solo lectura |
| B6 · cierre documental | AI-EM-ARCH, con `docs-governance` | B5 | Informe de cierre, HLD siguiente versión libre |

**Olas:** 1 = B1 ∥ B2, con rutas disjuntas; 2 = B3; 3 = B4; 4 = B5; 5 = B6.

**Ruta crítica:** G0 → P3 → B1 → B3 → B4 → B5 → commit y push → G6.5. B4 va después de B3 a propósito: quitar la omisión antes de tener la integración verde dejaría `main` en rojo.

**Sincronización:** B3 fija N, el conteo exacto de pruebas de K2, y B4 lo escribe en el gate. MOD14 B2 subirá el conteo: quien llegue segundo actualiza N.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `nestjs-expert`, `backend-security-coder`, `iwana-test-evidence` | `typescript-expert` (si el tipo de la regla cambia) | `openapi-spec-generation` (el contrato no cambia, D-K2A-4); las de UI |
| B2 | `backend-security-coder`, `postgresql`, `testing-patterns`, `iwana-test-evidence` | `typescript-expert` (puerto extendido) | `database-migration` (es de B1); `bullmq-specialist` (K2 es CLI) |
| B3 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` (si falla una suite ajena) | `e2e-testing-patterns`, `playwright-skill` (no hay cambio visible) |
| B4 | `verification-before-completion`, `iwana-test-evidence` | `docs-architect` (runbooks) | `turborepo-caching` (no se toca el pipeline); `docker-expert` (el servicio de CI no cambia) |
| B5 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |
| B6 | `docs-architect` | — | — |

Skills verificadas en disco el 2026-11-03. `boundary-reviewer`, `test-change-reviewer` y `gate-verifier` son verificadores auxiliares, sin skills asignadas.

## 4. Encargos

Toda decisión está en la spec; esto solo acota. Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Sin Prettier en `docs/`. `[BLOQUEO]` si el código contradice la spec.

- **B1.** D-K2A-1 a D-K2A-4. Confirmar el número libre en `runner.ts`. Migración con su `*.integration.spec.ts` (`up → down → up` con una fila `NULL`). No tocar `titular_prevent_anonymized_mutation()` ni crear ningún GUC. Cierra CA-K2A-01, 07 y 08.
- **B2.** D-K2A-6 y la guarda de D-K2A-8. El orquestador MFA no cambia. Unitarias: dry-run que cuenta `writeBlocked`; reporte sin valores ni ids; error no SQL propagado; guarda con y sin `ciRunner`. Cierra CA-K2A-05 (parte unitaria) y 09.
- **B3.** Primero, lo que dejó la Ola 1 en `reencrypt-aes.pii.postgres.integration.spec.ts`: añadir `probeEncryptedWrite` a `ScopedTenantDbPort`, delegando en el adaptador, y pasar `ciRunner: process.env['GITHUB_ACTIONS'] === 'true'` a `resolveK2ReencryptIntegrationEnabled`. Hasta entonces `pnpm typecheck` de `@iwana/api` da 8 errores y esa suite no compila: **la Ola 1 no se publica sin B3**. Una celda bloqueada no cuenta en `reencrypted`. D-K2A-7, más CA-K2A-02, 03, 04, 05, 06 y 13. En `PII_KEY_CONSUMERS` del invariante, retirar `subscribers.document_number_encrypted` de la entrada de `titular-erasure-sql.ts`: es un mapa declarativo y ninguna aserción cambia. Reutilizar el fixture del runner versionado de la evidencia. Para CA-K2A-06, simular la marca antigua en el fixture de la prueba. Si el CLI no la remedia, `[BLOQUEO]`: se vuelve a la spec §9, punto 2. Reportar N. Correr contra una base `iwana_it_g7_*` propia, nunca `tenant_iwana`.
- **B4.** D-K2A-8 y spec §7. Retirar la entrada del manifiesto, activar el opt-in en el paso de API y añadir el conteo exacto N. Ajustar los runbooks de rotación y MOD05, con `--verify-only` por tenant antes de K2. Cierra CA-K2A-10.
- **B5.** `sec-eng`: revisa la salida B, la sonda y el dictamen de H-1, que pidió el G0, sin implementar. `test-change-reviewer`: CA-K2A-11. `boundary-reviewer`: diff completo, incluido el `import type` de `common/crypto` hacia `cli` (`PiiReencryptDbPort`). `gate-verifier`: CA-K2A-12, suite completa sin caché, porque hay migración.
- **B6.** Informe de cierre, HLD y memoria tras G6. Recomendar commit y push al CTO; G6.5 sobre el SHA publicado.

## 5. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-04: los seis puntos de spec §9, como se recomiendan |
| G2 | Ola 1 con conteos reales; `crm-blocked-mutations.arch.spec.ts` y la spec de la 169 sin cambios |
| G3 | CA-K2A-01 a 09 y CA-K2A-13 en verde contra PostgreSQL real, con conteo |
| G4 | Integración K2 ejecutada en el paso de API, N/N; manifiesto con 3 omisiones |
| G6 | B5 sin bloqueantes. **Cerrado el 2026-11-07:** `sec-eng` GO con tres P2 antes de G7 (ids en la salida de `--verify-only`, `--verify-only` no es de solo lectura por construcción, contradicción de remediación en runbooks) y dictamen H-1 (trigger monótono + bitácora); boundaries y `test-change-reviewer` sin bloqueantes; `gate-verifier` sin rojos: API 477/6.351, DB 78/426, integración DB 53/153, integración API 70 + 3 omitidas, K2 5/5 con entorno de CI |
| G6.5 | CI de `main` en verde sobre el SHA publicado, con todos sus pasos |
| G7 | Sigue diferido hasta la beta. Esta fase retira el bloqueo, no concede G7 |

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Colisión de número de migración o de `runner.ts` con MOD14 | P3, y confirmar el número al implementar |
| El CLI no remedia una marca antigua | CA-K2A-06 lo prueba en B3 y hay alternativa en §9, punto 2 |
| Quitar la omisión pone `main` en rojo | Orden B3 → B4 y correr la suite con `GITHUB_ACTIONS=true` antes de publicar |
| Un fixture cambiado oculta una regresión | CA-K2A-11, con `test-change-reviewer`; la única sustituida es la caracterización |
| La suite verde no corrió de verdad | Conteo exacto en el gate y `iwana-test-evidence` |

## Lanzamiento

Fuente: [`PROMPT-PRIVACY-K2-ANONIMIZADOS-LAUNCH-v1.0.md`](../prompts/PROMPT-PRIVACY-K2-ANONIMIZADOS-LAUNCH-v1.0.md). **El archivo prevalece si divergen.** Lanza la Ola 1; las siguientes tendrán su propio archivo cuando cierre su gate.

```text
===== B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-k2-recifrado-anonimizados-orquestacion.md §4 B1 y la spec docs/specs/2026-11-03-privacy-k2-recifrado-anonimizados-spec.md v1.0, D-K2A-1 a D-K2A-4.
Lee antes los SKILL.md de iwana-tenant-migration, database-migration, postgresql, nestjs-expert, backend-security-coder, iwana-test-evidence.
No toques titular_prevent_anonymized_mutation() ni crees un GUC. Confirma el número libre en runner.ts. main sin ramas, sin stash ni commit, cero PII.
Cierras con CA-K2A-01, 07 y 08. Entrega: diff y conteo real sin caché.

===== B2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan §4 B2 y la spec v1.0, D-K2A-6 y la guarda de D-K2A-8.
Lee antes los SKILL.md de backend-security-coder, postgresql, testing-patterns, iwana-test-evidence.
El orquestador MFA no cambia. Reporte sin valores ni ids. main sin ramas, sin stash ni commit, cero PII.
Cierras con CA-K2A-09 y la parte unitaria de CA-K2A-05. Entrega: diff y conteo real sin caché.
```
