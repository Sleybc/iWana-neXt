# INFORME-MOD10-ASSURANCE-UI-COLA-v1.0

**Version:** 1.0
**Fecha:** 2026-08-19
**Modulo:** MOD10 — Service Assurance
**Tipo:** Correccion visual de cola operativa

## Contexto

En `/dashboard/assurance`, la seccion `Cola operativa de tickets` mostraba el encabezado/filtros en una tarjeta separada de la tabla. La superficie completa debia leerse como una sola tabla operativa, sin menus o acciones ajenas en su encabezado.

## Cambio aplicado

- Se mantuvo el CTA `Nuevo ticket` en el encabezado principal de `Mesa de ayuda`.
- Se mantuvo un `PortalPanel` exterior con titulo, filtros y tabla inset dentro del mismo contenedor.
- Se retiro el menu horizontal de pestañas por no pertenecer al flujo de Assurance.
- Se mantuvo el contenedor superior `Mesa de ayuda` y su subtitulo en el estado normal de la pagina.
- Se retiro unicamente su boton `Nuevo ticket`.
- Se mantuvo el CTA `Nuevo ticket` en el titulo de `Cola operativa de tickets`.
- El estado vacio usa `PortalEmptyState` embebido y ocupa el ancho util de la tabla, sin una segunda tarjeta `max-w-xl`.
- Se actualizaron las pruebas para garantizar que la cola no renderice el CTA de creación.

## Archivos

- `apps/portal/src/components/assurance/AssuranceTicketsTable.tsx`
- `apps/portal/src/components/assurance/AssuranceTicketsTable.spec.tsx`
- `apps/portal/src/components/assurance/AssuranceClient.tsx`

## Evidencia

- Suite Assurance: **4 suites / 13 tests PASS**.
- Typecheck portal: `pnpm --filter @iwana/portal typecheck` — **PASS**.
- Lint puntual de archivos modificados — **PASS**.
- Auditoria mecanica de identidad: sin hallazgos en los archivos modificados; el unico hallazgo P3 del barrido es el spinner preexistente de `AssuranceClient.tsx:840`, fuera del alcance de este fix.
- Validacion DOM en `http://localhost:3002/dashboard/assurance`: el contenedor superior `Mesa de ayuda` permanece sin boton; `Nuevo ticket` queda en `Cola operativa de tickets`, sin menu horizontal.

## Impacto

Tenant, seguridad, API, datos y regulacion: sin impacto. Cambio limitado a composicion visual y pruebas del portal.
