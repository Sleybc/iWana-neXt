# Spec — `privacy` · H-1: el GUC de supresión no protege frente a SQL en la API

**Versión:** 1.0
**Estado:** Propuesta. Pendiente del G0 del CTO sobre §5. Toca la defensa en base de datos de DT-3; no se implementa nada antes de ese G0.
**Fecha:** 2026-11-07
**Autor:** AI-EM-ARCH
**Prioridad:** antes de G7. No bloquea K2, que no usa el GUC (spec K2 anonimizados, salida B).
**Origen:** hallazgo H-1 de la [spec K2 anonimizados](2026-11-03-privacy-k2-recifrado-anonimizados-spec.md) §8, y dictamen de `sec-eng` en B5 de esa fase (2026-11-07, P2).
**Artefactos base:** [spec DT-3](2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) D-RER-6 · migraciones 150 y 169 · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md)

> Define comportamiento. No contiene código de producción. Plan y lanzador se emiten tras el G0, porque dependen de la opción elegida.

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

## 6. Criterios de aceptación (borrador, se fijan con el G0)

| # | Criterio |
| --- | --- |
| CA-H1-01 | Con `iwana_app` y el GUC activo, reponer un dato en una columna de un titular suprimido falla con `55000`. Con la opción 3, deja un registro de intento |
| CA-H1-02 | El borrado real con ocho participantes, el CLI y su reaplicación para remediar siguen pasando, y la integración K2 sigue 5/5 |
| CA-H1-03 | `DELETE` de un titular suprimido falla siempre, con o sin GUC |
| CA-H1-04 | La lista de columnas del trigger y `CRM_RULES` no divergen: una prueba de paridad falla si cambia una sin la otra |
| CA-H1-05 | Con la opción 3, `iwana_app` no puede escribir ni borrar en la bitácora |
