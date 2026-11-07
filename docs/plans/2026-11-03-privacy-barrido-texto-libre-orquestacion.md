# Plan de orquestación — `privacy` · Barrido de texto libre en la supresión

**Versión:** 1.3
**Cambio v1.2 → v1.3 (2026-11-07):** spec v1.2 §14 y [ADR-104](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md), tras la respuesta jurídica. Se añaden la Ola 6 (B7 y B8) y su [lanzador](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-OLA6-LAUNCH-v1.0.md). G0 de spec §14, puntos 11 y 12, el 2026-11-07: **Ola 6 habilitada** cuando el CI de `main` esté en verde. B6 pasa a cerrar también la Ola 6.
**Cambio v1.1 → v1.2 (2026-11-04):** revisión de B1c. El código de supresión pasa en Postgres real, pero B1c no cierra: quedan dos expectativas que el encargo omitió, una integración que rompería el CI y CA-BT-18 sin integración. Se añade B1c-2 (§4).
**Cambio v1.0 → v1.1 (2026-11-04):** B1 y B2 se ejecutaron sin G0 y sin H-2. La revisión contra Postgres real halló un defecto que nace en la spec v1.0, y se añade el bloque B1c (§4). **Ola 1 no cierra hasta B1c-2.** Decisión del 2026-11-04: B1 y B2 se regularizan con B1c, sin revertir.
**Estado:** Propuesta. **Ola 1 cerrada el 2026-11-04** (B1, B2, B1c y B1c-2), publicada en `90d42c7f` el 2026-11-06 con G6.5 ✅ (§7): unitarias 171/171 y 3 integraciones 12/12 con entorno como CI, repetidas por AI-EM-ARCH. G0 de spec §13, puntos 1 a 8, el 2026-11-07: Ola 2 (B3, B3-R, B3-R2) con **G2 ✅ 2026-11-07**, sin commit. Ola 3 (B4) con **G3 ✅ 2026-11-07**, sin commit. Ola 4 (B5 y B5-R) con **G6 ✅ 2026-11-07**, sin commit. Sigue commit y push con rutas explícitas, G6.5 y B6 ([lanzador](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-OLA4-LAUNCH-v1.0.md))
**Fecha:** 2026-11-03, revisada el 2026-11-04
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-03-privacy-barrido-texto-libre-supresion-spec.md](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md) v1.1 · **Lanzadores:** [Ola 1](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-LAUNCH-v1.0.md), ya ejecutada · [B1c](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-CORRECCION-LAUNCH-v1.0.md)

Este plan asume las opciones recomendadas (spec §13). Si el CTO decide otra, se reemite.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-03 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §13) | ✅ 2026-11-07 |
| P2 | H-2 B1 y K2 B1 cerrados o fuera de vuelo sobre `crm-titular-erasure.participant.ts` | Ambos sin G0. **Mismo archivo:** nunca en paralelo. Se comprueba al lanzar |
| P3 | Nadie en vuelo sobre `privacy-erasure-api.postgres.integration.spec.ts` ni `anonymize-titular.postgres.integration.spec.ts` | H-2 B2 y K2 B3 los tocan. **Bloquea solo B4** |
| P4 | Rojos de MOD14 corregidos (plan K2, P4) | Abiertos. **Bloquea solo B5**: `gate-verifier` necesita la suite de `apps/api` en verde |
| P6 | Nadie en vuelo sobre `apps/api/src/cli/anonymize-titular.ts` | Al 2026-11-07 tiene diff sin commit de los P2 de seguridad de K2 (`--with-request-ids`, verificación que siempre revierte); `--remediate` ya se retiró. ✅ Publicado en `5d6a366b` el 2026-11-07 |
| P5 | CI de `main` en verde | `45046b56` en verde (run 41709868001). Se comprueba al lanzar |

**Orden frente a H-2 y K2:** H-2 primero, por ser el menor y el que comparte regla. D-BT-10 absorbe el invariante de D-HN-10: si H-2 aún no lo construyó, se construye una sola vez aquí, y H-2 lo declara en su informe.

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · reglas CRM | `sr-backend` | P1, P2 | `crm-titular-erasure.participant.ts`, `titular-erasure.types.ts`, su unitaria |
| B2 · copias en auditoría y logs | `sr-backend` | P1 | `expediente.service.ts:1321,1720`, `execution-orders.service.ts:1639`, `audit-direct-log-pii-keys.arch.spec.ts` |
| B3 · participantes nuevos y alcance | `sr-backend` | B1 | `modules/assurance/privacy/` y `modules/network/privacy/` (nuevos), `crm-personal-data-erasure.adapter.ts`, `crm-privacy-adapters.module.ts`, `apps/api/src/cli/anonymize-titular.ts`, participantes `wfm` y `tasks`, guardas D-BT-7, bloqueante D-BT-8, etiqueta `privacy-labels.ts:69`. Ampliadas el 2026-11-07 para D-BT-8: `packages/shared/src/schemas/privacy/requests.ts` y `erasure.spec.ts`, `privacy/ports/personal-data-erasure.port.ts`, `privacy-openapi.schemas.ts`, `privacy.swagger.spec.ts`, `erasure-errors.ts`, `modules/inventory/privacy/` (nuevo), `privacy-labels.ts` y `PrivacyRequestDetail.spec.tsx` |
| B4 · integración e invariante | `sr-qa` | B3, P3 | Fixture de canarios a partir de la evidencia, manifiesto e invariante (D-BT-10), CA-BT-01 a 14 |
| B5 · verificación | `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` | B4, P4 | Solo lectura |
| B7 · PQR y estrato (v1.2) | `sr-backend` | G0 de spec §14, B5 | Migración nueva (`contracts.anonymized_at`, dos CHECK, dos categorías), `requests.service.ts` (`conservationDuty`), puerto `IPqrRetentionReadPort` y su implementación en `assurance/privacy/`, puerto de situación contractual de CRM y su adaptador, reglas de estrato en `crm-titular-erasure.participant.ts`, `titular-erasure-sql.ts` (retirar `integer-marker`), cableado en `privacy.module.ts` y en el CLI, y sus pruebas |
| B8 · verificación de v1.2 | `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` | B7 | Solo lectura |
| B6 · cierre documental | AI-EM-ARCH, con `docs-governance` | B8 | D-BT-11, informe de cierre, memoria |

**Olas:** 1 = B1 ∥ B2 (rutas disjuntas, sin diff en común), más B1c; 2 = B3; 3 = B4; 4 = B5; 6 = B7 y después B8; 5 = B6, al final.

B3 es un solo bloque porque los dos participantes comparten adaptador, módulo y CLI: dos escritores chocarían.

**Ruta crítica:** G0 → B1 → B3 → B4 → B5 → commit y push → G6.5 → B6. El commit lleva rutas explícitas, nunca `git add -A`: el árbol tiene más de 100 rutas ajenas.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development`, `iwana-test-evidence` | `typescript-expert` (si cambia el tipo de `relatedIds`) | `database-migration` (sin migración, D-BT-9 y D-BT-12); `openapi-spec-generation`; las de UI |
| B2 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | — | `postgresql` (sin SQL) |
| B3 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `architect-review`, `test-driven-development`, `iwana-test-evidence` | `system-vocabulary-review` (etiqueta del portal), `typescript-expert` | `database-migration` (sin migración); `bullmq-specialist` (sin colas) |
| B4 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` (si falla una suite ajena) | `e2e-testing-patterns`, `playwright-skill` (cambio visible mínimo) |
| B5 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |
| B7 | `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | `typescript-expert` (si cambia el tipo del puerto contractual) | `openapi-spec-generation` (el contrato no cambia) |
| B8 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |
| B6 | `docs-architect` | — | — |

Skills verificadas en disco el 2026-11-03. `boundary-reviewer`, `test-change-reviewer`, `gate-verifier` y `docs-governance` son auxiliares, sin skills asignadas.

## 4. Encargos

Toda decisión está en la spec; esto solo acota. Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Sin Prettier en `docs/`. `[BLOQUEO]` si el código contradice la spec. Nunca `tenant_iwana`. No tocar los cuatro archivos con diff de `apps/api/src/cli/` ni nada de `billing`.

- **B1.** D-BT-3: R-1, R-7, R-8, R-9, R-11 y R-14 en reglas; R-10 con `DELETE` propio. Publica `relatedIds.contractIds`. Primero la unitaria en rojo: hoy no existe una del participante CRM con reglas reales. Si H-2 ya la creó, se amplía.
- **B2.** D-BT-5 y D-BT-6. `reasonProvided`, como `service-provisioning.service.ts:490`. La prueba de arquitectura se ve fallar antes de corregir. No tocar `audit-sanitize.policy.ts`.
- **B1c, corrección de Ola 1.** `sr-backend`, mismas skills que B1 y B2. Rutas: `crm-titular-erasure.participant.ts` y su unitaria, `subscriber-status-transition.service.ts` y su spec, `audit-direct-log-pii-keys.arch.spec.ts`, `crm/expedientes/tests/expediente.service.spec.ts`, y una integración nueva `crm-titular-erasure.participant.postgres.integration.spec.ts`. Cubre D-BT-3 (estrato y filtro de selección), D-BT-5 y D-BT-6 en el tercer escritor, CA-BT-17 a 19. La aserción de `expediente.service.spec.ts:2807` cambia porque D-BT-5 lo ordena: pasa a `reasonProvided: true` y a comprobar que `reason` no está. Es el único ajuste de expectativa autorizado; otro distinto es `[BLOQUEO]`.
- **B1c-2, cierre de B1c.** `sr-backend`. Rutas: `subscriber-status-transition.service.spec.ts`, `crm-titular-erasure.participant.postgres.integration.spec.ts`, `apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts` y una integración nueva `subscriber-status-transition.postgres.integration.spec.ts`. (a) Las dos expectativas que aún exigen `reason` pasan a `reasonProvided`: las ordena D-BT-5 y el encargo B1c las omitió por error de AI-EM-ARCH. (b) La integración no puede lanzar error al cargarse: el job `ci` corre con `DB_NAME=test` y la suite fallaría; el nombre `iwana_it_g7_*` lo impuso por error el encargo B1c. (c) Sin corte en la 160: `btree_gist` llega con la pública 028, y `iwana_it_g7_ci` tiene solo 26 públicas. La cadena completa exige fijar `iwana.titular_erasure`, como el adaptador. (d) CA-BT-18 en integración. (e) Añadido por el CTO el 2026-11-04: `anonymize-titular.postgres.integration.spec.ts:898` aún espera ciudad, departamento y estrato originales; los ordena R-14 y D-BT-13 (`NULL`, `NULL` y estrato 1). Lo halló la verificación de G2 de MOD14.
- **B3.** D-BT-2, D-BT-4, D-BT-7, D-BT-8 y D-BT-9. Alcance de tickets exacto de la spec, comparando como texto. Orden de participantes de D-BT-2. La guarda va por el puerto de lectura de CRM, sin importar entidades de otro módulo. Precaución: `ck_sp_regularized` (R-2) y `NOT NULL` en R-3, R-4, R-12 y R-13.
- **B3-R, corrección de B3 (2026-11-07).** `sr-backend`. La integración completa de `apps/api` como en CI (`DB_NAME=test`, 172 tenant) dio 6 suites y 23 pruebas en rojo; el informe de B3 solo midió su propia integración. Causas: `SupplierProfileReadAdapter` consulta `supplier_profiles` sin comprobar que exista, a diferencia del resto de participantes; módulos de prueba que arman el adaptador sin los proveedores nuevos; dobles de `subscriberContextPort` sin `assertWritableReferences`. Menor, para B5: los valores por defecto del constructor del adaptador crean participantes con un `ConfigService` vacío y ocultan un cableado olvidado. **B3-R2:** queda 1 roja, `anonymize-titular.postgres.integration.spec.ts:1494`, que espera `reason: 'OPERATIONAL_REASON'` en `schedule_reschedule_logs`. Esa expectativa codifica la decisión de D1 («se conserva»), reabierta por el G0 del 2026-11-07 (spec §13, punto 3) y sustituida por R-13: la columna es texto libre sin catálogo. AI-EM-ARCH autoriza cambiarla a `'ANONIMIZADO'`; es el único ajuste autorizado. **G2 ✅ (2026-11-07), repetido por AI-EM-ARCH:** integración completa de `apps/api` como en CI, 70 suites y 482 pruebas, 0 fallos, 4 suites omitidas declaradas. Canarios por `PrivacyRequestsService`, contrato `RESIDENTIAL`: 261 sembrados, supervivientes de 133 a 88; 84 excluidos con motivo y 4 de R-15, fuera por G0 (punto 5). Evidencia: `corrida-b3-residencial.ndjson` y el runner adaptado `barrido-b3.sweep.spec.ts.txt`, que registra billing y los participantes nuevos, y siembra el proveedor en otro Party.
- **B4.** Partir de `barrido.sweep.spec.ts.txt`, pero sembrando en una ruta de integración normal. Para los escritores de R-3 y R-7, además de SQL, una pasada por el servicio real: la evidencia solo probó filas sembradas. Comprobar que el invariante muerde con una columna temporal, y revertirla. Clasificar en el manifiesto las columnas de MOD14 como `PENDIENTE-MOD14`, sin decidir por ellas. Si `--apply` no remedia un titular ya anonimizado, `[BLOQUEO]`: vuelve a AI-EM-ARCH (D-BT-12).
- **G3 ✅ (2026-11-07), repetido por AI-EM-ARCH:** integración completa como en CI, 72 suites y 497 pruebas, 0 fallos, 247 s; B4 añade 28 pruebas (barrido 9, alcance 13, invariante 6). Manifiesto de 709 columnas, 37 `PENDIENTE-MOD14`.
- **B3-R3, antes de B5.** `reencrypt-aes.pii.postgres.integration.spec.ts:486-531` arma el adaptador sin `AssuranceTitularErasureParticipant`, `NetworkTitularErasureParticipant` ni `SupplierProfileReadAdapter`. CI lo omite (solo corre con `IWANA_K2_REENCRYPT_INTEGRATION=true` y base `iwana_it_g7_*`), pero falla 1 de 5 y es la prueba que exige la rotación de claves. Corrección solo de montaje, sin tocar aserciones.
- **B5 (2026-11-07), resultado:** `test-change-reviewer`, `contract-drift-reviewer` y `gate-verifier` APTOS; integración completa 73/73, K2 5/5 tras B3-R3. Abiertos: P1 de `sec-eng` (cuatro escrituras de tickets sin guarda) y P1 menor de `boundary-reviewer` (valores por defecto del constructor). Riesgo: el paso de integración de CI tardó 3 min 56 s en `5d6a366b`, antes de B3 y B4, con límite de 5 min.
- **B5-R, antes de G6.** `sr-backend`: D-BT-7 ampliado a `update`, `requestFieldService` y `linkWorkOrder`, no a `transitionStatus` (spec §10); quitar los valores por defecto del constructor del adaptador y cablear lo que falte, solo montaje. `plat-ops`: subir el timeout del paso de integración de API y corregir su comentario con la medición real.
- **G6 ✅ (2026-11-07), repetido por AI-EM-ARCH tras B5-R:** integración completa como en CI, 72 suites y 498 pruebas, 0 fallos, 333 s locales; unitarias 481 suites y 6.381 pruebas (informe del ejecutor); K2 5/5. P1 de `sec-eng` cerrado (guarda en `update`, `requestFieldService` y `linkWorkOrder`; `transitionStatus` como límite de §10). P1 de `boundary-reviewer` cerrado (sin valores por defecto; el adaptador falla cerrado). Timeout del paso de integración de CI a 10 min.
- **B5.** `sec-eng`: alcance de tickets, D-BT-1, y que no quede otra ruta de lectura. `test-change-reviewer`: CA-BT-15. `boundary-reviewer`: diff completo, sobre todo los participantes nuevos. `contract-drift-reviewer`: el bloqueante nuevo de D-BT-8 en `packages/shared`. `gate-verifier`: CA-BT-16, suite de `apps/api` sin caché, `typecheck` y `lint`.
- **G6.5 de las Olas 2 a 4 ✅ (2026-11-07):** publicado en `c1b56c83`. CI `42398209146` en verde en el intento 2: el intento 1 falló en 4 pruebas encadenadas de `portal-billing-flow.spec.ts` (MOD14, desde la línea 613), que pasaron al relanzar sin cambios: fallo intermitente, para seguimiento de MOD14. Paso de integración de la API: 4 min 41 s, con límite de 10. E2E Web Admin Smoke `42398209127` en verde.
- **B7.** Spec §14, D-BT-14 a 16, CA-BT-20 a 26. Primero en rojo. La migración sigue el patrón de la 176 y usa el siguiente número libre al lanzar; comprobar antes que ninguna otra ola en vuelo reserve ese número. Leer los CHECK reales (D-BT-13). El ajuste de las expectativas de estrato `1` en pruebas existentes lo ordena D-BT-15; cualquier otro es `[BLOQUEO]`.
- **G3 de B7 ✅ (2026-11-07), repetido por AI-EM-ARCH:** integración completa como en CI, 73 suites y 516 pruebas, 0 fallos, 249 s; migración 177. Observaciones para B8: una PQR con un recurso sin respuesta en el mismo ticket no cuenta como pendiente si otro registro ya respondió (`pqr-retention-read.adapter.ts:35`, `max` por ticket); la evidencia quedó en `docs/quality/privacy-barrido-b7/` y no en `docs/informes/evidence/`.
- **G6 de la Ola 6 ✅ (2026-11-07):** B8 sin P1. `test-change-reviewer` y `boundary-reviewer` aptos; `gate-verifier`: api 483 suites y 6.393 pruebas, database 78 y 53 suites, integración completa 74/74 (330 s), migración 177 arriba y abajo, K2 5/5. P2 aceptados: un recurso sin respuesta en un ticket ya respondido no cuenta como pendiente (hoy ningún escritor crea varios FINAL_RESOLUTION; fijar la semántica con H-EXP o con el escritor de recursos); el `down` de la 177 borraría una ampliación de plazo hecha por el operador.
- **B8.** `sec-eng`: el alcance de PQR no toma otro titular y el bloqueo no filtra la PQR. `test-change-reviewer`: cada expectativa de estrato cambiada responde a D-BT-15. `boundary-reviewer`: el puerto de PQR lo define `privacy` y lo implementa `assurance`. `gate-verifier`: suites completas de `apps/api` y `packages/database`, unitarias e integración como en CI, migración arriba y abajo, y K2 5/5.
- **B6.** D-BT-11. Informe de cierre con evidencia y conteos. Memoria tras G6. Recomendar commit y push al CTO; G6.5 sobre el SHA publicado, con el CI de `main` en verde.

## 5. Gates

| Gate | Condición |
| --- | --- |
| G0 | CTO decide los puntos de spec §13 |
| G2 | B1, B2 y B3 con conteo real; ninguna ruta fuera de la lista |
| G3 | CA-BT-01 a 14 en verde contra PostgreSQL real, con conteo |
| G6 | B5 sin hallazgos abiertos; CA-BT-15 y 16. La suite completa es obligatoria: cambian dos `@Module` |
| G6.5 | Publicado, CI de `main` verde sobre el SHA, informe y HLD actualizados |
| G7 | Diferido hasta la beta. Exige `--verify-only` en cero por tenant, el invariante en CI y las respuestas del abogado (spec §13, punto 10) |

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Anular el contenido de una PQR con deber de conservación | Solo corre en supresión procedente. Pregunta al abogado antes de producción (spec §13) |
| `resolveScope` con listas vacías por el orden de participantes | D-BT-2 y CA-BT-02. Las sondas se quedarían vivas y la prueba falla |
| Colisión con H-2 o K2 | P2 y P3 |
| Sobre-alcance: anonimizar tickets de otro titular por un `ref_id` que coincide | La condición exige tipo y referencia. CA-BT-03 |
| Tickets con marca que rompen listados o SLA | Solo cambia el texto. CA-BT-05 |
| Vista previa ajustada «por obsoleta» | CA-BT-15 y `test-change-reviewer` |
| Prueba verde que no corrió | Conteo real sin caché; la de canarios no admite omisión esperada |

## 7. Fuera de alcance

H-1 de K2, cualquier trigger nuevo, todo MOD14 (spec §12), `public`, un participante de inventario (spec §7, salvo decisión del CTO), reescribir `audit_logs` y el diff de `apps/api/src/cli/`.

**Publicación 2026-11-06:** la Ola 1 se publicó en `90d42c7f` por excepción del CTO, porque no se podía separar de H-2 y MOD14 sin dejar un árbol sin medir. Eso no aprueba los puntos 1 a 8 de spec §13: la Ola 2 sigue cerrada y el barrido sigue bloqueando G7. CI de `main` en verde sobre `07794606`, corrida `42295514534`, todos los jobs en `success`, y E2E Web Admin Smoke `42295514359` en `success`. E2E operativo: 339 aprobadas, 0 fallidas, 1 omitida, 0 inestables, `E2E_CLEANUP=OK`, con las capturas `linux` incluidas.
