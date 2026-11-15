# Transversal · Importación UISP: complementar titular existente · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que un administrador confirme, por titular, que un cliente de UISP complementa a un suscriptor que ya existe en iWana, y que su historial entre completo sin fusionar ni sobrescribir.
**Spec:** [2026-11-15-transversal-importacion-uisp-complementar-titular](../specs/2026-11-15-transversal-importacion-uisp-complementar-titular.md) v1.0 (G0 2026-11-15) · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.1 D11
**Launcher:** [PROMPT-TRANSVERSAL-IMPORTACION-UISP-COMPLEMENTO-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-UISP-COMPLEMENTO-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §8 (fusión de suscriptores, elección campo por campo, corte de fechas, enlace con contratos existentes, relleno retroactivo).

## 1. Reglas

- `main` sin ramas; **sin commit hasta cerrar el módulo** (decisión del usuario); no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol tiene cambios sin commitear de otras sesiones (billing, ficha MOD05, contactos UISP, topes de 100/200 MB): no revertirlos ni reformatearlos.
- Jest sin caché con conteo real; integración `DB_NAME=test`; suite completa de la API si cambia un `@Module`.
- Migración tenant: la última es la 209; esta fase usa la **210**.
- Fixtures sintéticos; ningún dato de Alexander ni de la instancia real de UISP.
- Boundaries: migración solo habla con CRM, Billing y Soporte por sus puertos (`ports/migration-import.ports.ts`, `ports/migration-titular-lookup.port.ts`). Nada de SQL de la migración sobre tablas ajenas.
- PII: ni nombres, ni documentos, ni contactos en `migration_mappings`, `counts`, `promotion_meta`, logs ni payloads de cola. Solo ids y HMAC.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | — | Línea base con conteo real: unitarias de `apps/api/src/modules/migration`; integración de promoción y reversión (`migration-promotion.postgres.integration.spec.ts`); portal `components/settings/migration`; E2E `portal-importacion-uisp-live.spec.ts` con el aprovisionador | `sr-qa` |
| **A** Contrato y esquema | §2.1, §3 | `packages/shared/src/contracts/migration/migration-import.contract.ts`: kind `TITULAR`; motivos `TITULAR_VINCULADO_A_OTRO_CLIENTE` y bloqueo `DATO_COMPLETADO_MODIFICADO`; observaciones `CRUCE_CON_FACTURACION_IWANA` y `DATO_DISTINTO_EN_UISP`; `candidateRef` opcional (uuid) en `MigrationPendingValueSchema`; error `MIGRATION_TITULAR_TARGET_INVALID`; conteo `titulares.complementados`. Migración tenant **210**: `chk_migration_mappings_kind` admite `TITULAR` (up/down simétricos, registro en `runner.ts`). Recompilar `@iwana/shared`. | `sr-backend` |
| **B** Simulación y equivalencia | §2.1, §2.2 | `MigrationTitularLookupPort.lookup` devuelve además `subscriberIdByHmac` (solo `subscribers` vigentes, no expedientes) y `restrictedSubscriberIds`; adaptador CRM `crm-migration-titular-lookup.adapter.ts`. `uisp/uisp-simulation.ts`: equivalencia `TITULAR` hacia el candidato → `VALIDO` con `derived.complementSubscriberId`, sin `DATOS_OBLIGATORIOS_AUSENTES`; sin ella → `TITULAR_EXISTENTE` + pendiente con `candidateRef`; hacia otro → `TITULAR_EXISTENTE`. Observación de cruce con un dato precalculado (`firstOwnIssueDateBySubscriber`) del puerto de Billing. `migration-mappings.service.ts`: para `TITULAR` solo `EQUIVALE`, y `target_ref` debe ser un `candidateRef` vigente de ese `external_value` en algún lote no purgado del tenant, no anonimizado ni restringido, y sin otro `external_id` (422 `MIGRATION_TITULAR_TARGET_INVALID`). | `sr-backend` |
| **C** Promoción, conciliación y reversión | §2.3–§2.6 | `migration-promotion.service.ts`: rama de complemento en `promoteSubscriber` (revalida por HMAC; nunca `import_batch_id` en el suscriptor); contratos con `status = 'TERMINATED'` y `endDate` = fin de UISP o fecha de promoción; `promotion_meta` `{ mode, subscriberId, linkedExternalId, filled[] }` con HMAC. Puerto CRM nuevo: `linkComplement`, `fillEmptyFields` (spec §2.4; devuelve lo completado con su HMAC y los campos que difieren, para la observación `DATO_DISTINTO_EN_UISP`) y `revertComplement`. Puerto Billing: `importedTotalsBySubscriber` (solo `external_id` `uisp:%`) y `firstOwnIssueDates`. Conciliación acotada para complementados. `migration-revert.service.ts`: restaura `external_id` y los campos completados si su HMAC no cambió; si cambió, bloqueo `DATO_COMPLETADO_MODIFICADO`. | `sr-backend` (consulta `data-eng`) |
| **F** Portal | §2.7 | `components/settings/migration/`: grupo «Titulares existentes» en `MigrationMappingEditor.tsx` con tarjeta del candidato (lectura CRM con permisos del admin: nombre, documento enmascarado, «En iWana desde», estado, servicios), diálogo de confirmación con lo que hará y sus conteos, re-simulación, estado «Complementado» en `MigrationBatchDetailClient.tsx`, vocabulario en `migration-labels.ts`. | `fe-platform` |
| **QA** | §5, §6 | Integración contra Postgres y Redis: suscriptor existente con contrato y facturas propias + ZIP sintético de dos servicios (CA-2, 4, 5, 6, 7). Generación diaria no factura contratos históricos (CA-9). E2E del aprovisionador con el caso complemento (regla G6). a11y del diálogo. | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A | — |
| 2 | B | A |
| 3 | C · F | B (F trabaja contra el contrato congelado en A y el pendiente de B) |
| 4 | QA · revisores · cierre documental | 1–3 |

**Ruta crítica:** A → B → C → QA. F corre en paralelo a C.
**Punto de sincronización:** al cerrar A el contrato queda congelado; cualquier cambio posterior exige re-sync de B, C y F.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns`; subagente `e2e-triage` si una E2E falla | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| A | `sr-backend` | `iwana-tenant-migration`, `postgresql`, `typescript-expert` | `openapi-spec-generation` | `database-migration` (es tenant) |
| B, C | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `bullmq-specialist` (solo si toca el job), `systematic-debugging` | `auth-implementation-patterns` (el permiso ya existe) |
| F | `fe-platform` | `frontend-dev-guidelines`, `system-vocabulary-review`, `iwana-identity-ui-review` | `frontend-security-coder` (PII del candidato), `testing-patterns` | `core-components` (sin primitives nuevas) |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier` | `requesting-code-review` | `data-eng` | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de F.

## 5. Gates

- **G6 por ola:** conteo ≥ línea base de W0; migración 210 up/down contra Postgres real.
- **Ola 3:** la prueba de integración demuestra que revertir un lote complementado **no borra al suscriptor** y lo deja como estaba.
- **Antes de cerrar:** E2E del aprovisionador verde; `audit-ui.mjs` sin hallazgos.
- **G6.5:** solo cuando el usuario autorice el commit del módulo y el CI de `main` esté verde.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Enlazar a la persona equivocada | `candidateRef` calculado por HMAC; se revalida al guardar y al promover (CA-8) |
| R2 | Reversión que borra al suscriptor complementado | Nunca `import_batch_id` en él; prueba de integración obligatoria (gate de ola 3) |
| R3 | Contrato histórico que factura o aprovisiona | `TERMINATED` con `endDate`; prueba de generación diaria (CA-9) |
| R4 | Cobro doble en el periodo cruzado | Observación y saldo importado visibles antes de promover (CA-3); corrección manual en MOD14 |
| R5 | PII en equivalencias o meta | `external_label` nulo y solo HMAC en `promotion_meta`; revisión de `sec-eng` |
| R6 | Deriva de contrato entre A y C/F | Contrato congelado en A; `contract-drift-reviewer` en la ola 4 |

## 7. Cierre

Informe `docs/informes/INFORME-TRANSVERSAL-IMPORTACION-UISP-COMPLEMENTO-v1.0.md` con conteos reales, evidencia en navegador con un ZIP sintético (nunca el de Alexander en un tenant de prueba compartido) y deudas. El caso real de Alexander se ejecuta después, en el tenant del usuario y con su confirmación.

## Lanzamiento

Espejo de [PROMPT-TRANSVERSAL-IMPORTACION-UISP-COMPLEMENTO-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-UISP-COMPLEMENTO-LAUNCH-v1.0.md); el archivo prevalece si divergen.
