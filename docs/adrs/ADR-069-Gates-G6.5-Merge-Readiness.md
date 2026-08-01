# ADR-069: Gate G6.5 de merge readiness

**Version:** 1.0  
**Estado:** Propuesto
**Propuesto por:** AI-EM-ARCH, 2026-08-01
**Fecha:** 2026-08-01  
**Modulos:** MOD09 Programacion / MOD11 Ejecucion Operativa / Plataforma transversal / Seguridad transversal

## Contexto

El expediente MOD09-MOD11 distingue la aceptacion de calidad del permiso para
operar en produccion. La remediacion puede tener pruebas locales y una revision
de seguridad completa, pero aun carecer de una ejecucion real en Linux de los
jobs que construyen las imagenes y ejercitan la vertical E2E. Usar G7 para esa
condicion mezclaria merge con release y obligaria a redefinir el gate cuando se
incorporen otros modulos.

## Decision

Se establece la siguiente taxonomia durable:

1. **G6 — Quality acceptance:** QA-01 a QA-50, lint, typecheck, pruebas del
   modulo, migraciones reversibles y re-verificacion AppSec completadas.
2. **G6.5 — Merge readiness:** G6 cumplido y una corrida Linux de GitHub Actions
   verde para `production-images` y `execution-orders-e2e`, identificada por
   SHA y con artefacto resumen sanitizado. El job E2E debe demostrar setup,
   conteo minimo de pruebas, cero fallos, cero skips y cleanup confirmado.
3. **G7 — Production authorization:** autorizacion separada de AI-EM-ARCH y
   CTO, con dominio productivo, TLS, rollback por componente, restore global y
   restore por tenant verificados. G7 no se obtiene por cumplir G6.5.

G6.5 autoriza el merge de la remediacion; nunca autoriza despliegue productivo.
Un G6 GO con G6.5 pendiente se registra como calidad aceptada, pero merge
pendiente de la corrida Linux.

## Consecuencias

- Los informes deben registrar G6, G6.5 y G7 por separado.
- Los artefactos historicos NO-GO se conservan como fotografias y no se
  reinterpretan como estado vigente.
- Las credenciales de CI son efimeras, enmascaradas y no se archivan.
- La evidencia E2E archivada debe contener solo conteos, SHA, plataforma,
  duracion y cleanup; nunca tokens, cookies, reportes brutos ni payloads.

## Rechazos

- No se usa un push futuro como evidencia de una corrida que aun no ocurrio.
- No se convierte QA-34/TLS en requisito de merge si CTO lo mantiene diferido;
  sigue siendo requisito de G7.
- No se marca G7 como GO por una imagen Docker construida correctamente.
