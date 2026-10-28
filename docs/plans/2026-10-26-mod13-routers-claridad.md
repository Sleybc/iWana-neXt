# Routers: estado visible y claridad de los campos

> **Ejecución:** misma sesión, conforme a `AGENTS.md`; corrección solicitada por el usuario. Skills: `systematic-debugging`, `system-vocabulary-review`, `iwana-identity-ui-review`, `writing-plans`, `testing-patterns`, `verification-before-completion` e `iwana-test-evidence`.

**Fecha:** 2026-10-26  
**Estado:** Ejecutado y verificado  
**Objetivo:** distinguir la acción de activar/desactivar y explicar los campos del catálogo de red.

**Arquitectura:** conservar los contratos de MOD13 v1.1 y ADR-098. El router identifica el equipo; sus redes IPv4 definen bloques asignables. `lanInterface` sigue siendo una referencia opcional de texto. Las sedes físicas y los nodos comerciales conservan sus catálogos actuales.

**Stack:** Next.js App Router, React, TypeScript, `@iwana/ui`, react-hook-form, Zod y Jest.

## 1. Reproducir el defecto

Archivo: `apps/portal/src/components/network/NetworkRouterCatalogClient.spec.tsx`.

- [x] Agregar una prueba que espere texto visible «Desactivar» en un router activo y «Activar» después de desactivarlo; verificar ID, versión y estado enviados al API en ambas direcciones.
- [x] Comprobar que el botón se deshabilita mientras la operación está pendiente y que un error conserva el estado y muestra el mensaje de fallo.
- [x] Comprobar que una persona con acceso de lectura ve el estado sin acciones de edición o activación.
- [x] Ejecutar `pnpm --filter @iwana/portal exec jest components/network/NetworkRouterCatalogClient.spec.tsx --runInBand --no-cache --coverage=false` y confirmar la falla por ausencia del texto visible.

## 2. Corregir la presentación

Archivos:

- `apps/portal/src/components/network/NetworkRouterCatalogClient.tsx`: conservar `Button` y nombres accesibles; renderizar `ToggleRight` para activo y `ToggleLeft` para inactivo, junto con el verbo de la acción. Mantener foco, objetivo mínimo de 44 px y bloqueo durante la petición.
- `apps/portal/src/components/network/network-catalog-labels.ts`: centralizar ayudas de LAN, sede física, nodo comercial, nombre de red, CIDR, gateway y exclusiones.
- `apps/portal/src/components/network/NetworkRouterDrawer.tsx`: identificar «Nombre del router» y explicar LAN con `bridge-clientes` como ejemplo; la sede se administra en Organización y el nodo comercial corresponde a cobertura.
- `apps/portal/src/components/network/Ipv4NetworkDrawer.tsx`: identificar «Nombre de la red», explicar el bloque CIDR y la puerta de enlace configurada, y aclarar que las exclusiones evitan asignar IP de infraestructura. Asociar ayudas mediante `aria-describedby`.

- [x] Aplicar los cambios anteriores sin modificar endpoints, entidades ni migraciones.
- [x] Volver a ejecutar las pruebas del catálogo.

## 3. Verificación y evidencia

- [x] Ejecutar las suites de `components/network` sin caché y registrar los conteos reales.
- [x] Ejecutar ESLint sobre los archivos modificados y `pnpm --filter @iwana/portal typecheck`.
- [x] Ejecutar `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/network`.
- [x] Actualizar el informe vivo `docs/informes/INFORME-MOD13-REVISION-UI-v1.0.md` con cambios, evidencia y límites.

## Límites funcionales comprobados

No existe inventario de múltiples interfaces LAN por router en el contrato actual. No se deduce el gateway desde la IP de administración ni desde el CIDR. El adaptador vigente es manual y no descubre la configuración del equipo. El cambio explica estas limitaciones sin migrar valores existentes ni convertir nodos de cobertura en nodos físicos.
