# Informe G1 — MOD11 ↔ MOD12: copy de rechazos de inventario

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-10-06
**Dictamen:** Copy cerrado para los cinco motivos de rechazo de §4 y para un consumo `PENDING` prolongado.

## Copy visible para el técnico

La clave de la primera columna es una referencia interna de traducción y no se muestra en la consola. Las dos últimas columnas forman el mensaje visible: explican qué pasó y cuál es el siguiente paso.

| Referencia interna | Qué pasó | Qué hacer |
| --- | --- | --- |
| `CUSTODY_INSUFFICIENT` | No hay suficientes unidades disponibles en tu inventario asignado. | Revisa la cantidad solicitada. Si necesitas más unidades, pide a tu supervisor que actualice tu inventario asignado. |
| `SERIAL_NOT_IN_CUSTODY` | El equipo con ese número de serie no figura en tu inventario asignado. | Comprueba el número de serie. Si es correcto, pide a tu supervisor que revise la asignación del equipo. |
| `SUBSCRIBER_REQUIRED` | La orden no indica el cliente o la sede donde se instalará el equipo. | Pide a tu supervisor que complete esos datos en la orden y vuelve a registrar el consumo. |
| `ITEM_INACTIVE` | El producto seleccionado ya no está disponible para registrar consumos. | Elige otro producto disponible. Si necesitas usar este producto, pide a tu supervisor que revise su disponibilidad. |
| `LEGACY_REQUEST_UNSUPPORTED` | La solicitud anterior no tenía los datos necesarios para actualizar el inventario. | El sistema volverá a enviarla con la información de la orden. Revisa el estado más tarde; si no cambia, avisa a tu supervisor. |
| `PENDING` prolongado | El consumo aún no se ha aplicado al inventario. | No lo registres de nuevo. Revisa el estado de la orden más tarde; si sigue igual, avisa a tu supervisor. |

## Criterio de vocabulario

El mensaje usa “inventario asignado” para comunicar la custodia de origen en términos comprensibles para el técnico. No expone claves de rechazo ni otros nombres internos. El texto de `PENDING` evita sugerir un registro duplicado y da un paso claro si el estado no cambia.
