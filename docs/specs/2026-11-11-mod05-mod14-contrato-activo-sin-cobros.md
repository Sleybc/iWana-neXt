# MOD05 ↔ MOD14 · Contrato activo sin cobros

**Fecha:** 2026-11-11 · **Estado:** G0 aprobado por el usuario el 2026-11-11 (respuestas en sesión: «Desde la activación», «Aviso + acción», generación automática apagada)
**Relacionados:** ADR-109 D6 (primer cobro por activación), [fase 2](2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion.md)

## Problema

Un contrato `ACTIVE` puede no tener ningún periodo de cobro: se activó antes del primer cobro por activación (ADR-109, 2026-11-11) o el evento no generó documento, y con `automatic_generation` apagada nadie lo nota. La ficha muestra el estado de cuenta en ceros, igual que un cliente al día, y Facturación no deja rastro. Caso real: tenant `iwana`, contrato `fe648c40…`, activo desde 2026-10-30, sin periodos y sin `installation_fee` congelado (el plan tiene 50.000 RESIDENTIAL).

## Reglas

| # | Regla |
|---|---|
| R1 | «Sin cobros» = contrato `ACTIVE` sin ningún documento emitido (sin periodos o solo borradores, que no cuentan en cartera). Ampliada el 2026-11-11: con solo borradores la cartera seguía en cero sin aviso. |
| R2 | Ficha (Estado de cuenta) y pestaña Facturación muestran «Contrato activo sin cobros generados» por contrato afectado; los ceros no se presentan como «al día». |
| R3 | Acción «Generar primer cobro» (ADMIN, ACCOUNTANT con `billing.invoices.manage`). Ancla el primer cobro en la fecha civil de activación (ruta `firstChargeFrom` de ADR-109) y luego genera los periodos vencidos hasta el actual. Idempotente. |
| R4 | Si el contrato no tiene `installation_fee` congelado (NULL, contrato heredado), la acción congela el vigente del plan y segmento antes de generar, con auditoría. `0` no se toca. |
| R5 | La línea de instalación sale en el primer documento (fase 2), neta de permanencia. |
| R6 | No cambia `automatic_generation` ni la generación manual existente. |
| R7 | Si el contrato heredado no tiene datos fiscales congelados (nombre, documento, dirección), la acción los congela desde el suscriptor (documento cifrado, auditado) y los borradores de ese contrato bloqueados por `SIN_DATOS_FISCALES` se desbloquean. Decisión del usuario 2026-11-11. |
| R8 | Periodo cobrado tarde: si el vencimiento del ciclo es anterior a la fecha de generación, vence en generación + `payment_term_days` y el corte se corre los mismos días. Decisión del usuario 2026-11-11. |

## Criterios de aceptación

- CA-1: contrato ACTIVE sin periodos → aviso visible en Estado de cuenta y Facturación; con periodos → no aparece.
- CA-2: la acción genera el periodo que contiene la activación (prorrateado según la política) con línea de instalación, y los periodos siguientes hasta el actual; repetirla no duplica.
- CA-3: contrato heredado sin `installation_fee` → se congela el vigente y queda auditado.
- CA-4: sin permiso → sin botón y 403 en la API.
- CA-6: contrato heredado sin datos fiscales → borradores sin bloqueo tras la acción.
- CA-7: periodo de octubre generado el 11-nov vence el 25-nov, no el 14-oct.
- CA-5: regularización del contrato `fe648c40…` en desarrollo con la acción, desde 2026-10-30.
