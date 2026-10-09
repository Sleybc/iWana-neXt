# Informe MOD11↔MOD12 — I4 SR-QA v1.2

**Fecha:** 2026-10-09 UTC  
**Resultado:** **GO** para las dos verificaciones de Ola 3e. El copy literal de los cuatro motivos de CA-04 está visible en la consola sobre una OT con snapshot v2; el caso histórico cumple el criterio SQL de convergencia a `REJECTED/SUBSCRIBER_REQUIRED`.

## Alcance y entorno

Se revalidaron únicamente (1) los ocho fragmentos de copy de CA-04 en la consola y (2) la convergencia del caso histórico de `SUBSCRIBER_REQUIRED`. No se repitieron los demás criterios I4.

- Datos solo del tenant sintético `i4-qa-a-20261006-9d3098f4`, schema `tenant_i4_qa_a_20261006_9d3098f4`, en PostgreSQL local, base `i4_qa_20261006_a1`.
- API local `3000`, worker local con D7 y Portal local `49190`. El Portal y el API respondieron HTTP 200 durante la verificación.
- Se autenticó con la cuenta sintética del seed. El valor de la credencial no se reproduce aquí.
- La consulta del caso histórico fue exclusivamente SQL. No se leyeron jobs de Redis ni líneas de log. No se forzó el reenvío. No se consultó ni modificó `tenant_iwana` ni sus OT reales.
- Se leyó la documentación indicada: AGENTS.md, la Decisión 1 y §Re-verificación final de Ola 3e, los informes I4 v1.0 y v1.1 y las cuatro skills requeridas.

## CA-04 — copy visible en Portal

Se abrió en el Portal real la OT sintética `I4V11-b4bfcfc0`, con `template_version_number = 2`, estado `IN_PROGRESS`. La consulta SQL de la fixture confirma cinco filas `REJECTED` y los cuatro códigos distintos; la vista de detalle cargó esa OT y mostró ambos fragmentos literales de cada motivo:

| Motivo | Qué pasó (visible) | Qué hacer (visible) | Resultado |
|---|---|---|---|
| `CUSTODY_INSUFFICIENT` | No hay suficientes unidades disponibles en tu inventario asignado. | Revisa la cantidad solicitada. Si necesitas más unidades, pide a tu supervisor que actualice tu inventario asignado. | **VISIBLE** |
| `ITEM_INACTIVE` | El producto seleccionado ya no está disponible para registrar consumos. | Elige otro producto disponible. Si necesitas usar este producto, pide a tu supervisor que revise su disponibilidad. | **VISIBLE** |
| `SERIAL_NOT_IN_CUSTODY` | El equipo con ese número de serie no figura en tu inventario asignado. | Comprueba el número de serie. Si es correcto, pide a tu supervisor que revise la asignación del equipo. | **VISIBLE** |
| `SUBSCRIBER_REQUIRED` | La orden no indica el cliente o la sede donde se instalará el equipo. | Pide a tu supervisor que complete esos datos en la orden y vuelve a registrar el consumo. | **VISIBLE** |

Se usó navegador Playwright contra el Portal y el API locales, con navegación y peticiones reales; no se interceptó HTTP. Las ocho aserciones de texto literal resultaron verdaderas y la cabecera de la OT identificó `I4V11-b4bfcfc0`.

## Caso histórico — convergencia por SQL

El uso histórico de `SUBSCRIBER_REQUIRED` ya estaba decidido al tomar la primera lectura SQL de esta corrida. Su último envío registrado era más de 15 minutos anterior a la consulta, y el resultado persistido cumple la Decisión 1:

| Campo SQL | Valor observado |
|---|---|
| OT sintética | `I4V11-CA04-1791461028820-4` |
| `template_version_number` | `2` |
| `inventory_request_id` | `a8dfc0cc-6249-494e-b628-84a8441de848` |
| `movement_status` | `REJECTED` |
| `rejection_reason_code` | `SUBSCRIBER_REQUIRED` |
| `request_attempts` | `4` |
| Recibo `outcome` / `reason_code` | `REJECTED` / `SUBSCRIBER_REQUIRED` |
| `last_requested_at` | `2026-10-08 12:51:00.050422+00` |
| `decided_at` del recibo | `2026-10-08 12:51:05.171890+00` |
| Diferencia envío→recibo | `5.1` segundos |
| Tiempo desde el último envío en la comprobación (`2026-10-09 10:11:35+00`) | `1280.6` minutos |

Consulta SQL usada para verificar el resultado, recibo y ventana de 15 minutos:

```sql
SELECT now() AS checked_at,
       eo.execution_order_number,
       eo.template_version_number,
       u.inventory_request_id,
       u.movement_status,
       u.rejection_reason_code,
       u.request_attempts,
       u.last_requested_at,
       round(extract(epoch FROM (now() - u.last_requested_at)) / 60, 1)
         AS minutes_since_last_request,
       r.outcome AS receipt_outcome,
       r.reason_code AS receipt_reason_code,
       r.decided_at,
       round(extract(epoch FROM (r.decided_at - u.last_requested_at)), 1)
         AS seconds_request_to_receipt
FROM tenant_i4_qa_a_20261006_9d3098f4.execution_order_item_usage u
JOIN tenant_i4_qa_a_20261006_9d3098f4.execution_orders eo
  ON eo.id = u.execution_order_id
LEFT JOIN tenant_i4_qa_a_20261006_9d3098f4.inventory_execution_request_receipts r
  ON r.inventory_request_id = u.inventory_request_id
WHERE eo.execution_order_number = 'I4V11-CA04-1791461028820-4'
  AND u.rejection_reason_code = 'SUBSCRIBER_REQUIRED';
```

El worker con D7 quedó activo durante la comprobación, pero el registro ya no estaba `PENDING`, así que no hubo un nuevo reenvío que observar en esta sesión. No se atribuye la transición a un proceso concreto ni se formula una hipótesis histórica. Bajo el criterio acordado, el estado SQL durable demuestra convergencia con el código vigente y el caso no se reproduce como pendiente.

## Dictamen

**I4 v1.2: GO** para el copy visible de CA-04 y la convergencia SQL del caso histórico. No se hizo commit.
