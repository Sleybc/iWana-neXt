# INFORME-MOD13 — Factibilidad frontend de interfaces IPv4 (O1-F)

**Versión:** 1.2 (revalidación de D10 contra la propuesta API v1.5)  
**Estado:** **O1-F: PASS de factibilidad** para D3, D9 y D10. La propuesta API v1.5 aporta las etiquetas de referencia que faltaban para D10. Las rutas siguen sin publicarse en runtime; este dictamen no cierra G3 ni G4.  
**Fecha:** 2026-10-26  
**Emisor:** AI-FE-PLATFORM  
**Encargo:** O1-F del [plan de orquestación MOD13](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md)  
**Entradas:** [UX v2.1](../specs/2026-10-26-mod13-interfaces-ux.md) §13.20, [contrato DS v1.2](../specs/2026-10-26-mod13-interfaces-ds.md) §§4.1–4.2, [propuesta API v1.5](../specs/2026-10-26-mod13-interfaces-api.md) §§2, 4.2–4.3, 9 y 14; [matriz QA v1.1](../quality/2026-10-26-mod13-interfaces-matriz.md); código portal inspeccionado el 2026-10-26.  
**Skills:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `architect-review` (obligatorias); `core-components` (apoyo). Leídas antes del dictamen.

**Cambios v1.0 → v1.1:** revalida D3 contra `GET /network/router-site-options` y `siteType`; evalúa el payload D10 frente a UX/DS y documenta la carga separada de interfaces, direcciones y redes.  
**Cambios v1.1 → v1.2:** revalida D10 contra API v1.5. Los resúmenes allowlisted de sede y nodo comercial completan los datos de display requeridos, con lectura solo después de autorización. O1-F pasa de BLOCK a PASS de factibilidad; el freeze runtime y los gates formales siguen pendientes.

## 1. Dictamen

La composición requerida es viable con Next.js App Router, `@iwana/ui` y las primitives existentes. No requiere tokens, dependencias ni un componente visual paralelo. `OperationalSidePeek` cubre la base de diálogo, foco y cierre; la integración debe conservar el estado de URL indicado por UX/DS y añadir los estados de carga, error, vacío y éxito para cada consulta remota.

API v1.5 resuelve el bloqueo de datos de D10. `GET /network/routers/:id` conserva la autorización `network.catalog.read` sobre la sede persistida del router. La respuesta incluye `organizationSite: { name, siteType, isActive } | null` y `commercialNode: { name, isActive } | null`, además de los identificadores de relación existentes. La secuencia propuesta consulta los puertos dueños solo después de `ALLOWED`; las etiquetas no autorizan. La UI puede mostrar una asociación inexistente como no asignada y una referencia histórica sin resumen como «No disponible», sin representar UUID. Una referencia inactiva legible conserva su nombre y estado.

El dictamen O1-F es **PASS de factibilidad**. La publicación runtime, la validación de permisos y los casos HTTP continúan en O2-C/O2-H/O3 y no forman parte de este dictamen.

## 2. Evaluación por decisión

| Decisión                                        | Factibilidad y evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Costo relativo | Dependencia para implementación                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D3 — selector de sede física**                | **PASS.** API v1.5 §4.2 propone `GET /network/router-site-options`, permiso `network.catalog.manage`, paginación `page`/`limit`, metadatos y opciones con `id`, `name`, `siteType` e `isActive`. El scope filtra antes de contar y paginar. UX v2.1 §13.20 y DS v1.2 §4.2 coinciden. El portal inspeccionado todavía carga `organizationApi.list({ page: 1, limit: 100 })` desde `NetworkRouterDrawer`; `api-client.ts` aún no expone la operación MOD13.                                                                                      | Medio          | Publicar el DTO y cliente en O2-C. Después, componer `RadioCardGroup` con `PortalTablePager`, mantener la selección al cambiar de página y conservar estados de carga, error, vacío y sede inactiva asociada. No cargar todas las páginas ni usar este endpoint para lectores. |
| **D10 — detalle de router, asociaciones y URL** | **PASS.** API v1.5 §§4.2 y 9 define GET por ID con `network.catalog.read`, autorización D-23 por sede persistida y respuestas de error uniformes. El resumen de sede aporta nombre, tipo y estado; el del nodo comercial aporta nombre y estado. Son suficientes para las referencias separadas de UX/DS. Interfaces, direcciones y redes permanecen en sus listas paginadas. El portal todavía no expone `networkApi.getRouter(id)` ni integra el panel con `routerId`; la UI no debe mostrar datos antes de recibir la respuesta autorizada. | Medio          | Publicar el DTO/cliente en O2-C. Implementar la URL `routerId`, historial y foco/fallback de DS v1.2 §4.1; solicitar el detalle directo por ID; manejar `null` según la diferencia entre asociación ausente e ID histórico sin resumen; no mostrar UUID.                       |
| **D9 — grupo accesible de candidatas**          | **PASS.** `RadioCardGroup` usa radios nativos, `fieldset` y `legend`; DS v1.2 define reenviar `aria-describedby` y `aria-invalid` al grupo.                                                                                                                                                                                                                                                                                                                                                                                                    | Bajo           | Reusar la primitive y cubrir sus estados contractuales en la validación integrada.                                                                                                                                                                                             |

D3 es una ruta de gestión. Una persona con lectura de catálogo conserva el acceso de lectura del catálogo y no debe depender de `network.catalog.manage` para abrirlo o ver su detalle.

## 3. Ajustes de cliente y composición

- **D3:** sustituir el selector actual de 100 sedes por el cliente tipado de la ruta paginada una vez publicado el contrato. Traducir `siteType` a etiqueta legible, mantener selección entre páginas y ofrecer como nueva opción solo una sede activa. La sede inactiva puede conservarse cuando ya está asociada.
- **D10:** construir la vista con `OperationalSidePeek`; abrirla desde fila o URL con `routerId`; al cargar por URL, no presentar contenido hasta una respuesta autorizada. Usar los resúmenes de D10 para «Sede física» y «Nodo comercial». Si el ID persistido no tiene resumen, presentar «No disponible» sin UUID; si no hay asociación, representarla como ausente.
- **Colecciones:** cargar interfaces por router, direcciones por interfaz y redes con `routerId` mediante sus rutas paginadas. El error de una sección no debe presentarse como lista confirmada ni ocultar el estado de las otras secciones.
- **Privacidad y boundaries:** las etiquetas de sede/nodo se consumen del DTO autorizado. FE no consulta tablas ajenas, no recorre páginas para resolver un router y no usa la ruta de selector D3 para rotular lectores. Mantener separados sede física, nodo comercial de cobertura y nodo técnico.
- **IPAM:** no habilitar captura o corrección de IP locales hasta que CA-R12 demuestre protección en reserva manual, reserva automática y ocupación, y la protección de rollback permanezca fail-closed conforme a ADR-101. Mantener el flujo legacy.

## 4. Gates y evidencia

- **O1-F:** **PASS de factibilidad** sobre API v1.5, UX v2.1 y DS v1.2.
- **G3:** este dictamen resuelve el criterio FE de suficiencia de D10. G3 queda pendiente de las revisiones independientes SEC/QA finales y del cierre formal de AI-EM-ARCH.
- **G4:** no emitido. Requiere publicación real de tipos compartidos, DTO/OpenAPI y mocks tipados, revisión independiente y registro de freeze por ruta/versión.
- **Runtime y pruebas:** esta revalidación fue estática y documental. No implementé código ni ejecuté pruebas; los casos de autorización, historial/foco, listas remotas, E2E y accesibilidad quedan para las olas runtime/integración.

## 5. Fuentes inspeccionadas

- [Propuesta API v1.5](../specs/2026-10-26-mod13-interfaces-api.md), §§2, 4.2–4.3, 9 y 14.
- [UX v2.1](../specs/2026-10-26-mod13-interfaces-ux.md), §13.20.
- [Contrato DS v1.2](../specs/2026-10-26-mod13-interfaces-ds.md), §§4.1–4.2.
- [Matriz QA v1.1](../quality/2026-10-26-mod13-interfaces-matriz.md), H14 y §10.
- `apps/portal/src/components/network/NetworkRouterDrawer.tsx`, `NetworkRouterCatalogClient.tsx`, `apps/portal/src/lib/api-client.ts`, `packages/ui/src/components/OperationalSidePeek.tsx` y `useTableQueryState`.
