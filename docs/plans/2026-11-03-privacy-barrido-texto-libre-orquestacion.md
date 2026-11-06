# Plan de orquestación — `privacy` · Barrido de texto libre en la supresión

**Versión:** 1.2
**Cambio v1.1 → v1.2 (2026-11-04):** revisión de B1c. El código de supresión pasa en Postgres real, pero B1c no cierra: quedan dos expectativas que el encargo omitió, una integración que rompería el CI y CA-BT-18 sin integración. Se añade B1c-2 (§4).
**Cambio v1.0 → v1.1 (2026-11-04):** B1 y B2 se ejecutaron sin G0 y sin H-2. La revisión contra Postgres real halló un defecto que nace en la spec v1.0, y se añade el bloque B1c (§4). **Ola 1 no cierra hasta B1c-2.** Decisión del 2026-11-04: B1 y B2 se regularizan con B1c, sin revertir.
**Estado:** Propuesta. **Ola 1 cerrada el 2026-11-04** (B1, B2, B1c y B1c-2), sin commit: unitarias 171/171 y 3 integraciones 12/12 con entorno como CI, repetidas por AI-EM-ARCH. **Ola 2 y siguientes no se lanzan sin el G0** de spec §13, puntos 1 a 8
**Fecha:** 2026-11-03, revisada el 2026-11-04
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-03-privacy-barrido-texto-libre-supresion-spec.md](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md) v1.1 · **Lanzadores:** [Ola 1](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-LAUNCH-v1.0.md), ya ejecutada · [B1c](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-CORRECCION-LAUNCH-v1.0.md)

Este plan asume las opciones recomendadas (spec §13). Si el CTO decide otra, se reemite.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-03 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §13) | Pendiente. **Bloquea todo** |
| P2 | H-2 B1 y K2 B1 cerrados o fuera de vuelo sobre `crm-titular-erasure.participant.ts` | Ambos sin G0. **Mismo archivo:** nunca en paralelo. Se comprueba al lanzar |
| P3 | Nadie en vuelo sobre `privacy-erasure-api.postgres.integration.spec.ts` ni `anonymize-titular.postgres.integration.spec.ts` | H-2 B2 y K2 B3 los tocan. **Bloquea solo B4** |
| P4 | Rojos de MOD14 corregidos (plan K2, P4) | Abiertos. **Bloquea solo B5**: `gate-verifier` necesita la suite de `apps/api` en verde |
| P5 | CI de `main` en verde | `45046b56` en verde (run 41709868001). Se comprueba al lanzar |

**Orden frente a H-2 y K2:** H-2 primero, por ser el menor y el que comparte regla. D-BT-10 absorbe el invariante de D-HN-10: si H-2 aún no lo construyó, se construye una sola vez aquí, y H-2 lo declara en su informe.

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · reglas CRM | `sr-backend` | P1, P2 | `crm-titular-erasure.participant.ts`, `titular-erasure.types.ts`, su unitaria |
| B2 · copias en auditoría y logs | `sr-backend` | P1 | `expediente.service.ts:1321,1720`, `execution-orders.service.ts:1639`, `audit-direct-log-pii-keys.arch.spec.ts` |
| B3 · participantes nuevos y alcance | `sr-backend` | B1 | `modules/assurance/privacy/` y `modules/network/privacy/` (nuevos), `crm-personal-data-erasure.adapter.ts`, `crm-privacy-adapters.module.ts`, `apps/api/src/cli/anonymize-titular.ts`, participantes `wfm` y `tasks`, guardas D-BT-7, bloqueante D-BT-8, etiqueta `privacy-labels.ts:69` |
| B4 · integración e invariante | `sr-qa` | B3, P3 | Fixture de canarios a partir de la evidencia, manifiesto e invariante (D-BT-10), CA-BT-01 a 14 |
| B5 · verificación | `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` | B4, P4 | Solo lectura |
| B6 · cierre documental | AI-EM-ARCH, con `docs-governance` | B5 | D-BT-11, informe de cierre, memoria |

**Olas:** 1 = B1 ∥ B2 (rutas disjuntas, sin diff en común), más B1c; 2 = B3; 3 = B4; 4 = B5; 5 = B6.

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
| B6 | `docs-architect` | — | — |

Skills verificadas en disco el 2026-11-03. `boundary-reviewer`, `test-change-reviewer`, `gate-verifier` y `docs-governance` son auxiliares, sin skills asignadas.

## 4. Encargos

Toda decisión está en la spec; esto solo acota. Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Sin Prettier en `docs/`. `[BLOQUEO]` si el código contradice la spec. Nunca `tenant_iwana`. No tocar los cuatro archivos con diff de `apps/api/src/cli/` ni nada de `billing`.

- **B1.** D-BT-3: R-1, R-7, R-8, R-9, R-11 y R-14 en reglas; R-10 con `DELETE` propio. Publica `relatedIds.contractIds`. Primero la unitaria en rojo: hoy no existe una del participante CRM con reglas reales. Si H-2 ya la creó, se amplía.
- **B2.** D-BT-5 y D-BT-6. `reasonProvided`, como `service-provisioning.service.ts:490`. La prueba de arquitectura se ve fallar antes de corregir. No tocar `audit-sanitize.policy.ts`.
- **B1c, corrección de Ola 1.** `sr-backend`, mismas skills que B1 y B2. Rutas: `crm-titular-erasure.participant.ts` y su unitaria, `subscriber-status-transition.service.ts` y su spec, `audit-direct-log-pii-keys.arch.spec.ts`, `crm/expedientes/tests/expediente.service.spec.ts`, y una integración nueva `crm-titular-erasure.participant.postgres.integration.spec.ts`. Cubre D-BT-3 (estrato y filtro de selección), D-BT-5 y D-BT-6 en el tercer escritor, CA-BT-17 a 19. La aserción de `expediente.service.spec.ts:2807` cambia porque D-BT-5 lo ordena: pasa a `reasonProvided: true` y a comprobar que `reason` no está. Es el único ajuste de expectativa autorizado; otro distinto es `[BLOQUEO]`.
- **B1c-2, cierre de B1c.** `sr-backend`. Rutas: `subscriber-status-transition.service.spec.ts`, `crm-titular-erasure.participant.postgres.integration.spec.ts`, `apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts` y una integración nueva `subscriber-status-transition.postgres.integration.spec.ts`. (a) Las dos expectativas que aún exigen `reason` pasan a `reasonProvided`: las ordena D-BT-5 y el encargo B1c las omitió por error de AI-EM-ARCH. (b) La integración no puede lanzar error al cargarse: el job `ci` corre con `DB_NAME=test` y la suite fallaría; el nombre `iwana_it_g7_*` lo impuso por error el encargo B1c. (c) Sin corte en la 160: `btree_gist` llega con la pública 028, y `iwana_it_g7_ci` tiene solo 26 públicas. La cadena completa exige fijar `iwana.titular_erasure`, como el adaptador. (d) CA-BT-18 en integración. (e) Añadido por el CTO el 2026-11-04: `anonymize-titular.postgres.integration.spec.ts:898` aún espera ciudad, departamento y estrato originales; los ordena R-14 y D-BT-13 (`NULL`, `NULL` y estrato 1). Lo halló la verificación de G2 de MOD14.
- **B3.** D-BT-2, D-BT-4, D-BT-7, D-BT-8 y D-BT-9. Alcance de tickets exacto de la spec, comparando como texto. Orden de participantes de D-BT-2. La guarda va por el puerto de lectura de CRM, sin importar entidades de otro módulo. Precaución: `ck_sp_regularized` (R-2) y `NOT NULL` en R-3, R-4, R-12 y R-13.
- **B4.** Partir de `barrido.sweep.spec.ts.txt`, pero sembrando en una ruta de integración normal. Para los escritores de R-3 y R-7, además de SQL, una pasada por el servicio real: la evidencia solo probó filas sembradas. Comprobar que el invariante muerde con una columna temporal, y revertirla. Clasificar en el manifiesto las columnas de MOD14 como `PENDIENTE-MOD14`, sin decidir por ellas. Si `--apply` no remedia un titular ya anonimizado, `[BLOQUEO]`: vuelve a AI-EM-ARCH (D-BT-12).
- **B5.** `sec-eng`: alcance de tickets, D-BT-1, y que no quede otra ruta de lectura. `test-change-reviewer`: CA-BT-15. `boundary-reviewer`: diff completo, sobre todo los participantes nuevos. `gate-verifier`: CA-BT-16, suite de `apps/api` sin caché, `typecheck` y `lint`.
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
