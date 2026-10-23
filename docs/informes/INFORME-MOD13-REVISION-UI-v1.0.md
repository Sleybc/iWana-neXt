# INFORME — MOD13: revisión de identidad y sistema de diseño

**Versión:** 1.0  
**Fecha:** 2026-10-22  
**Estado:** **REQUEST_CHANGES** — revisión estática con un P1 abierto  
**Módulo:** MOD13 — Aprovisionamiento de red  
**Rol:** AI-DS-OWNER  
**Contrato:** HLD-MOD13 v1.1 (congelado)  
**Spec UX:** [2026-10-22-mod13-aprovisionamiento-ux.md](../specs/2026-10-22-mod13-aprovisionamiento-ux.md)  
**Plan:** [2026-10-22-mod13-aprovisionamiento.md](../plans/2026-10-22-mod13-aprovisionamiento.md)  
**Modo:** revisión estática; sin cambios de código

## Resumen ejecutivo

`audit-ui.mjs` no detecta violaciones mecánicas en las rutas y componentes revisados. La implementación usa primitives existentes de `@iwana/ui` y del portal, y los usos observados de la paleta oscura corresponden a los tokens `dark-surface-*` y `dark-border` definidos en `globals.css`. No se introducen primitives ni tokens de marca nuevos.

La revisión manual encuentra un P1: la guarda de `ExecutionOrderProvisioningPanel` impide que el técnico asignado consulte la proyección de cinco campos que HLD §6.2/§7 y la spec UX §6 permiten mediante la excepción del endpoint `context`. También hay un P2 de alineación de tabs y un P3 de copy del estado vacío de routers. Por el P1, V4 no queda aprobado.

## Evidencia

### Auditoría mecánica

Comando ejecutado:

```text
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/app/dashboard/network apps/portal/src/components/network apps/portal/src/components/operations/ExecutionOrderProvisioningPanel.tsx apps/portal/src/components/operations/ExecutionOrderMomentContainer.tsx apps/portal/src/components/operations/ExecutionOrderRequirementIndex.tsx apps/portal/src/components/operations/ExecutionOrderCloseSection.tsx apps/portal/src/components/operations/execution-order-requirements.ts apps/portal/src/components/crm/subscribers/SubscriberTechnicalServiceSection.tsx apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx apps/portal/src/components/layout/Sidebar.tsx
```

Resultado real:

```text
audit-ui: sin hallazgos en las rutas analizadas.
```

### Sistema de diseño y estados

- Los catálogos, ajustes, bandeja y sección del suscriptor componen `PortalPanel`, `PortalAlert`, `PortalEmptyState`, `PortalSkeletonBlock` y los class-tokens de tabla de `portal-ui.tsx`. Los controles disponibles (`Button`, `Input`, `Select`, `Badge`, `Dialog`) se importan desde `@iwana/ui`; no se detectó una primitive nueva.
- Se observaron tokens vigentes en `packages/ui/src/styles/globals.css`: `iwana-primary`, `iwana-surface-soft`, `dark-surface-2/3/4`, `dark-border` y `shadow-iwana-soft`. Los datos de red y OT usan `font-mono`/`tabular-nums`; los estados tienen etiqueta además de color. El medidor IPv4 expone `aria-valuetext` y texto con total, reservadas, activas y libres.
- Catálogos: skeleton, vacío, error/reintento y acceso denegado están representados; el copy del vacío de routers tiene el desajuste DS-03. Ajustes: carga por bloque, tabla vacía, error/reintento, perfil sin configurar, confirmación y resultado. Bandeja: pestañas, skeleton, vacío contextual y error con reintento. Suscriptor: sección montada solo con `network.provisioning.read`, skeleton, vacío y error/403. OT: carga/error y controles sujetos a permisos; el P1 DS-01 afecta específicamente al técnico sin `network.provisioning.read`.
- La tabla de IPv4 se desplaza dentro de su contenedor y presenta valores legibles aparte de la barra; las acciones usan alturas mínimas de 44 px en los archivos revisados. Hay composición responsive con `sm`, `md`, `xl` y contenedores de tabla desplazables. Esta observación es de clases fuente, no de render probado.
- La evidencia visual a 375, 768 y 1280 px, en claro y oscuro, no se ejecutó: corresponde a V4-bis cuando el portal esté disponible.

## Hallazgos

| ID | Severidad | Evidencia | Hallazgo y acción recomendada |
| --- | --- | --- | --- |
| DS-MOD13-P1-01 | **P1** | `apps/portal/src/components/operations/ExecutionOrderProvisioningPanel.tsx:138` | `loadContext()` retorna `readDenied` cuando falta `NETWORK_PROVISIONING_READ`, antes de llamar `getProvisioningContext()`. HLD v1.1 §6.2/§7 y spec UX §6 permiten al técnico asignado consultar, por la excepción del endpoint, solo `TechnicianProvisioningViewDto` de cinco campos. Como TECHNICIAN no recibe el permiso de lectura general, el código hace inalcanzable la rama `isTechnicianView()` y le oculta estado/IP. Permitir la consulta acotada y dejar que el API aplique la autorización de técnico asignado; mostrar el estado de denegación si el API rechaza el actor. |
| DS-MOD13-P2-02 | **P2** | `apps/portal/src/components/network/NetworkProvisioningInboxClient.tsx:167`, `:199` | La bandeja construye y estiliza manualmente su `tablist`. Ya existe la receta compartida `portalModuleTabsShellClassName`, `portalModuleTabsTrackClassName` y `portalModuleTabTriggerClassName` en `portal-ui.tsx:342-360`, aplicada en `SubscriberTabsContainer.tsx:55-100`. La implementación propia usa otra pista/radio/foco; migrar a los class-tokens compartidos conservando el comportamiento de URL y teclado para evitar deriva visual. No hace falta crear una primitive. |
| DS-MOD13-P3-03 | **P3** | `apps/portal/src/components/network/NetworkRouterCatalogClient.tsx:312-315` | El vacío sin filtros muestra «Registra un router…» aunque quien consulta tenga solo `catalog.read` y no vea el botón de registro. UX §3 pide explicar a esa persona que la lista aparecerá cuando se configure el catálogo. Condicionar la descripción a `canManage` y mantener el CTA solo para quien puede gestionar. |

## Veredicto y residual

- **V4:** no aprobado por DS-MOD13-P1-01. El resultado mecánico de `audit-ui.mjs` sí es cero hallazgos.
- **V4-bis:** pendiente; no hay evidencia visual de navegador en esta revisión.
- **Deuda nueva:** DS-MOD13-P1-01 (funcional, cerrar antes de aprobar V4); DS-MOD13-P2-02 (alineación del sistema de diseño); DS-MOD13-P3-03 (copy de estado vacío).

## Confirmación Ola 7

**Fecha:** 2026-10-23
**Modo:** confirmación estática, sin cambios de código.

- **DS-MOD13-P1-01 — cerrado en código:** `ExecutionOrderProvisioningPanel` consulta el contexto si cuenta con lectura de órdenes aunque no tenga lectura de aprovisionamiento (`ExecutionOrderProvisioningPanel.tsx:142-155`). La respuesta se discrimina como `TechnicianProvisioningViewDto`; la vista técnica muestra estado, IP, certificación y fecha de actualización (`:432-458`), y un HTTP 403 se representa como «Sin acceso» (`:188-190`). Las pruebas cubren la proyección sin permiso de red y la rama 403 (`NetworkProvisioningComponents.spec.tsx:174`, `:193`). La API aplica la comprobación de técnico asignado definida en HLD §6.2.
- **DS-MOD13-P2-02 — cerrado en código:** la bandeja usa `portalModuleTabsShellClassName`, `portalModuleTabsTrackClassName` y `portalModuleTabTriggerClassName` (`NetworkProvisioningInboxClient.tsx:163-207`). La prueba verifica las clases compartidas y el tab seleccionado (`NetworkProvisioningComponents.spec.tsx:140-147`).
- **DS-MOD13-P3-03 — cerrado en código:** el vacío de routers invita a registrar solo con `canManage`; para lectura muestra que la lista aparecerá cuando se configure el catálogo (`NetworkRouterCatalogClient.tsx:312-317`). La prueba comprueba ambas variantes y la presencia/ausencia del botón (`NetworkRouterCatalogClient.spec.tsx:56-79`).

### Auditoría mecánica

Comando ejecutado desde la raíz del repositorio:

```text
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/app/dashboard/network apps/portal/src/components/network apps/portal/src/components/operations/ExecutionOrderProvisioningPanel.tsx apps/portal/src/components/operations/execution-order-requirements.ts --json
```

Resultado real: **0 hallazgos** (P0: 0, P1: 0, P2: 0, P3: 0); salida del proceso 0. El comando cubrió las rutas `network/*`, todos sus componentes y los archivos de Operaciones tocados en Ola 7. La Ola 7 reporta además 3 suites/32 tests focalizados y la suite portal con 322 suites, 3.251 tests aprobados y 1 omitido preexistente.

**V4-bis sigue pendiente:** no se tomó evidencia visual de navegador en 375, 768 y 1280 px, en claro y oscuro. Esta confirmación no sustituye esa revisión.

