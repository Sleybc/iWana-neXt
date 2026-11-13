# MOD14 · Primer cobro completo: valor real de la instalación y retenciones

**Fecha:** 2026-11-13 · **Estado:** G0 aprobado por el usuario el 2026-11-13; mano de obra fuera del valor real salvo que se configure (abierto)
**Relacionados:** [IVA por concepto y cortesías](2026-11-12-mod14-iva-por-concepto-y-cortesias.md), [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md), [ADR-109](../adrs/ADR-109-Contrato-Firmado-en-Instalacion-y-PDF-en-Worker.md), MOD11/MOD12 (consumo de materiales en la OT)

## Lo que ya cubre el primer cobro

Plan congelado en el contrato, prorrateo por fecha de corte (pesos enteros, vencimiento corrido si es tarde), instalación con IVA 19 % neta de permanencia, productos y servicios adicionales con precio e IVA congelados, IVA del internet por estrato, cortesías.

## Brechas

1. Los materiales y equipos que el técnico registra en la OT de instalación no llegan al cobro: el cliente no ve lo que realmente vale su instalación.
2. Las retenciones (retefuente, reteICA) de clientes empresa no se registran al pagar: el documento queda con saldo aunque el cliente pagó neto de retención.

## Decisiones del usuario (2026-11-13)

| # | Decisión |
|---|---|
| D1 | Los materiales y equipos de la instalación **no se cobran**: se cuantifican y se muestran como detalle informativo dentro del cargo de instalación («valor real de la instalación»). |
| D2 | Las retenciones se registran **al registrar el pago**, con su certificado, y saldan el documento. |
| D3 | Contador, 2026-11-13. Agente retenedor = **solo** el titular con **O-23** en `subscribers.rut_responsibilities`, sea persona natural o jurídica. Ser persona jurídica u O-13 ya no basta. `eligibility` de las opciones de retención queda `AGENTE_RETENEDOR` o `null`; `PERSONA_JURIDICA` se retira del contrato (`@iwana/shared`, OpenAPI y portal en el mismo cambio). Reemplaza C1. |
| D4 | Contador, 2026-11-13. **Ajuste al peso**: el valor de la retención es exactamente base × tarifa redondeado al peso entero (la mitad hacia arriba), sin tolerancia; se escribe en pesos enteros. Se retira `BILLING_WITHHOLDING_ROUNDING_TOLERANCE_CENTS`. La tolerancia de tarifa de H-1 (c), `BILLING_WITHHOLDING_RATE_TOLERANCE_PP`, se mantiene. Reemplaza la tolerancia de 1 peso de C2. |
| D5 | Contador, 2026-11-13. El **número de certificado se conserva** al suprimir al titular: es soporte contable y tributario del ISP. El participante de supresión de Billing ya no lo vacía; el manifiesto de texto libre lo clasifica EXCLUIDA. Las lecturas lo siguen ocultando con DATOS_BLOQUEADOS sin permiso o titular anonimizado (H-2). Reemplaza C5 en lo que toca a la supresión. |

## Reglas

| # | Regla |
|---|---|
| R1 | Al cerrar la OT de instalación, el consumo (cantidad por ítem, seriales de equipos) queda asociado al contrato. |
| R2 | Valor de referencia por ítem: precio vigente del producto comercial vinculado (MOD06); si no hay, costo promedio de inventario. Se congela al cerrar la OT. |
| R3 | El primer cobro lleva, bajo la línea de instalación, el desglose informativo: materiales y equipos con cantidad y valor de referencia, mano de obra si se configura, **valor real** total y **valor cobrado** (el cargo de instalación). No cambia base, IVA ni total del documento. |
| R4 | El PDF del documento y el portal muestran ese desglose. Equipos en comodato se marcan como «en comodato» (valor informativo, se devuelven). |
| R5 | Si la OT cierra después de generar el primer cobro, el desglose se agrega al documento (borrador o emitido) sin alterar montos; idempotente por OT. |
| R6 | Pago con retenciones: el registro de pago admite líneas de retención (tipo de los presets de Tributación: RETE_FUENTE_SERVICIOS, RETE_ICA; base, tarifa, valor, número de certificado). Valor recibido + retenciones aplica contra el saldo. |
| R7 | Solo para titulares agentes de retención (O-23 en el RUT, D3); las tarifas sugeridas salen de Tributación y son editables. |
| R8 | El estado de cuenta muestra retenciones por documento y en total; quedan auditadas; anular el pago anula sus retenciones. |

## Criterios de aceptación

- CA-1: instalación con 60 m de cable y conectores registrada en la OT → el primer cobro muestra el desglose con valor real; el total cobrado no cambia.
- CA-2: OT cerrada después del primer cobro → el desglose aparece en el documento emitido sin cambiar montos.
- CA-3: router en comodato aparece como «en comodato» con su valor de referencia.
- CA-4: empresa paga 1.000.000 con retefuente 4 % y reteICA → el documento queda saldado; el estado de cuenta muestra las retenciones.
- CA-5: anular ese pago revierte las retenciones y reabre el saldo.

## Decisiones de implementación del bloque C (sr-backend, 2026-11-13)

| # | Decisión |
|---|---|
| C1 | Marca de agente retenedor (R7): sin columna nueva. ~~Puede retener el titular con `person_type = JURIDICA` o con O-13 u O-23.~~ Reemplazada por D3: solo O-23 en `subscribers.rut_responsibilities`. La leen los puertos `lockTitularForBillingWrite` y `findTitularWithholdingEligibility` de CRM. |
| C2 | Tarifa sugerida (R7): definición activa del tenant en Tributación (`TaxCatalogReadPort`); si no hay, el preset del sistema. Editable. ~~El valor puede diferir de base × tarifa en 1 peso como máximo.~~ Reemplazado por D4: el valor es exactamente base × tarifa ajustado al peso. |
| C3 | Cada retención se atribuye a un documento que el mismo pago salda (explícito o el primero con espacio, en orden FIFO o manual). Las retenciones de un documento no superan lo que el pago le aplica. |
| C4 | `billing_payments.amount` sigue siendo el valor recibido. La capacidad del pago (FIFO, aplicación manual, saldo a favor) es valor recibido + retenciones vigentes. |
| C5 | El número de certificado es obligatorio en el contrato. ~~Lo vacía la supresión del titular.~~ Por D5 se conserva como soporte contable y solo se oculta en lecturas (H-2). |

## Correcciones de la revisión (sr-backend, 2026-11-13)

| # | Decisión |
|---|---|
| H-1 | Con el documento `FOR UPDATE`: (a) una sola retención vigente por (documento, tipo), también entre pagos (índice único parcial en la 206); (b) la base acumulada del tipo no supera el subtotal antes de IVA; (c) la tarifa no supera la sugerida de Tributación (o el preset) más `BILLING_WITHHOLDING_RATE_TOLERANCE_PP` (puntos porcentuales, defecto 2, de 0 a 100). Por encima exige `BILLING_COURTESIES_MANAGE` y queda auditada (`rateAboveCeiling`); sin permiso, 422 `BILLING_WITHHOLDING_RATE_ABOVE_CEILING`. (a) y (b) responden 422 `BILLING_WITHHOLDING_DUPLICATE` y `BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL`. Sin tarifa sugerida, cualquier tarifa exige el permiso. |
| H-2 | Detalle, registro, aplicación y anulación de pagos aplican la regla del listado: titular anonimizado, o con DATOS_BLOQUEADOS sin permiso, recibe certificado, referencia, nota y nota de anulación en null; con permiso se audita `RECORD_ACCESS`. El listado y el estado de cuenta también redactan referencia y notas (el participante de supresión las vacía; el certificado se conserva por D5 y solo se oculta). En lectura, si no se pueden verificar marcas o auditar, 503; en escritura (pago ya confirmado) se redacta. |
| H-3 | Anular un documento anula sus retenciones vigentes (`voided_at`/`voided_by`, auditoría en el documento y en cada pago). Dejan de sumar a la capacidad del pago: no saldan el documento de reemplazo. |
| H-4 | Retenciones y aplicaciones van en la misma transacción; si aplicar falla, ninguna queda confirmada. |
| H-5 | `withoutContract`: hasta 3 intentos con el backoff exponencial del productor (1 s, 2 s) antes de descartar con log. |
| H-7 | Opciones de retención: lectura sin `FOR SHARE` (`findTitularWithholdingEligibility`). |
| M3 | La valoración del consumo importa el módulo fino `CommercialCatalogReadModule` (MOD06), que CommercialModule también importa y reexporta: una sola instancia del adaptador. |
| M5 | Si el worker no tiene la cola de facturación, el cierre de MOD11 se proyecta igual y deja log de error; un fallo de Redis al encolar sí revierte y reintenta. |

## Abierto

- Mano de obra en el valor real: ¿valor fijo por plan o no se muestra?

## Mano de obra en el valor real (prevista, sin construir)

Decisión del usuario 2026-11-13: queda prevista hasta capturar los datos. Estado actual de la OT de instalación:

| Dato | Hoy | Falta |
|---|---|---|
| Técnico asignado | `assigned_technician_id` | — |
| Tiempo en sitio | `started_at` → `closed_at` | Llegada al sitio como evento propio |
| Salida hacia el cliente | Estado `EN_ROUTE` sin hora registrada | Hora de cada transición de estado |
| Desplazamiento (km/tiempo) | No | Ubicación de salida o estimación sede → cliente |
| Personal adicional | `assigned_crew_id` sin cuadrillas | Cuadrillas, integrantes y horas por persona |
| Pausas | No | Registro de pausas |
| Tarifas | No | Tarifa por hora por rol y costo de desplazamiento por sede |

Fórmula prevista: horas en sitio × personas × tarifa + desplazamiento, informativa dentro del valor real (sin cobro).
