# PROMPT DE EJECUCIÓN — MOD11 ↔ MOD12 · Reverso de consumo · Ola G1 (revisión cruzada)

**Versión:** 1.0 · **Fecha:** 2026-10-09 · **Generado por:** AI-EM-ARCH
**Spec bajo revisión:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` v1.0 (Propuesto)
**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` v1.0
**Contexto obligatorio:** spec hermana de consumo v1.1, sobre todo D4, D5, D8, D10, D11 y su §10. El reverso reutiliza toda esa infraestructura.
**Tipo:** tres dictámenes de **solo lectura**. Nadie escribe código ni modifica la spec. Un desacuerdo es `[CONSULTA]` o `[DESEMPATE]` a AI-EM-ARCH, con evidencia de código. **Las decisiones de producto P1 a P4 del CTO no se re-litigan.**

## F1 — `sr-backend`: factibilidad

1. **R6:** ¿el ledger permite contrarrestar un movimiento por referencia (`originalStockMovementId`)? ¿O hace falta una operación nueva? ¿Cómo se determinan el sitio del cliente y la custodia móvil de origen sin que MOD11 los envíe?
2. **R6:** ¿`closeOpenLoanWithManager` alcanza para cerrar el comodato en la misma transacción que el movimiento? ¿Qué pasa si el comodato ya estaba cerrado?
3. **R7:** ¿qué validaciones concretas detectan `REVERSAL_ASSET_MOVED`, `REVERSAL_CUSTODY_INACTIVE` y `REVERSAL_ORIGINAL_NOT_FOUND` sin leer el texto de los errores?
4. **§4:** ¿recibo de reverso en `inventory_execution_request_receipts` con una columna `kind`, o en una tabla propia? Recomienda una y justifícala, incluido su impacto en D7 y en la limpieza de D11.
5. **R5:** ¿el cotejo con el outbox, la firma, el consumidor, D7 y la limpieza de 24 horas se extienden al nuevo tipo **sin duplicar código**? Señala los puntos exactos.
6. **R8:** ¿cómo excluye el evaluador las líneas revertidas en los **dos** caminos que evalúan, progreso y cierre? Es el mismo modo de fallo que documentó la spec de acta de instalación.
7. ¿`StockMovementOrigin` vive solo en TypeScript o también en la base de datos? Eso decide si la migración 141 lo toca.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-G1-SR-FULL-v1.0.md`, con GO de factibilidad o la lista de cambios a la spec.

## S1 — `sec-eng`: riesgo

1. **R1:** ¿basta `SUPERVISE` más `assertSupervisionScope` para un reverso **posterior al cierre**? ¿Hace falta auditoría reforzada o un doble control?
2. Motivo en texto libre con filtro anti-PII: ¿alcanza el patrón `safeTextField`? ¿El motivo viaja en el evento, o se queda en MOD11?
3. ¿El nuevo tipo de evento hereda **todas** las garantías de procedencia y retención (cotejo con el outbox, HMAC, D11 y Redis autenticado por ADR-074 (Aprobado))? ¿Se abre alguna vía nueva?
4. Abuso: ¿un supervisor puede usar reversos en cadena para sacar equipos de inventario sin rastro? Evalúa R3 (una solicitud por línea) y propón límites si hacen falta.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-G1-SEC-ENG-v1.0.md`, con GO o condiciones.

## U1 — `prod-ux`: copy

Texto visible, en español, en sentence case, sin enums crudos y sin culpar a nadie, para:

- el **diálogo de reverso** del supervisor: título, explicación de lo que va a pasar (el equipo vuelve a la custodia del técnico y se cierra el comodato), campo de motivo obligatorio y confirmación;
- los **estados** del reverso en la línea: pendiente, confirmado y rechazado;
- los **tres motivos de R7**: qué pasó y qué hacer;
- la marca **«Corrección posterior al cierre»** sobre una OT terminal;
- el requisito que **vuelve a pendiente** después de un reverso.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-REVERSO-G1-PROD-UX-v1.0.md`, con una tabla cerrada.
