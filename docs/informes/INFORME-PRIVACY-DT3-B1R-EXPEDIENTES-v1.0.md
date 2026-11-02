# INFORME — Privacy DT-3 B1-R · clasificación de expedientes

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-11-01

Contrato: [spec DT-3 v1.1](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md), [encargo B1-R](../prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md). Alcance: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`.

## Clasificación previa a editar

Las líneas corresponden al estado inicial de B1-R. La corrida inicial completa del padre reproduce 25 fallos de este spec. Clasificación registrada antes de modificar el archivo; no se cambia ninguna aserción de los casos (a). En los casos (b), solo cambia la expectativa de llamadas de transacción; el rechazo funcional o ausencia de escrituras se conserva y se comprueba.

| Prueba (archivo relativo al directorio tests)                                                                                       | Categoría | Causa y regla                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expediente.service.spec.ts:1158` · preserva el error de persistencia aunque falle el rollback físico                               | (a)       | El bloqueo temprano nuevo consume una implementación secuencial; el error reservado a persistencia ocurre antes del rename. Se agrega respuesta para esa lectura.                              |
| `expediente.service.spec.ts:1723` · registra el descarte con un manager sin factory y emite el motivo del evento                    | (a)       | El doble devolvía la misma referencia mutable para la carga previa y la relectura bajo bloqueo: la mutación en memoria parecía un cambio concurrente. La lectura retorna una copia de la fila. |
| `expediente.service.spec.ts:1774` · rechaza CLIENTE_ACTIVO sin contacto del subscriber antes de guardar el expediente               | (b)       | D-RER-3.1 y 3.4 exigen bloquear y comprobar anonimización antes de dominio; la expectativa de no transacción (o una sola) debe contemplar la comprobación.                                     |
| `expediente.service.spec.ts:1807` · rechaza LISTO_PARA_INSTALACION sin autorización contractual antes de guardar                    | (b)       | D-RER-3.1 y 3.4 exigen bloquear y comprobar anonimización antes de dominio; la expectativa de no transacción (o una sola) debe contemplar la comprobación.                                     |
| `expediente.service.spec.ts:1845` · rechaza LISTO cuando el consentimiento contractual más reciente fue revocado                    | (a)       | El manager solo exponía find de consentimientos; falta findOne del expediente para el bloqueo temprano. Se conserva el rechazo por consentimiento revocado.                                    |
| `expediente.service.spec.ts:2353` · backfillDocumentNumberHashes rellena hash NULL sin loguear PII                                  | (a)       | El manager no expone findOne para releer el expediente del lote bajo bloqueo. Se retorna la fila sintética pendiente.                                                                          |
| `expediente.service.spec.ts:2418` · backfillDocumentNumberHashes omite ciphertext inválido y avanza por ID sin incluirlo en logs    | (a)       | Falta findOne por id en el manager del backfill; debe releer cada fila sin desplazar la secuencia de getMany.                                                                                  |
| `expediente.service.spec.ts:2712` · revoca consentimiento de tratamiento de datos y marca el agregado para cumplimiento             | (a)       | El mismo findOne devolvía ConsentRecord al pedir ExpedienteRecord. Se discrimina por entidad; syncCompleteness también relee bajo bloqueo.                                                     |
| `expediente.service.spec.ts:2787` · acepta payload legado en ingles para crear consentimiento y lo normaliza a español              | (a)       | La nueva transacción de rechazo temprano consume el manager reservado a crear; se añade esa respuesta y se discrimina ExpedienteRecord frente a ConsentRecord.                                 |
| `expediente.service.spec.ts:2851` · bloquea la captura si no hay autorización vigente publicada                                     | (b)       | D-RER-3.1 y 3.4 exigen bloquear y comprobar anonimización antes de dominio; la expectativa de no transacción (o una sola) debe contemplar la comprobación.                                     |
| `expediente.service.spec.ts:2876` · registra cobertura sin intentar nullificar expediente_id en checks ya cargados                  | (a)       | El manager de crear cobertura y el de recalcular completitud no exponían findOne del expediente bloqueado.                                                                                     |
| `expediente.service.spec.ts:2955` · construye el summary del pipeline sin depender de un limit artificial                           | (a)       | Contaminación del doble entre tests: la captura de cobertura falla antes de consumir su segunda implementación once; queda pendiente un manager sin createQueryBuilder.                        |
| `expediente.service.spec.ts:3575` · persiste viabilidad tecnica estructurada completa cuando el payload es valido                   | (a)       | findOne devolvía null porque antes no se usaba en la escritura; ahora debe retornar la fila existente bajo bloqueo.                                                                            |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere tecnologías candidatas para viable              | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere certeza y fuente para viable                    | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere candidata antes de evaluar validación pendiente | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere certeza al evaluar validación pendiente         | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere fuente al evaluar validación pendiente          | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere observaciones al evaluar validación pendiente   | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere fuente para una evaluación no viable            | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3704` · rechaza la factibilidad técnica cuando requiere observaciones para una evaluación no viable     | (a)       | Solo estaba simulado findById; falta el callback transaccional con la fila bloqueada antes de la validación técnica.                                                                           |
| `expediente.service.spec.ts:3717` · acepta validación requerida y evaluación no viable con sus campos obligatorios                  | (a)       | El manager de save/update no expone la relectura bloqueada findOne del expediente.                                                                                                             |
| `expediente.service.spec.ts:3977` · audita sin evento ni reintento cuando el estado no pertenece al pipeline                        | (b)       | D-RER-3.1 y 3.4 exigen bloquear y comprobar anonimización antes de dominio; la expectativa de no transacción (o una sola) debe contemplar la comprobación.                                     |
| `expediente.service.spec.ts:4005` · audita el evento sin reintento cuando no hay un fallo pendiente                                 | (a)       | La respuesta null de fallo de conversión pendiente era consumida por la nueva lectura del expediente; se discrimina el tipo de entidad.                                                        |
| `expediente.service.spec.ts:4345` · no audita ni persiste secciones cuando el payload parcial no trae campos                        | (b)       | D-RER-3.1 y 3.4 exigen bloquear y comprobar anonimización antes de dominio; la expectativa de no transacción (o una sola) debe contemplar la comprobación.                                     |

## Clasificación adicional antes de editar

| Prueba                                                                                                    | Categoría | Causa                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expediente.service.spec.ts:3554` · rechaza viabilidad tecnica viable cuando falta tecnologia recomendada | (a)       | Al limpiar correctamente las implementaciones entre tests, se revela que el doble no ejecutaba ninguna transacción para la lectura bloqueada. Se agrega la fila explícita, sin cambiar la aserción BadRequestException. |

La primera corrida aislada tras adaptar dobles dio 105/107: el consentimiento legado aún consumía su manager de creación en el bloqueo temprano y faltaba el doble de viabilidad recién descrito. Ambos se completan conservando aserciones.

## Evidencia final

Comando: `pnpm --filter @iwana/api exec jest src/modules/crm/expedientes/tests/expediente.service.spec.ts --runInBand` (Jest directo, sin Turbo). Fecha: 2026-11-01, America/Bogota.

```text
Test Suites: 1 passed, 1 total
Tests:       107 passed, 107 total
Snapshots:   0 total
Time:        5.436 s
```

0 omitidos. Se completaron 21 adaptaciones (a), incluidas la prueba latente y los ocho casos parametrizados contados individualmente, y cinco (b). No se editó código de producción en este subbloque. Las expectativas funcionales de errores, persistencia, auditoría y eventos se mantienen. En (b) se añadieron comprobaciones explícitas de ausencia de save cuando corresponde y una del bloqueo pesimista.

Diff de B1-R: únicamente `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` más este anexo. La comparación del test usa el snapshot de inicio de B1-R, sin atribuir a esta remediación los cambios anteriores de producto.
