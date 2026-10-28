# INFORME-MOD13-INTERFACES-IMPLEMENTACION-FE-v1.0

**Estado:** implementación FE contra contrato G4 congelado; integración runtime pendiente de O2-H/O2-M.  
**Fecha:** 2026-10-26  
**Alcance:** `apps/portal/src/**` y el ajuste ARIA acotado de `@iwana/ui` autorizado por AI-EM-ARCH.

## Resultado

La consola del tenant consume los tipos compartidos de MOD13 y permite consultar routers, abrir su detalle enlazado por `routerId`, registrar interfaces y consultar direcciones existentes. El alta de una red mantiene el router como contexto, permite seleccionar una interfaz o capturar manualmente bloque y gateway, muestra el origen de las propuestas y deja editable el nombre sugerido.

El alta desde el router recién creado ofrece «Guardar y añadir red» y conserva ese router en el segundo formulario. Si el guardado de la red falla, el router ya persistido se conserva y el formulario permite reintentar la red. «Guardar router» sigue disponible como acción separada.

Las redes existentes conservan CIDR y gateway al cambiar la asociación de interfaz. El PATCH omite la asociación si no se modificó, envía `null` al quitar una asociación existente y envía `interfaceVersion` al elegir otra interfaz. El PATCH de router también omite sede física y nodo comercial sin cambios y envía `null` si se quitan explícitamente.

La consulta de interfaces y redes mantiene independientes el estado del catálogo y la disponibilidad para reservas. La captura y corrección de IP locales se habilita solo cuando el metadato autorizado devuelve `ipProtection: ACTIVE`; con `PENDING` o sin verificación no aparecen esas acciones. El texto de estado evita afirmar que las direcciones ya están protegidas.

Las opciones de sede física usan `GET /network/router-site-options`, con páginas remotas de hasta 100 elementos, y solo se consultan en la vista de gestión. La lista muestra el estado de cada sede y permite cargar la página siguiente; la tabla de routers toma el resumen de sede incluido en cada `RouterListDto`, sin depender de un listado organizacional truncado.

Las sedes inactivas no se ofrecen para nuevas asociaciones. En edición, la sede inactiva ya asociada permanece visible y seleccionada como referencia, pero deshabilitada; las respuestas tardías de interfaces o direcciones se descartan cuando cambia el router o la interfaz activa.

La dirección de administración no alimenta sugerencias de gateway. El formulario no propone `.1` ni rangos para servicios; el rango se ingresa manualmente. Las candidatas `/32` se presentan como no aptas para derivar un bloque. La capacidad previa se etiqueta como estimación y la disponibilidad final queda en la respuesta del servidor.

La referencia LAN anterior permanece como dato heredado de solo lectura hasta que la persona elija convertirla. La sede física incluye su tipo y permanece diferenciada del nodo comercial de cobertura.

## Contratos y rutas consumidas

El cliente de [api-client.ts](../../apps/portal/src/lib/api-client.ts) usa `RouterListDto` para `listRouters`, `RouterDetailDto` para `getRouter`, `Ipv4NetworkExtendedDto` para el listado y `RouterDetailDto`/DTOs de interfaz y dirección para el detalle. No se añadieron tipos paralelos ni se editaron `packages/shared` u OpenAPI.

La UI consume los contratos de estas operaciones:

| Operación                                                                      | Ruta                                                                                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Listar routers / detalle por ID                                                | `GET /network/routers`; `GET /network/routers/:id`                                                                                              |
| Crear, editar y cambiar estado de router                                       | `POST /network/routers`; `PATCH /network/routers/:id`; `POST /network/routers/:id/{activate,deactivate}`                                        |
| Consultar sedes autorizadas para asociar routers                               | `GET /network/router-site-options?page=:page&limit=:limit`                                                                                      |
| Listar, crear, editar y cambiar estado de interfaces; convertir referencia LAN | `GET/POST /network/routers/:id/interfaces`; `PATCH /network/routers/:id/interfaces/:interfaceId`; `POST .../:interfaceId/{activate,deactivate}` |
| Listar, registrar, actualizar y corregir direcciones de interfaz               | `GET/POST /network/routers/:id/interfaces/:interfaceId/ipv4-addresses`; `PATCH .../:addressId`; `POST .../:addressId/correct`                   |
| Consultar metadatos de catálogo/IP                                             | `GET /network/catalog-meta`                                                                                                                     |
| Listar, editar y cambiar estado de redes                                       | `GET /network/ipv4-networks`; `PATCH /network/ipv4-networks/:id`; `POST /network/ipv4-networks/:id/{activate,deactivate}`                       |
| Crear red asistida con contexto de router                                      | `POST /network/routers/:id/ipv4-networks`                                                                                                       |

El cliente conserva `POST /network/ipv4-networks` como operación tipada por compatibilidad; esta experiencia de alta usa la ruta asistida congelada.

## Componentes

- [NetworkRouterCatalogClient.tsx](../../apps/portal/src/components/network/NetworkRouterCatalogClient.tsx): lista `RouterListDto`, detalle sincronizado con `routerId`, fallback de foco al encabezado para URL directa y alta con continuidad a red.
- [NetworkRouterDetailSidePeek.tsx](../../apps/portal/src/components/network/NetworkRouterDetailSidePeek.tsx): detalle `RouterDetailDto`, interfaces, direcciones y redes con estados remotos completos; bloqueo de cierre durante mutaciones y fail-closed para metadatos incompletos.
- [AssistedIpv4NetworkDrawer.tsx](../../apps/portal/src/components/network/AssistedIpv4NetworkDrawer.tsx): fuente por dirección registrada, IP explícita con prefijo o CIDR/gateway manual; conserva valores entre modos y enfoca el resumen accesible al fallar el envío.
- [Ipv4NetworkDrawer.tsx](../../apps/portal/src/components/network/Ipv4NetworkDrawer.tsx): despacho del alta asistida y edición compatible de redes existentes, incluida asociación de interfaz.
- [NetworkRouterDrawer.tsx](../../apps/portal/src/components/network/NetworkRouterDrawer.tsx): opciones de sede paginadas desde el cliente MOD13 y protegidas por permiso de gestión; omisión de campos sin cambios y limpieza explícita de sede física/nodo comercial.
- [NetworkCatalogDrawerFrame.tsx](../../apps/portal/src/components/network/NetworkCatalogDrawerFrame.tsx) y [use-portal-side-drawer-a11y.ts](../../apps/portal/src/components/shared/use-portal-side-drawer-a11y.ts): acción secundaria y foco inicial priorizado del drawer.
- [network-catalog-labels.ts](../../apps/portal/src/components/network/network-catalog-labels.ts): etiquetas legibles para estados, métodos, interfaces y tipos de sede.
- [`RadioCardGroup.tsx`](../../packages/ui/src/components/RadioCardGroup.tsx): `fieldset` con su rol `group` implícito, nombre por `legend` y soporte de `aria-describedby`/`aria-invalid`. AI-DS-OWNER dio PASS solo a las dos props. El `role="radiogroup"` que se había añadido violaba la regla 5 del [contrato del componente](../specs/2026-10-11-ui-radio-card-group-contrato-componente.md) y rompía tres suites de consumidores; se retiró el 2026-10-27 por veredicto de AI-DS-OWNER (contrato v1.1); sin cambios visuales ni de tokens. El grupo de métodos de control del router también expone `aria-invalid` y mantiene el error asociado.

## Verificación

| Gate                         | Evidencia                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pruebas FE focales sin caché | Portal: `pnpm --filter @iwana/portal exec jest --runInBand --no-cache src/components/network` aprobó 6 suites y 33 pruebas, incluidas sedes inactivas y cambio rápido de contexto. Design system: 1 suite y 5 pruebas aprobadas en la corrida focal anterior. Total documentado: 7 suites y 38 pruebas. |
| TypeScript                   | `pnpm --filter @iwana/portal typecheck`: aprobado. `@iwana/ui typecheck` aprobó en la verificación focal anterior.                                                                                                                                                                                      |
| ESLint                       | `pnpm --filter @iwana/portal lint`: 0 errores y 43 advertencias preexistentes en áreas ajenas. `@iwana/ui lint` aprobó en la verificación focal anterior.                                                                                                                                               |
| Prettier                     | `pnpm exec prettier --check` sobre los cuatro archivos portal modificados: aprobado.                                                                                                                                                                                                                    |
| Audit UI                     | `audit-ui.mjs` sobre `NetworkRouterDrawer.tsx` y `AssistedIpv4NetworkDrawer.tsx`: sin hallazgos.                                                                                                                                                                                                        |
| Revisión independiente SR-QA | PASS para el corte local O2-FE: verificó sedes inactivas no asignables salvo referencia histórica actual, descarte de respuestas asíncronas obsoletas, continuidad, modos de captura, fail-closed, errores/foco y side peek durante mutaciones. Revisión sin código de E2E, visual o WCAG manual.       |
| Integración E2E y cobertura  | E2E, visual 375/768/1280 claro/oscuro, WCAG manual y medición de cobertura no ejecutados; pendientes de la integración runtime posterior a O2-M/O3.                                                                                                                                                     |

## Límites de integración

El contrato target `apps/api/openapi/network-catalog.contract.v1.json` v1.12 define 35 operaciones; el snapshot runtime de O2-H contiene 23. Las rutas y la paridad de respuestas dependientes de O2-M siguen pendientes. Hasta entonces, las llamadas faltantes o todavía no extendidas pueden fallar en runtime y la UI muestra sus estados de error/reintento; esta entrega no afirma disponibilidad real de las 35 operaciones.

En G4, `UpdateRouterBodySchema` acepta `null` para `organizationSiteId` y `commercialNodeId`, pero `notes` solo permite string opcional. El FE omite notas sin cambios y no inventa una forma `null`; limpiar notas no está habilitado hasta que el contrato compartido lo permita. No se modificó el contrato congelado.

La matriz visual 375/768/1280 y claro/oscuro no se ejecutó en navegador: queda pendiente de la integración runtime. Los layouts usan los breakpoints y superficies existentes; esta limitación no equivale a una certificación visual completa.
