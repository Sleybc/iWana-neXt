# PROMPT — MOD13: retiro de «Referencia LAN anterior» del catálogo de routers

**Versión:** 1.0
**Estado:** Emitido — decisión de alcance aprobada por el usuario el 2026-10-28
**Fecha:** 2026-10-28
**Emisor:** AI-EM-ARCH, modo Orchestrator
**Plan:** [2026-10-28-mod13-routers-retiro-columna-lan.md](../plans/2026-10-28-mod13-routers-retiro-columna-lan.md)
**Spec UX:** [2026-10-26-mod13-interfaces-ux.md](../specs/2026-10-26-mod13-interfaces-ux.md) v2.2 → v2.3
**Addendum a:** [plan de interfaces IPv4 v3.13](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md). No cambia sus gates ni su estado.

## 1. Objetivo

Retirar la columna «Referencia LAN anterior» del catálogo de routers y el bloque de solo lectura del formulario de edición. Conservar la referencia únicamente en el detalle del router, donde vive la conversión a interfaz.

El dato es heredado, no es una interfaz registrada, no se edita, no se parsea y no participa en ninguna regla de negocio (HLD D-3). En el listado no tiene acción ni filtro: es información sin uso en ese nivel.

## 2. Alcance exacto

| Superficie            | Archivo                                                              | Cambio                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabla del catálogo    | `apps/portal/src/components/network/NetworkRouterCatalogClient.tsx`  | Quitar el `<th>` «Referencia LAN anterior» (363-365) y el `<td>` que renderiza `router.lanInterface` (408-410)                                                          |
| Esqueleto de carga    | mismo archivo, línea 311                                             | Fijar `columnCount` en 9 con gestión y sin ella: la tabla muestra 10 columnas antes y 9 después del retiro en ambos permisos; el skeleton coincide con la tabla cargada |
| Formulario de edición | `apps/portal/src/components/network/NetworkRouterDrawer.tsx`         | Quitar el bloque de solo lectura «Referencia LAN anterior» (311-323)                                                                                                    |
| Detalle del router    | `apps/portal/src/components/network/NetworkRouterDetailSidePeek.tsx` | **Sin cambios.** Conserva la referencia, la nota, «Convertir en interfaz» y el estado de convertida                                                                     |
| Spec UX               | `docs/specs/2026-10-26-mod13-interfaces-ux.md`                       | v2.3: registrar el retiro y precisar la fila V2 de 13.13                                                                                                                |

## 3. Fuera de alcance

- Retirar el campo `lanInterface` / columna `lan_interface` (D6). El campo sigue en entidad, DTO y contrato; solo deja de mostrarse en catálogo y edición.
- API, DTOs de `@iwana/shared`, entidad `NetworkRouter`, migraciones y `network-catalog-labels.ts`.
- El texto «Convertida en una interfaz registrada.» del detalle: su alineación con «Convertida en \<nombre\>» es una decisión aparte, ya registrada como desviación.
- Rediseño de la tabla, cambio de `min-w-[1120px]` no requerido, reordenamiento de columnas o cambios de copy.
- Pruebas E2E: no hay flujo de usuario nuevo.

## 4. Criterios de aceptación

- **CA-1.** La tabla del catálogo no expone el encabezado «Referencia LAN anterior».
- **CA-2.** Ninguna fila del catálogo renderiza `lanInterface`; las demás columnas conservan su contenido y orden.
- **CA-3.** El esqueleto de carga declara la cantidad de columnas que realmente se renderizan.
- **CA-4.** El formulario de edición no muestra la referencia; guardar no envía `lanInterface` y no se agrega ningún campo nuevo.
- **CA-5.** El detalle conserva «Referencia LAN anterior: \<texto\>», la nota «Dato heredado. No es una interfaz registrada.» y «Convertir en interfaz» cuando `legacyLanInterfaceId` es nulo; con identificador, conserva el estado de convertida.
- **CA-6.** Cero cambios en contratos, entidad, migraciones y mensajes de error.
- **CA-7.** Suite focalizada en verde y auditoría de UI sin hallazgos nuevos.

## 5. Verificación

```
pnpm --filter @iwana/portal exec jest components/network/NetworkRouterCatalogClient.spec.tsx components/network/NetworkRouterDrawer.spec.tsx --runInBand --no-cache --coverage=false
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/network
```

Agregar en `NetworkRouterCatalogClient.spec.tsx` una aserción de ausencia del encabezado y de presencia de las columnas restantes.

## 6. Stop/go

- Si un test depende del orden o del número de columnas, se corrige el test: es parte del cambio.
- Si aparece otro uso de `lanInterface` en el listado o en la edición distinto de los dos bloques listados, emitir `[BLOQUEO]` antes de tocarlo.
- Si el cambio exige tocar contrato, API, entidad o migración, detenerse: está fuera de alcance.
- Si el detalle deja de mostrar la referencia o la conversión, revertir el cambio de esa superficie.

## 7. Entregables

Diff con rutas, evidencia de la suite con conteo real, resultado de `audit-ui.mjs` y spec v2.3 publicada. Deuda nueva por severidad, si aparece.
