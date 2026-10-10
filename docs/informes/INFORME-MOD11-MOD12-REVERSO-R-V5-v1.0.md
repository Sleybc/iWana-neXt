# Informe MOD11 ↔ MOD12 — R-V5: corrección de la DLQ del consumidor API

**Versión:** 1.0 · **Fecha:** 2026-10-10 · **Estado:** Aprobado (GO del bloque R-V5)

**Autor:** sr-backend · **Rama:** `main` · **SHA base:** `7552c505fc5bd0bbdcbe2c5fe9313b80a7421c7c`.
Dictamen sobre el árbol de trabajo, sin commit. Ejecuta la adenda §R-V5 de [PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md](../prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md) y responde a P2/P3 de [V5 sec-eng](INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.0.md). El cierre integrado RA-11/RA-13 corresponde a V4-R.

## Corrección

- `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:697`: la DLQ recibe `removeOnFail: { age: DLQ_RETENTION_SECONDS }`, con 2.592.000 segundos (30 días). `removeOnComplete: true` permanece en las opciones del diagnóstico. La edad se expresa con `KeepJobs.age`; el número aislado representaba cantidad máxima de jobs según los tipos instalados de BullMQ 5.71.0 (`base-job-options.d.ts:48-55`).
- `inventory-execution-request.processor.ts:79,672`: `reversalRequestId` entra en la lista permitida del diagnóstico únicamente si pasa `safeUuid`. El diagnóstico se construye campo a campo; no copia motivo, sobre, firma ni mensaje crudo de excepción. Se conserva la regla existente de exigir los identificadores comunes válidos antes de añadirlos.
- `apps/api/src/modules/inventory/tests/inventory-execution-request.processor.spec.ts:516`: la prueba exige exactamente `{ age: 30 * 24 * 60 * 60 }`, de modo que un número vuelve a fallar.
- `inventory-execution-request.processor.spec.ts:533,565`: el reverso conserva su identificador y excluye el motivo y el sobre mediante comparación del diagnóstico completo; un identificador de reverso inválido se omite. La prueba inyecta un motivo sintético tanto en el payload como en el error para comprobar que ninguno se copia.

Se leyeron `AGENTS.md`, el bootstrap, el informe V5, la adenda y los `SKILL.md` de `bullmq-specialist`, `testing-patterns` y `backend-security-coder`. Los cambios de código se limitan al procesador y su spec; se preserva el trabajo de V1 a V3.

## Evidencia y gates

| Gate | Resultado real |
| --- | --- |
| Reproducción antes del fix, procesador con `--runInBand --no-cache` | 2 fallos / 17 pasaron: forma numérica de retención e identificador omitido. |
| Procesador después del fix, mismo comando | **19/19 PASS**, 1 suite; caché Jest deshabilitada. |
| `pnpm exec turbo run typecheck --force` | **8/8 PASS, Cached: 0**, 13,003 s. |
| `pnpm --filter @iwana/api exec jest src/modules/inventory --runInBand --no-cache` | **78 suites PASS, 805 tests PASS**; 3 suites / 8 tests omitidos por condiciones preexistentes; 81 suites / 813 tests descubiertos. 59,149 s. Caché Jest deshabilitada, equivalente a `Cached: 0`. |
| Formato y diff | Prettier aplicado a los dos archivos propios; `git diff --check` limpio. |

El gate de inventario usa la configuración Jest vigente: excluye los archivos `.postgres.integration.spec.ts` y conserva los skips existentes. No se presenta este conteo como recorrido del stack vivo ni como aprobación de RA-01 a RA-14; V4-R ejecuta esa cobertura por HTTP. La corrección de opciones no demuestra por sí sola un vencimiento de 30 días de reloj: BullMQ elimina por edad al finalizar jobs, y la cola diagnóstica compartida cuenta además con la limpieza horaria de `ExecutionOrderDlqProcessor` en el worker.

## Búsqueda de otras retenciones numéricas

Se buscaron todas las apariciones de `removeOnFail` y `removeOnComplete` en código y configuración del repositorio, incluidas rutas ocultas, excluyendo dependencias, Git y artefactos compilados. Se inspeccionaron también las expresiones multilínea y los valores constantes referenciados.

**Hallazgo fuera del alcance, reportado sin corregir:** `apps/worker/src/services/execution-order-relay.service.ts:296` usa `NON_INVENTORY_SOURCE_JOB_RETENTION_SECONDS` como valor numérico de `removeOnFail` para eventos ajenos a inventario. La constante en `:52` vale `30 * 24 * 60 * 60` y se denomina en segundos; BullMQ la interpreta como cantidad de jobs, no edad. La rama de inventario en `:295` usa correctamente `{ age: INVENTORY_SOURCE_JOB_RETENTION_SECONDS }`. Se entrega a AI-EM-ARCH para asignación; no condiciona el GO de esta corrección específica de la DLQ del consumidor API.

No se encontraron otros valores numéricos usados como antigüedad. Las opciones booleanas que conservan o eliminan jobs se reportan como semántica booleana, sin reinterpretarlas como una duración.

## Dictamen

**GO para R-V5:** P2 corregido en el consumidor API y P3 implementado, con reproducción previa, pruebas de regresión y ambos gates requeridos en verde. Habilita RA-11/RA-13 de V4-R. El informe V5 original sigue siendo el registro de la auditoría previa; este informe documenta la remediación, sin atribuir un nuevo dictamen a sec-eng ni cerrar G6.
