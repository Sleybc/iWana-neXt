# Spec — `privacy` · H-1: el GUC de supresión no protege frente a SQL en la API

**Versión:** 1.0
**Estado:** Aprobada. G0 del CTO el 2026-11-07: opciones 1 y 3 (§7). Publicada en `49e8448f` (G6.5 ✅ 2026-11-08). D-H1-5 cerrada por el CTO el 2026-11-08.
**Fecha:** 2026-11-07
**Autor:** AI-EM-ARCH
**Prioridad:** antes de G7. No bloquea K2, que no usa el GUC (spec K2 anonimizados, salida B).
**Origen:** hallazgo H-1 de la [spec K2 anonimizados](2026-11-03-privacy-k2-recifrado-anonimizados-spec.md) §8, y dictamen de `sec-eng` en B5 de esa fase (2026-11-07, P2).
**Artefactos base:** [spec DT-3](2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) D-RER-6 · migraciones 150 y 169 · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md)

> Define comportamiento. No contiene código de producción. **Plan:** [2026-11-07-privacy-h1-guc-supresion-orquestacion.md](../plans/2026-11-07-privacy-h1-guc-supresion-orquestacion.md) · **Lanzador:** [PROMPT-PRIVACY-H1-GUC-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-H1-GUC-LAUNCH-v1.0.md)

## 1. Problema

El trigger de la 169 (`titular_prevent_anonymized_mutation`) rechaza todo `UPDATE` y `DELETE` sobre filas de un titular anonimizado, salvo que la transacción fije `iwana.titular_erasure = 'on'`. PostgreSQL no restringe quién fija una variable con prefijo propio. Medido el 2026-11-03 (spec K2 §3.1): `iwana_app`, el rol de la API, fija el GUC y reescribe cualquier columna de un titular anonimizado.

Hoy el GUC frena errores y escritores olvidados, no a un atacante. Con SQL en el rol de la API (inyección o RCE) se puede:

- volver a poblar un titular suprimido con datos reales o falsos, lo que es reidentificación y rompe la prueba de la supresión;
- borrar filas de prueba, que solo frenan las llaves foráneas;
- fijarlo con `set_config(..., false)` a nivel de sesión, envenenar una conexión del pool y desactivar el trigger para todas las peticiones que pasen por ella.

La confidencialidad no empeora: lo suprimido ya no está en la base, y ese atacante ya lee los datos vivos. Lo que se pierde es la integridad de la supresión. Su alcance legal bajo la Ley 1581 requiere dictamen jurídico.

## 2. Usos legítimos del GUC

Solo dos archivos lo fijan, ambos con `is_local = true` (D-RER-6, guarda en `crm-blocked-mutations.arch.spec.ts`):

| Uso | Archivo | Qué escribe |
| --- | --- | --- |
| Supresión por la aplicación | `crm-personal-data-erasure.adapter.ts` | Lleva un titular al estado suprimido |
| Supresión y remediación por CLI | `cli/anonymize-titular.ts` | Lo mismo; también reaplica sobre un titular ya suprimido para remediar (D-K2A-5, D-HN-7) |

Ninguno necesita mover un titular suprimido hacia un estado con datos.

El 2026-11-07 se probó exigir una bandera `--remediate` para reaplicar sobre un titular ya suprimido (P2-3 de B5). Se descartó: rompe la remediación aprobada de H-2 (D-HN-7) y la prueba de paridad CLI↔API, y no añade protección, porque reaplicar es idempotente y solo lleva al estado suprimido. Lo que falta es el rastro de esa reaplicación, y lo da la opción 3.

## 3. Opciones

Dictamen de `sec-eng`, de menor a mayor coste.

| # | Opción | Efecto | Coste |
| --- | --- | --- | --- |
| 1 | **Trigger monótono.** Con el GUC activo y `OLD.anonymized_at` fijado, solo acepta cambios hacia el estado suprimido: cada columna personal pasa a `NULL`, al marcador o se queda igual. `DELETE` siempre rechazado | Elimina la reidentificación sin tocar roles. Sigue sirviendo a la API, al CLI y a la remediación | Migración que reemplaza la función de la 169, con la lista de columnas por tabla; enmienda D-RER-6 |
| 2 | **GUC atado a la solicitud.** El valor pasa a ser el UUID de la solicitud; el trigger exige que exista en estado de supresión y que coincida con `anonymized_request_id` | Reduce el radio de acción y los errores | No frena a quien escribe en `data_subject_requests`. Solo tiene sentido junto con la 1 |
| 3 | **Bitácora a prueba de manipulación.** Una función `SECURITY DEFINER` del dueño registra en una tabla append-only, sin escritura para `iwana_app`, cada mutación con el GUC: txid, `session_user`, tabla, id, columnas y solicitud | Detecta, incluido el envenenamiento de sesión. Da la auditoría que hoy falta en el CLI (P2-3 de B5) | Tabla, función, retención y lectura para el oficial |
| 4 | **Rol dedicado** (`iwana_privacy_eraser`, pool propio). El trigger exige ese `session_user` | Frena la inyección SQL, no la RCE | Mueve toda la transacción de supresión, con sus ocho participantes, a otra conexión. Descartado en la spec K2 §8 |

## 4. Recomendación

**1 y 3 antes de G7. La 2, solo si sale barata en la misma migración.**

- La 1 cierra el riesgo principal, la reidentificación, sin cambiar la arquitectura de conexiones.
- La 3 cubre lo que la 1 no ve: el envenenamiento de sesión y la falta de rastro del CLI.
- Ninguna toca K2: su dry-run sigue ensayando la escritura y la salida B no deja cifrado en filas protegidas.

**Riesgos de la 1:**

- La lista de columnas «hacia suprimido» tiene que salir de las reglas reales del borrado (`CRM_RULES`), no de una copia. Una prueba de paridad debe fallar si divergen.
- El orden marcar → anular de D-K2A-3 hace que `subscribers` pase por esta rama nueva. Hay que probarlo con el borrado real de ocho participantes.

## 5. Puntos para el G0 del CTO

1. Opciones a implementar: **1 + 3** (recomendado), solo la 1, o aceptar el riesgo por escrito hasta G7.
2. Si se suma la 2 en la misma migración.
3. Retención y lectores de la bitácora, si se elige la 3: por defecto, la del registro de supresión y solo el oficial de privacidad.
4. Enmienda de D-RER-6 en la spec DT-3: «rechaza todo `UPDATE`» pasa a «rechaza todo cambio que no lleve al estado suprimido».
5. Dictamen jurídico sobre la integridad de la supresión bajo la Ley 1581, con abogado (ADR-094 §7.3).

## 6. Criterios de aceptación

| # | Criterio |
| --- | --- |
| CA-H1-01 | Con `iwana_app` y el GUC activo, reponer un dato en una columna de un titular suprimido falla con `55000`. No deja registro: el `RAISE` revierte la transacción, incluida la bitácora (D-H1-2) |
| CA-H1-02 | El borrado real con ocho participantes, el CLI y su reaplicación para remediar siguen pasando, y la integración K2 sigue 5/5 |
| CA-H1-03 | `DELETE` de un titular suprimido falla siempre, con o sin GUC |
| CA-H1-04 | La lista de columnas del trigger y `CRM_RULES` no divergen: una prueba de paridad falla si cambia una sin la otra |
| CA-H1-05 | `iwana_app` no puede insertar, modificar ni borrar en la bitácora, ni directamente ni invocando una función: no existe función escritora que pueda llamar (D-H1-2). Una llamada directa con el GUC fijado no deja ninguna entrada |
| CA-H1-06 | Cada mutación permitida con el GUC sobre una fila suprimida deja una entrada con txid, `session_user`, tabla, id, columnas cambiadas y solicitud; un `--apply` de remediación del CLI también |
| CA-H1-07 | La migración hace `up → down → up`; `down` restaura la función de la 169 y conserva la bitácora |

## 7. Decisiones del G0 (2026-11-07)

El CTO aprobó las opciones 1 y 3. Los puntos 3 y 4 de §5 se toman con su valor por defecto; la opción 2 queda fuera.

### D-H1-1. Trigger monótono

Una migración tenant nueva reemplaza `titular_prevent_anonymized_mutation()`. Número: el siguiente libre en `runner.ts` al lanzar (hoy 178, porque el barrido ocupa la 177).

- **Sin GUC:** igual que hoy, rechaza todo `UPDATE` y `DELETE` sobre filas de un titular suprimido.
- **Con GUC y fila no suprimida:** igual que hoy, deja pasar. Es la primera supresión de expedientes, que marcan al final.
- **Con GUC y fila suprimida:** `DELETE` siempre rechazado. Un `UPDATE` pasa solo si cada columna que cambia cumple su transición permitida:
  - columna personal de texto o número: queda en `NULL` o en el marcador de su regla (`ANONIMIZADO`, el SHA-256 de `marcador:id` para los hashes heredados; el estrato queda en `NULL` desde la 177, ADR-104);
  - `jsonb`: el valor nuevo es `'{}'` o está contenido en el anterior (`OLD @> NEW`), que es lo que hace la redacción de snapshots;
  - columnas de control (`updated_at`, `anonymized_*`, la transición de archivo que la 169 ya admite): sin cambio de reglas. La 150 sigue protegiendo `anonymized_*`.
- Cubre las tablas de la 169: `subscribers`, `expediente_records` y `contracts`. Las demás tablas de participantes no tienen este trigger y quedan fuera.

**Catálogo de columnas.** Vive en la migración, porque `packages/database` no importa de `apps/api`. Una prueba de paridad en `apps/api` lo compara con `CRM_RULES` y las reglas de contrato del participante, y falla si divergen (CA-H1-04). La integración de la 178 comprueba además con `pg_get_functiondef` que cada columna del catálogo tiene su transición en el SQL que corre.

**`search_path` fijo (corrección del 2026-11-08, P1-1 de `sec-eng`).** El trigger corre con los privilegios y el `search_path` de quien lo dispara, que es justo el actor a contener. Con un `search_path` heredado, `iwana_app` podía tapar `subscribers` con una tabla temporal o crear operadores falsos en `public`. Las funciones de la 178, y las de la 150 y la 170 que comparten tabla, fijan `search_path = pg_catalog, pg_temp`, y la consulta a `subscribers` va calificada con `TG_TABLE_SCHEMA`. La 178 rellena también `contracts.anonymized_at` donde el suscriptor ya estaba suprimido.

**Rollback.** El `down` de la 178 restaura la 169 tal cual, y con ella el `search_path` heredado: reabre el P1-1 y el paso libre con el GUC. En producción, revertir la 178 reabre H-1 entero; se trata como incidente de seguridad, no como rollback de rutina.

### D-H1-2. Bitácora append-only

- Tabla tenant `privacy_erasure_mutation_log`: id, `occurred_at`, txid, `session_user`, tabla, id de fila, operación, columnas cambiadas y `anonymized_request_id`.
- Solo escribe en ella una **función de trigger** `AFTER UPDATE`, `SECURITY DEFINER` del dueño (`iwana_migrator`), con `search_path` fijado, sobre las tres tablas de la 169. Registra cuando la mutación usó el GUC sobre una fila suprimida, en la bitácora del schema de la propia fila (`TG_TABLE_SCHEMA`) y con las columnas cambiadas calculadas de `OLD` y `NEW`.
- **No existe función escritora invocable.** PostgreSQL no permite llamar a una función de trigger fuera de un trigger, así que el rol de la API no puede insertar entradas falsas ni elegir el schema. `EXECUTE` revocado a `PUBLIC` en las funciones nuevas. (Corrección del 2026-11-08: la primera entrega de B1 usaba un escritor con parámetros y `EXECUTE` por defecto para `PUBLIC`, falsificable por `iwana_app`.)
- `iwana_app` no tiene `INSERT`, `UPDATE` ni `DELETE` sobre la tabla. Un trigger propio rechaza `UPDATE` y `DELETE`.
- Registra solo lo permitido: un rechazo revierte la transacción entera (CA-H1-01). El envenenamiento de sesión no se registra como tal; se ve como mutaciones permitidas con su `session_user` y txid, y aun así solo pueden llevar al estado suprimido.

### D-H1-3. Retención y lectura (punto 3, por defecto)

La misma retención que el registro de supresión de la solicitud. Lectura solo para el oficial de privacidad, por consulta documentada en el runbook. Sin endpoint en esta fase.

### D-H1-4. Enmienda de D-RER-6 (punto 4)

La spec DT-3 cambia «rechaza todo `UPDATE`» por «rechaza todo cambio que no lleve al estado suprimido», y cita esta spec. `crm-blocked-mutations.arch.spec.ts` no cambia: el GUC sigue reservado a los dos archivos de §2.

### D-H1-5. Alcance legal de la integridad de la supresión (punto 5)

**Cerrada por el CTO el 2026-11-08.** El criterio jurídico de soporte está contrastado en [INFORME-PRIVACY-CONTRASTE-DICTAMEN-JURIDICO-v1.0](../informes/INFORME-PRIVACY-CONTRASTE-DICTAMEN-JURIDICO-v1.0.md) §3 y §8, y **no tiene firma de abogado registrada**. El CTO asume el criterio; la firma sigue pendiente para `docs/legal/`.

Para declarar cumplida la integridad de la supresión en G7 hace falta:

1. **Inventario de ubicaciones** del titular: tablas, adjuntos y metadatos, colas, cachés, réplicas, exportaciones, logs, encargados y backups.
2. **Evidencia de ejecución** por ubicación, y **pruebas de no reaparición**. El trigger monótono y la bitácora de esta spec cubren la base.
3. **Registro de excepciones:** dato conservado, fundamento, finalidad, acceso y vencimiento. Incluye el expediente de vinculación (ADR-094 §D7, enmienda 1.1), la facturación y la propia bitácora (D-H1-3).
4. **«Anonimizado» solo donde se demuestre irreversibilidad.** Un titular suprimido que conserva su UUID enlazado a contratos o facturas es dato personal conservado por excepción, y así se declara.
5. **Backups:** la supresión se reaplica antes de habilitar una restauración. La rotación de copias, por sí sola, no acredita la supresión.

Si queda una copia recuperable sin excepción justificada, G7 no certifica «supresión integral completada».
