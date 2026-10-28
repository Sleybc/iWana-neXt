# Encargo — MOD13 · E7_resume v1.3: fixture alineado al helper histórico y reanudación

**Versión:** 1.3 · **Estado:** vigente; sustituye a v1.2 · **Fecha:** 2026-10-27 · **Emite:** AI-EM-ARCH · **Ejecuta:** `plat-ops` (apoyo `data-eng`; comparador independiente `sr-qa`)
**Plan:** [orquestación v3.8](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Matriz:** [QA v2.7 §13.13](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Encargo previo:** [E7_resume v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md) · **Evidencia:** [R-0b(d) v1.2](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.2-r0bd.json), [helper histórico](../quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt), [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

## 1. Corrección respecto a v1.2

v1.2 se detuvo en R-0b(d) porque `execution_orders` no coincidía con E7_final (`9f6329fa…` frente a `42e4c46e…`) y se dio por perdida la fuente histórica. La fuente existe: E7_match insertó su fila con el helper `insert-one-synthetic-execution-order.cjs`, que sigue en el temporal de E7_match. El fixture versionado no copió sus literales: difiere en `customer_display_label`, `work_summary` y `started_at`. La especificación de v1.1 R-0b(c) no fijaba esos campos; el error es de la especificación, no de la ejecución.

Decisión humana, 2026-10-27: «Prepara E7_resume v1.2 y el launcher v1.16: preservar el helper histórico como evidencia, alinear scripts/mod13-ca-r12-e7-fixture.cjs con sus literales, recrear E7_final, comparar la proyección sin created_at/updated_at y seguir con R-1 a R-9.» Como el nombre v1.2 ya estaba ocupado, este encargo se emite como v1.3.

No se relaja §13.9: la proyección histórica se obtiene de la fuente histórica (helper + catálogo de la tabla) y la comparación la hace `sr-qa`, de forma independiente del fixture.

## 2. Límites

Se mantienen los de v1.0 a v1.2: `NETWORK_IP_PROTECTION=PENDING` todo el tiempo; solo loopback; API en 3014; Redis DB7 para el clon; nada de `dbiw`, `iwana_redis_dev`, `--reset`, `migration down`, `FLUSHALL`/`FLUSHDB` ni commit; nada sensible en artefactos; cada runner con exit 0. Se reutiliza el E1 preservado; no se recrea E1 ni se vuelve a correr el generador. Se añaden:

- El helper histórico ya está copiado byte a byte en `docs/quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt`, con SHA-256 `2398d360662d0bf6d4c22a1fc50a9bbdc2fc84fd6e2dfbb08a478ac092cb7004`. Esa copia no se edita. El original del temporal solo se borra en R-9, después de verificar de nuevo que la copia conserva ese SHA.
- El E7_final de v1.2 no se borra: se renombra a `iwana_it_mod13_ca_r12_e7_final_v12` para conservarlo como diagnóstico hasta R-9.

## 3. Pasos

| Paso | Acción | Criterio de salida |
| ---- | ------ | ------------------ |
| H-0 Preflight | Docker responde; E1 saludable con los digests de v1.2; existen `…_e7` y `…_e7_final`; la copia del helper tiene el SHA de §2 y coincide con el original del temporal. | Cualquier diferencia → `NOT_EXECUTED` con la causa. |
| H-1 Fixture | `data-eng` alinea `scripts/mod13-ca-r12-e7-fixture.cjs` con el helper: tenant = único `ACTIVE` no eliminado (`tenant_mod13_ca_r12_e5`); `id` = primer `execution_order_id` de `service_provisionings` con estado `RESERVED`/`CERTIFIED` ordenado por `created_at, id`; `execution_order_number='MOD13-E7-MATCH-SYNTH-001'`, `origin_context='MOD13_SYNTHETIC_FIXTURE'`, `customer_display_label='Fixture sintético MOD13'`, `work_type='INSTALLATION'`, `work_summary='Fixture sintético para conciliación E7_match'`, `status='IN_PROGRESS'`, `is_annulled=false`; `schedule_event_id`, `origin_ref_id` y `planned_window_*` en `NULL`. **No asignar `started_at`** ni ninguna otra columna: quedan en su default. `created_at`/`updated_at` pueden fijarse a `FIXED_TIME` para que las corridas futuras sean reproducibles. | Diff del fixture revisado; nuevo SHA-256 registrado. |
| H-2 E7_final | Con 0 conexiones: renombrar el E7_final de v1.2 como indica §2, crear `iwana_it_mod13_ca_r12_e7_final` `WITH TEMPLATE iwana_it_mod13_ca_r12_e7` y aplicar el fixture de H-1. | Exit 0; 1 fila en `execution_orders`; 1 snapshot `IN_PROGRESS`; 799 sin snapshot. |
| H-3 Comparación | `sr-qa`, sin usar el fixture, deriva la fila esperada del helper y del catálogo: (a) en `execution_orders` solo `created_at`/`updated_at` tienen default volátil (`now()`); `id` usa `gen_random_uuid()` pero el helper lo asigna; no hay triggers. (b) Compara columna por columna `to_jsonb(r) - 'created_at' - 'updated_at'` contra la fila esperada: literales del helper, `version=1` y el resto de columnas en `NULL`. (c) Repite las 6 huellas legacy E2/E5, los 800 candidatos, 2/2 interfaces y direcciones y los 5 checks referenciales. | Coincidencia exacta en (a), (b) y (c). La huella de la proyección y la huella completa nueva pasan a ser la base de R-8. Cualquier columna distinta detiene el ensayo y se reporta por nombre. |
| R-1 a R-9 | Igual que [v1.0 §3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md), con los ajustes de [v1.1](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.1.md): R-1 clona el E7_final de H-2 y R-8 usa la base de H-3. R-9 retira además `…_e7_final_v12` y, solo después de verificar la copia del helper, los temporales `iwana-mod13-ca-r12-*` e `iwana-mod13-e7-*`. | Los de v1.0 y v1.1, más: la copia del helper conserva su SHA y `scripts/mod13-ca-r12-e7-fixture.cjs` queda en el árbol, sin commit. |

## 4. Entrega

Añadir al final de [e7-rollback.md](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) el apéndice «E7_resume v1.3» y entregar los artefactos saneados `e7-resume-v1.3-h3.json` (comparación) y `e7-resume.json` (R-1 a R-9), con su SHA-256. Preservar los artefactos de v1.0, v1.1 y v1.2. Reportar comandos, códigos de salida, conteos, hashes y digests. Si un paso falla, detenerse, conservar E1 y reportar. G6 sigue NO PASS hasta el dictamen de AI-EM-ARCH tras `sec-eng` y `sr-qa`. `NETWORK_IP_PROTECTION=PENDING`.
