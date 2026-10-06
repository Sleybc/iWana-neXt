# PROMPT DE EJECUCIÓN — MOD11 ↔ MOD12 · Ola G1: revisión cruzada de la spec

**Versión:** 1.0 · **Fecha:** 2026-10-06 · **Generado por:** AI-EM-ARCH
**Spec bajo revisión:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.0 (Propuesto)
**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.0
**Tipo:** tres dictámenes de **solo lectura**. Nadie escribe código ni modifica la spec: los desacuerdos se emiten como `[CONSULTA]` o `[DESEMPATE]` a AI-EM-ARCH.

## F1 — `sr-backend`: factibilidad

Contrasta D1 a D7 con el código y responde con evidencia:

1. ¿`recordExecutionOrderMovement` (`stock-ledger.service.ts:692`) es idempotente con `idempotencyKey = inventoryRequestId` **también** en la apertura de comodato y en la publicación de eventos de dominio? ¿O un replay los duplica?
2. Clasificación D5: ¿qué excepciones lanza hoy el ledger para cada motivo de §4, y cómo se distinguen de un error técnico sin parsear mensajes?
3. D3: ¿el API puede alojar un `@Processor` en el módulo de inventario sin romper el arranque ni los tests? Toma como precedente `users-bulk-create.processor.ts`.
4. D2 y D4: ¿un `jobId` y un `eventId` deterministas alcanzan para la deduplicación de BullMQ y del inbox de MOD11 (`execution-order-events.processor.ts`)?
5. D7: ¿dónde vive la re-solicitud, con qué umbral y cómo se evita reemitir un consumo ya en vuelo?
6. ¿El contrato del §3 de la spec alcanza para `recordExecutionOrderMovement`? Señala cualquier campo que falte, por ejemplo `customerSiteLocationId` o `contractRefId`.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-G1-SR-FULL-v1.0.md`, con GO de factibilidad o la lista de cambios a la spec.

## S1 — `sec-eng`: riesgo

1. D8: tenant y actor desde el sobre interno, verificados contra `public.tenants`. ¿Hay alguna vía por la que un job elija el esquema de otro tenant? Evalúa CA-08.
2. Una mutación de inventario fuera de HTTP, con la autorización heredada del registro en MOD11: ¿es aceptable? ¿Qué condición la hace segura, por ejemplo que la custodia de origen coincida con la del ejecutor que registró?
3. ¿`subscriberId` en un payload de Redis es aceptable bajo ADR-067 (Aprobado)?
4. La DLQ y los logs del consumidor: confirma que no contienen PII.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-G1-SEC-ENG-v1.0.md`, con GO o condiciones.

## U1 — `prod-ux`: copy del rechazo

Para cada `reasonCode` del §4 de la spec, define el texto visible para el técnico en la consola: qué pasó y qué hacer. Español, sentence case, sin enums crudos y sin culpar al usuario. Añade además el texto para un consumo `PENDING` que lleva tiempo sin conciliar.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-G1-PROD-UX-v1.0.md`, con una tabla cerrada.
