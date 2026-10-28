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

## V4-bis — relanzamiento Ola 9

**Fecha:** 2026-10-23. **Estado inicial:** bloqueado por precondición de entorno; antecedente superado al iniciar el portal en esta misma relanzada.

`[BLOQUEO]` §V4-bis requiere el portal corriendo. En esta comprobación `Get-NetTCPConnection -LocalPort 3002 -State Listen` no encontró un listener; el puerto 3000 del API sí estaba escuchando. No se arrancaron servicios ni se modificó código de producto.

**Conteo real:** 0 capturas; 0 pantallas revisadas en navegador. Quedan pendientes routers, redes IPv4, bandeja, ajustes, panel de OT en vistas de NOC y técnico, y sección técnica del suscriptor, cada una en 375, 768 y 1280 px con temas claro y oscuro (42 combinaciones). No se acredita contraste, foco, teclado ni comportamiento responsive mediante evidencia visual en este intento. Las confirmaciones estáticas de Ola 7 conservan su alcance.

### V4-bis — evidencia tras arrancar el portal

**Fecha:** 2026-10-23. **Modo:** navegador real + código; revisión parcial. Portal confirmado escuchando en 3002; autenticación ADMIN del tenant de pruebas mediante el API real con HTTP 200 y sesión instalada en la cookie httpOnly del contexto de navegador. Este procedimiento permite capturar las pantallas protegidas; no valida el formulario de login interactivo del portal. No se crearon usuarios, suscriptores ni órdenes; no se cambiaron ajustes ni se enviaron los formularios de registro.

| Pantalla | 375 claro/oscuro | 768 claro/oscuro | 1280 claro/oscuro | Resultado |
| --- | --- | --- | --- | --- |
| Routers | 2 capturas | 2 capturas | 2 capturas | Lista con datos sintéticos de F1 |
| Redes IPv4 | 2 capturas | 2 capturas | 2 capturas | Lista con red de documentación usada por F1 |
| Bandeja | 2 capturas | 2 capturas | 2 capturas | Pestaña «En ejecución» vacía |
| Ajustes | 2 capturas | 2 capturas | 2 capturas | Sin planes; requisito desactivado |
| OT, vista NOC | Pendiente | Pendiente | Pendiente | Falta sesión NOC |
| OT, vista técnico | Pendiente | Pendiente | Pendiente | Falta sesión de técnico asignado |
| Servicio técnico del suscriptor | Pendiente | Pendiente | Pendiente | El API devuelve cero suscriptores |

**Conteo real final del bloque:** **26 PNG**: 24 combinaciones de pantalla/tamaño/tema y 2 capturas adicionales del drawer de router a 375 px, en claro y oscuro. De las 42 combinaciones principales previstas se capturaron 24; quedan 18 pendientes. No son 26 tests: este bloque ejecutó automatización de capturas y comprobaciones de navegador, sin una suite formal de tests.

### Evidencia localizable

Directorio: [evidence/mod13-ui/](evidence/mod13-ui/). Cada pantalla tiene el patrón `{routers|ipv4|bandeja|ajustes}-{375|768|1280}-{light|dark}.png`. Las capturas adicionales son `router-drawer-375-light.png` y `router-drawer-375-dark.png`.

- [Resultados de las 24 capturas](evidence/mod13-ui/v4bis-results.json): tamaños, tema efectivo, anchura del documento, alertas y estados HTTP; 24 capturas logradas, 0 errores de captura.
- [Comprobación de fixtures y teclado](evidence/mod13-ui/v4bis-probe.json): catálogo de suscriptores HTTP 200 / 0 registros; listado de OT HTTP 200 / 3 registros; credenciales de rol NOC/técnico no disponibles; apertura, Tab, Escape y retorno de foco del drawer.
- [Contraste sobre estilos calculados](evidence/mod13-ui/v4bis-contrast.json): seis muestras por tema del catálogo de routers. Ratios claro/oscuro: título principal 16,86/17,76; eyebrow 4,52/10,89; eyebrow del panel 4,60/5,52; título de panel 17,75/15,91; descripción 7,18/12,06; botón principal 17,32/6,97. Cálculo de luminancia sRGB sobre colores resueltos del navegador y fondos de sus ancestros. La muestra pasa 4,5:1; no acredita todos los estados ni todos los textos del módulo.

Capturas representativas examinadas: [routers móvil claro](evidence/mod13-ui/routers-375-light.png), [routers escritorio oscuro](evidence/mod13-ui/routers-1280-dark.png), [IPv4 móvil oscuro](evidence/mod13-ui/ipv4-375-dark.png), [IPv4 tablet claro](evidence/mod13-ui/ipv4-768-light.png), [bandeja móvil claro](evidence/mod13-ui/bandeja-375-light.png), [bandeja escritorio oscuro](evidence/mod13-ui/bandeja-1280-dark.png), [ajustes móvil oscuro](evidence/mod13-ui/ajustes-375-dark.png), [ajustes escritorio claro](evidence/mod13-ui/ajustes-1280-light.png), [drawer claro](evidence/mod13-ui/router-drawer-375-light.png) y [drawer oscuro](evidence/mod13-ui/router-drawer-375-dark.png).

Se enmascaró el menú de usuario y el pie de último cambio de ajustes para excluir identidad personal. Las máscaras magenta forman parte de la evidencia y no son defectos de UI. El indicador de Next dev permanece visible; las capturas corresponden a desarrollo, no a un build de producción. Los datos sintéticos de F1 podían cambiar mientras ese bloque ejecutaba sus pruebas.

### Identidad, responsive y accesibilidad observados

- Las 24 mediciones muestran `documentElement.scrollWidth === innerWidth`, con tema efectivo correcto. Las tablas conservan su desplazamiento dentro del contenedor; en móvil no se muestran todas sus columnas simultáneamente. Las acciones de registro y los filtros permanecen visibles. No se observó un bloqueo responsive nuevo en las muestras revisadas.
- Se observan la barra lima de navegación activa en escritorio, la sombra de panel y la representación monoespaciada de datos técnicos; el tema oscuro conserva las superficies del sistema. La bandeja presenta las tres pestañas legibles en móvil y un estado vacío con acción de actualización. Ajustes comunica el requisito desactivado mediante texto además de estilo visual.
- En el drawer de router a 375 px, en ambos temas, Enter abre el diálogo, el foco entra al diálogo y Tab permanece dentro, con anillo visible en el campo. Escape cierra y devuelve el foco al botón «Registrar router». La captura guarda el estado de foco. El primer Tab global alcanzaba el indicador de Next dev: no se usa ese dato para afirmar cumplimiento del recorrido de teclado del producto.
- Se repitió `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/app/dashboard/network apps/portal/src/components/network apps/portal/src/components/operations/ExecutionOrderProvisioningPanel.tsx apps/portal/src/components/crm/subscribers/SubscriberTechnicalServiceSection.tsx --json`: **0 hallazgos** (P0/P1/P2/P3: 0), salida 0.

### Veredicto V4-bis y pendientes

**V4-bis parcial; CA-NET-14 no cerrado.** No se emite aprobación WCAG global ni puntaje del módulo completo: faltan estados y pantallas requeridos.

**DS-MOD13-VIS-P2-01 — orientación del sidebar (P2, esfuerzo S):** la captura `bandeja-1280-dark.png` muestra «Inicio» y «Aprovisionamiento» como activos a la vez; la comprobación DOM adicional en Routers confirma dos enlaces con `aria-current="page"`, `/dashboard` y `/dashboard/network/routers`, en ambos temas (`v4bis-contrast.json`, `activeLinks`). `Sidebar.tsx:314-316` considera activo cualquier prefijo, incluido `/dashboard`, y `:373` asigna `aria-current` a ambos. Confunde la ubicación actual visual y accesible. Recomendación para fe-platform: coincidencia exacta para Inicio y conservación de prefijos para módulos con subrutas. La condición ya existe en HEAD; se registra como observación heredada del shell, sin atribuirla a una regresión nueva de MOD13 ni reabrir las correcciones de Ola 7. Ancla: `iwana-identity-ui-review/references/evaluation-criteria.md`, §2, ubicación actual evidente.

`[BLOQUEO]` OT NOC/técnico: no hay credenciales E2E de esos actores para comprobar las proyecciones reales. La existencia de 3 órdenes no sustituye las sesiones y la asignación necesarias. `[BLOQUEO]` ficha del suscriptor: `GET /crm/subscribers?limit=100` devuelve HTTP 200 con 0 registros; no existe una ficha accesible para capturar su sección técnica. Retomar las 18 combinaciones faltantes con fixtures y sesiones de prueba ya preparados. Siguen sin cubrirse en vivo el ajuste PCQ con planes, el resto de pestañas de la bandeja con datos, las variantes de error/sin permiso/success y los estados de OT y suscriptor. Estas son limitaciones de evidencia; no se clasifican como defectos P0–P3 del producto.

## FX-nav · Corrección de la orientación del sidebar (Ola 10)

**Fecha:** 2026-10-23, 08:26 America/Bogota · **Responsable:** AI-FE-PLATFORM · **Estado:** verificado en componente.

Encargo: [prompt §FX-nav](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md), según el [plan](../plans/2026-10-22-mod13-aprovisionamiento.md). DS-MOD13-VIS-P2-01 queda corregido en código y pruebas: `Sidebar.tsx` exige coincidencia exacta para `/dashboard`; mantiene la coincidencia por prefijo de segmento para los módulos con subrutas. La condición alimenta tanto `aria-current` como la barra lima existente.

La prueba de Inicio ahora exige un único enlace actual. Cuatro casos nuevos comprueban Routers, su detalle, Aprovisionamiento y una subruta de Operaciones; en cada caso el módulo conserva el indicador activo e Inicio no tiene `aria-current` ni barra lima. Antes de corregir la condición, los cuatro casos fallaron por encontrar ambos enlaces actuales: `Test Suites: 1 failed, 1 total`; `Tests: 4 failed, 21 passed, 25 total`.

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Descubrimiento | `node node_modules/jest/bin/jest.js --config apps/portal/jest.config.js components/layout/Sidebar.spec.tsx --listTests --runInBand --no-cache` | 1 archivo, `Sidebar.spec.tsx` |
| Sidebar, sin Turbo ni caché | `pnpm --filter @iwana/portal exec jest components/layout/Sidebar.spec.tsx --runInBand --no-cache` | `Test Suites: 1 passed, 1 total`; `Tests: 25 passed, 25 total`; 0 omitidos |
| Lint portal | `pnpm --filter @iwana/portal lint` | salida 0; 0 errores, 43 advertencias en archivos ajenos al sidebar |
| Typecheck portal | `pnpm --filter @iwana/portal typecheck` | salida 0 |
| Auditoría mecánica | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/layout/Sidebar.tsx apps/portal/src/components/layout/Sidebar.spec.tsx` | 0 hallazgos |
| Formato de código | `pnpm --filter @iwana/portal exec prettier --check src/components/layout/Sidebar.tsx src/components/layout/Sidebar.spec.tsx` | ambos archivos conformes |

Se usó el directorio de caché de Jest por defecto fuera del repositorio y `--no-cache`. Jest emitió avisos heredados de `allowJs` en el global setup y deprecación de `punycode`. No se declara cumplimiento WCAG global: la evidencia cubre la ubicación actual visual y accesible en el componente; V4-bis y sus capturas pendientes siguen abiertos. Deuda nueva P0–P3: ninguna. Sin commit.

## V4-bis-r — Ola 11

**Fecha:** 2026-10-23 (America/Bogota) · **Estado:** `[BLOQUEO]` por dependencias locales del API. Se revisaron las reglas de V4-bis-r y se detuvo la captura antes de abrir sesiones o interactuar con el portal.

La precondición `GET http://127.0.0.1:3000/api/v1/health` no devolvió HTTP 200; el endpoint estaba inaccesible. El coordinador confirmó, a partir del tail saneado del nuevo intento, que Nest inició pero TypeORM no pudo conectar con PostgreSQL en `127.0.0.1:5433` ni Redis en `127.0.0.1:6380` (ambos sin listener). No reinicié API ni dependencias y no usé credenciales en esta revisión.

| Evidencia Ola 11 | Resultado |
| --- | --- |
| Panel de OT, sesión NOC | 0/6 combinaciones capturadas (375, 768, 1280 × claro/oscuro); bloqueado antes de abrir sesión |
| Panel de OT, sesión técnico | 0/6 combinaciones capturadas; bloqueado antes de abrir sesión |
| Sección técnica del suscriptor FX-v1 | 0/6 combinaciones capturadas; bloqueado antes de abrir sesión |
| Bandeja con datos y ajustes con planes | Sin nueva captura; API no disponible para validar los estados poblados |
| Total de las 18 combinaciones pendientes | **0/18 capturadas**; las 24 capturas base de la relanzada V4-bis anterior permanecen como evidencia separada |
| Revisión de sidebar en navegador | No ejecutada por la precondición del API |

Como comprobación independiente del entorno, corrí `pnpm --filter @iwana/portal exec jest components/layout/Sidebar.spec.tsx --runInBand --no-cache`: **1 suite aprobada, 25 tests aprobados, 0 omitidos**. Los casos para Routers, detalle de router, Aprovisionamiento y subruta de Operaciones verifican un solo elemento actual y desactivan «Inicio»; la prueba valida el componente con su ruta simulada, no sustituye la inspección DOM en navegador que quedó bloqueada. El test emitió los avisos preexistentes de `ts-jest` (`allowJs`) y `punycode`.

No se generaron capturas nuevas ni se modificaron componentes. La revisión visual pendiente no permite confirmar comportamiento responsive, contraste, permisos ni datos de las sesiones FX-v1; se debe reanudar cuando el API vuelva a responder 200 y sus dependencias estén disponibles.

### Reanudación V4-bis-r · evidencia parcial y caída del API

**Fecha:** 2026-10-23 (America/Bogota) · **Estado:** parcial; bloqueado para las pantallas que requieren API.

Tras recuperar health 200 y disponibilidad del portal, se capturaron primero los dos roles de la OT mientras continuaba asignada. La sección usada fue el panel de aprovisionamiento; no se incluyeron datos de identidad. Después de estas capturas se avisó a QA y se liberó la OT sin mutarla.

| Proyección | Claro/oscuro × 375/768/1280 | Resultado observado | Evidencia |
| --- | ---: | --- | --- |
| Sesión técnico | 6/6 archivos | El panel presenta «Sin reserva» y no muestra una dirección IP. Es el estado de datos observado; no se interpreta como un flujo completo. | [375 claro](evidence/mod13-ui/ot-tecnico-375-light.png), [375 oscuro](evidence/mod13-ui/ot-tecnico-375-dark.png), [768 claro](evidence/mod13-ui/ot-tecnico-768-light.png), [768 oscuro](evidence/mod13-ui/ot-tecnico-768-dark.png), [1280 claro](evidence/mod13-ui/ot-tecnico-1280-light.png), [1280 oscuro](evidence/mod13-ui/ot-tecnico-1280-dark.png) |
| Sesión NOC | 6/6 archivos | El panel muestra error de consulta y acción «Reintentar». Se conserva como evidencia del fallo; **no** cuenta como validación visual aprobada de la proyección NOC. | [375 claro](evidence/mod13-ui/ot-noc-375-light.png), [375 oscuro](evidence/mod13-ui/ot-noc-375-dark.png), [768 claro](evidence/mod13-ui/ot-noc-768-light.png), [768 oscuro](evidence/mod13-ui/ot-noc-768-dark.png), [1280 claro](evidence/mod13-ui/ot-noc-1280-light.png), [1280 oscuro](evidence/mod13-ui/ot-noc-1280-dark.png) |
| Ficha técnica del suscriptor | 0/6 | La navegación a la ruta de ficha no alcanzó el selector esperado del shell (`main h1` y menú de usuario) tras completar `goto`; no se capturó la sección técnica. No se repitieron intentos de autenticación. | Sin capturas |

**Conteo de las 18 combinaciones solicitadas:** 12 archivos capturados (6 de técnico con estado visible; 6 de NOC en estado de error que no se aprueba) y 6 no capturados de suscriptor. No se presenta el total de archivos como 12 vistas aprobadas.

Durante la secuencia el coordinador informó que el API terminó con salida 1 después de solicitudes repetidas a `GET /api/v1/network/provisioning/orders/[UUID]/context`. El tail saneado registra `QueryFailedError`, `sqlstate=22P02` y operación `SELECT`; health volvió a fallar. No se guardó el UUID ni se inspeccionaron secretos. Por instrucción del coordinador, no se hicieron más peticiones a aprovisionamiento ni se reinició el API. Bandeja poblada y ajustes con planes quedan bloqueados por esta caída; no hay nueva evidencia de esos estados.

### Recheck del sidebar

`pnpm --filter @iwana/portal exec jest components/layout/Sidebar.spec.tsx --runInBand --no-cache`: **1 suite aprobada; 25 tests aprobados; 0 omitidos**. Los cuatro casos de rutas de MOD13 confirman con la ruta simulada un solo enlace con `aria-current="page"` y «Inicio» inactivo. Es evidencia del componente; no se declara un recheck DOM en vivo durante esta recuperación.

**Resultado V4-bis-r:** no cerrado. La evidencia útil de la proyección técnico y el recheck del sidebar quedan registrados; la proyección NOC, el suscriptor, la bandeja y los ajustes requieren una nueva ejecución cuando el API esté estable. No se modificó código de producto ni se cambió el estado de la OT.

### Actualización de dependencias y tail saneado

En la comprobación posterior, iniciada por el coordinador, Redis alcanzó estado `healthy`; el API reintentó la conexión de TypeORM (intentos 1–9) y terminó con `connect ECONNREFUSED 127.0.0.1:5433` para PostgreSQL. Este es el resumen saneado del tail final disponible: no contiene valores de credenciales, payloads ni datos personales. Health continúa sin 200, así que el conteo de capturas permanece en **0/18**. No reinicié el API ni abrí las sesiones; la precondición sigue bloqueada.

### Actualización final de V4-bis-r · después de recuperar el API

Esta actualización posterior reemplaza el conteo anterior de 0/18 para la secuencia de reanudación; conserva ese bloqueo como antecedente histórico. Tras recuperar health 200 y el portal, se guardaron las 12 capturas enlazadas arriba: técnico 6/6 con «Sin reserva»; NOC 6/6 en error de consulta, sin aprobar esa proyección; ficha técnica del suscriptor 0/6 porque no alcanzó el selector de shell esperado. No se cambió el estado de la OT. QA confirmó que V1-r fue pausado antes de iniciar cuando el API volvió a caer.

El tail saneado posterior registra la salida 1 del API tras `GET /api/v1/network/provisioning/orders/[UUID]/context`, con `QueryFailedError`, SQLSTATE `22P02`, operación `SELECT`; health falló. Se dejaron de enviar solicitudes, no se reinició el proceso y no se expuso el UUID. La bandeja poblada y los ajustes con planes siguen sin evidencia por depender del API. El sidebar se revalidó con 1 suite y 25/25 tests, sin omisiones; `git diff --check` terminó con salida 0. Resultado final: **V4-bis-r parcial/bloqueado, 12 artefactos de captura (6 estados visibles del técnico, 6 estados de error NOC), 0/6 suscriptor; no son 12 vistas aprobadas.**

QA confirmó después una reproducción de solo lectura: login NOC HTTP 200, contexto de OT HTTP 500 y health con `ECONNREFUSED`. No cambió la OT. Las capturas de bandeja y ajustes siguen pausadas hasta que el coordinador complete la recuperación y QA libere el API.

El coordinador recuperó health 200 y autorizó considerar páginas independientes con sesiones ya abiertas, evitando la ruta de contexto OT. El inventario del navegador no encontró pestañas/sesiones activas y los contextos Playwright de las capturas anteriores se cerraron al terminar. No se abrieron sesiones nuevas ni se cargaron credenciales; por ello, bandeja y ajustes continúan sin capturas hasta que exista una sesión reutilizable.

Ante la aclaración del coordinador, se hizo un único intento instrumentado con la sesión ADMIN de FX-v1 para ajustes: health HTTP 200, `/auth/login` HTTP 200, botón submit visible/hidratado y clic ejecutado; no hubo redirección a `/dashboard` en 30 s, timeout en `login-submit` y ruta final `/auth/login`. El intento NOC anterior también terminó con `TimeoutError` antes de capturar. No se llegó a consultar la bandeja ni ajustes, no se abrió el contexto OT y no se generaron capturas dinámicas adicionales (**0**). No se hicieron más intentos de autenticación.

### Conteo y rutas de los intentos de Ola 11

El denominador **18** de §V4-bis-r corresponde a las tres proyecciones pendientes del grid: OT NOC (6), OT técnico (6) y suscriptor (6). Resultado de cobertura visual válida: **6/18** (técnico 6/6, estado «Sin reserva»); NOC **0/6 aprobadas** (6 PNG de error conservados); suscriptor **0/6**. En total hay 12 archivos OT, pero solo seis son observaciones válidas de la proyección solicitada.

La bandeja con datos y los ajustes con planes son variantes de contenido pedidas por §V4-bis-r, fuera de esas 18 combinaciones: nuevas capturas **0/6** para cada variante. La evidencia base V4-bis conserva aparte 6 imágenes de bandeja vacía y 6 de ajustes sin planes, que no satisfacen las variantes pobladas.

En el intento inicial de NOC solo quedó registrado health HTTP 200 y `TimeoutError` antes de cualquier marcador `session-ready:noc`; esa corrida no guardó estado HTTP de `/auth/login` ni ruta final, por lo que no se inventan. En el intento ADMIN instrumentado, health y `/auth/login` respondieron HTTP 200; el submit pasó el selector de hidratación, pero la espera de redirección expiró en `login-submit` y la ruta final observada fue `/auth/login`. No se visitaron las rutas de bandeja ni ajustes. No se mostraron credenciales ni texto personal.

### V4-bis-r · reanudación con fixtures FX-v1 (cierre de esta ejecución)

**Fecha:** 2026-10-23 (America/Bogota). **Resultado:** parcial; no se generaron PNG nuevos en esta reanudación. Esta sección añade la evidencia posterior y no sustituye los conteos históricos anteriores.

Antes de abrir las páginas, `GET /api/v1/health` respondió HTTP 200. El harness inició sesiones con las credenciales FX-v1 locales existentes y esperó la hidratación React antes del envío de login. Se registraron solo estados HTTP, conteos y selectores técnicos; no se guardaron credenciales ni texto personal.

| Revisión | Estado observado | Captura nueva | Evaluación |
| --- | --- | ---: | --- |
| Bandeja de aprovisionamiento, sesión NOC | Login HTTP 200; ruta HTTP 200; 0 filas en el panel en claro y oscuro; health siguió en 200 | 0/6 | No acredita la variante con datos pedida por §V4-bis-r. Las seis imágenes previas de bandeja vacía son evidencia distinta. |
| Ajustes de red, sesión ADMIN | Login HTTP 200; ruta HTTP 200; 0 planes en claro y oscuro; health siguió en 200 | 0/6 | No acredita ajustes con planes. Las seis imágenes previas sin planes son evidencia distinta. |
| Suscriptor, sesión ADMIN | Login y lista HTTP 200; la lista expuso tres enlaces de detalle (no se interpretan como tres suscriptores distintos). La ruta candidata de detalle respondió HTTP 200, pero el shell no montó pestañas (`tabs=0`), no apareció el selector «Servicio técnico» (`main h1=1`, alertas `0`) y el harness superó su límite local durante la navegación de otro viewport. Se detuvo únicamente el proceso propio de Playwright. | 0/6 | Sin captura y sin lectura de texto personal; la ficha no quedó disponible para verificar la proyección. |
| Fixture CPE para OT | QA confirmó que los endpoints de fixture autorizados no aceptan MAC al crear el equipo ni tienen una ruta de actualización del activo. El CPE sigue `null`; QA detuvo V1 antes de mutar OT o inventario. | 0 nuevos | Las proyecciones que requieren acreditar CPE+MAC quedan sin fixture. No se completó ni cambió el estado de la OT. |

**Conteo del grid de 18 combinaciones pendientes:** el grid es OT NOC (6), OT técnico (6) y ficha técnica del suscriptor (6). De la evidencia histórica se mantienen **6/18 capturas válidas**: OT técnico, estado visible «Sin reserva» (6/6). OT NOC conserva 6 PNG de error de consulta, clasificados **0/6 aprobadas**; suscriptor continúa **0/6**. En esta reanudación el conteo es **0 PNG nuevos**; no se acredita cobertura adicional. Total histórico: 12 archivos OT (6 válidos del técnico y 6 fallidos del NOC), que no equivalen a 12 combinaciones aprobadas.

Bandeja poblada y ajustes con planes son escenarios de contenido adicionales al grid de 18: **0/6** capturas nuevas en cada uno. Las imágenes base de bandeja vacía y ajustes sin planes no satisfacen esos escenarios.

### Recheck del sidebar

`pnpm --filter @iwana/portal exec jest components/layout/Sidebar.spec.tsx --runInBand --no-cache`: **1 suite aprobada; 25/25 tests aprobados; 0 omitidos**. Los casos de Routers, detalle de router, Aprovisionamiento y Operaciones confirman un único enlace con `aria-current="page"` y «Inicio» inactivo. Esta verificación es del componente bajo rutas simuladas; no se afirma una inspección DOM en vivo en este intento.

**Cierre:** V4-bis-r permanece parcial/bloqueado por disponibilidad del fixture CPE+MAC, ausencia de la proyección de suscriptor en la ficha y falta de datos para bandeja y ajustes. No se cambió código, OT ni inventario; no se reinició API/worker. No hay hallazgos DS nuevos derivados de estas capturas incompletas.


### V4-bis-r · nueva evidencia posterior a V1-r

**Fecha:** 2026-10-23. **Resultado:** grid de capturas completo; variantes de bandeja poblada completas; ajustes con planes bloqueados por falta de fixture de planes.

Antes de capturar, `GET /api/v1/health` respondió HTTP 200 y el portal respondió HTTP 200. Los logins API de NOC, técnico, solo lectura y ADMIN de FX-v1 respondieron 200. Se usaron sesiones NOC para el panel y la bandeja, técnico para su proyección de la OT y ADMIN para la ficha técnica del suscriptor. El usuario NOC no obtiene permiso para el detalle 360 de CRM; por eso no se usó para abrir la ficha. La sesión ADMIN y los datos existentes del tenant fueron de solo lectura durante esta revisión; no se alteraron la OT, los ajustes ni el catálogo.

Se generaron 30 PNG: las 18 combinaciones del grid (OT NOC, OT técnico y ficha técnica × 375/768/1280 px × claro/oscuro), más seis capturas de bandeja poblada y seis de ajustes. Las imágenes de OT cubren los nombres de suscriptor, técnico y actores; la ficha cubre los nombres de quienes certificaron/regularizaron; la bandeja cubre las columnas de suscriptor y técnico; ajustes cubre el nombre del último actor. El JSON de resultados conserva solo viewport, tema, conteos y estado; no contiene texto personal ni secretos.

| Vista / sesión | 375 px | 768 px | 1280 px | Resultado de contenido |
| --- | --- | --- | --- | --- |
| Panel OT · NOC | [claro](evidence/mod13-ui/v4bis-r-ot-noc-375-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ot-noc-375-dark.png) | [claro](evidence/mod13-ui/v4bis-r-ot-noc-768-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ot-noc-768-dark.png) | [claro](evidence/mod13-ui/v4bis-r-ot-noc-1280-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ot-noc-1280-dark.png) | 6/6; servicio visible `Activo` |
| Panel OT · técnico asignado | [claro](evidence/mod13-ui/v4bis-r-ot-tecnico-375-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ot-tecnico-375-dark.png) | [claro](evidence/mod13-ui/v4bis-r-ot-tecnico-768-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ot-tecnico-768-dark.png) | [claro](evidence/mod13-ui/v4bis-r-ot-tecnico-1280-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ot-tecnico-1280-dark.png) | 6/6; servicio visible `Activo` y certificación `Certificado` |
| Ficha · servicio técnico | [claro](evidence/mod13-ui/v4bis-r-suscriptor-tecnico-375-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-suscriptor-tecnico-375-dark.png) | [claro](evidence/mod13-ui/v4bis-r-suscriptor-tecnico-768-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-suscriptor-tecnico-768-dark.png) | [claro](evidence/mod13-ui/v4bis-r-suscriptor-tecnico-1280-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-suscriptor-tecnico-1280-dark.png) | 6/6; nueve servicios, incluido el activo |
| Bandeja NOC · cerradas sin aprovisionar | [claro](evidence/mod13-ui/v4bis-r-bandeja-poblada-375-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-bandeja-poblada-375-dark.png) | [claro](evidence/mod13-ui/v4bis-r-bandeja-poblada-768-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-bandeja-poblada-768-dark.png) | [claro](evidence/mod13-ui/v4bis-r-bandeja-poblada-1280-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-bandeja-poblada-1280-dark.png) | 6/6; una OT en la cola, columnas personales enmascaradas |
| Ajustes de red · NOC | [claro](evidence/mod13-ui/v4bis-r-ajustes-red-375-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ajustes-red-375-dark.png) | [claro](evidence/mod13-ui/v4bis-r-ajustes-red-768-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ajustes-red-768-dark.png) | [claro](evidence/mod13-ui/v4bis-r-ajustes-red-1280-light.png) · [oscuro](evidence/mod13-ui/v4bis-r-ajustes-red-1280-dark.png) | **[BLOQUEO] 0 planes disponibles**; seis imágenes muestran el estado vacío, no el escenario con planes solicitado |

**Conteo real:** 30/30 PNG generados y con la vista cargada; 18/18 combinaciones del grid capturadas con el contenido esperado; muestra visual revisada: cinco PNG, una por vista; 6/6 capturas de bandeja con una fila; 0/6 capturas de ajustes con planes (se conservaron 6 imágenes del estado vacío). Fallos de captura: 0. El tema pedido se aplicó en 30/30. El documento no tuvo desbordamiento horizontal en 30/30 viewports.

### Recheck del sidebar

En el DOM del navegador, `aside a[aria-current="page"]` tuvo exactamente un enlace actual en 30/30 capturas. `pnpm --filter @iwana/portal exec jest components/layout/Sidebar.spec.tsx --runInBand --no-cache --coverage=false`: **1 suite aprobada, 25/25 tests aprobados, 0 omitidos**. `audit-ui.mjs` sobre Sidebar, panel de OT, bandeja, ajustes y ficha técnica: **0 hallazgos P0–P3**. El resumen sin PII y las métricas por captura están en [v4bis-r-results.json](evidence/mod13-ui/v4bis-r-results.json).

**Cierre:** V4-bis-r acredita las 18 vistas pendientes y la bandeja poblada. El escenario adicional de ajustes con planes queda pendiente de que el fixture FX-v1 tenga al menos un plan; no se añadió uno porque este bloque solo revisa y captura UI. No se modificó código de producto ni estado del dominio.

## V4-plan — ajustes de red con perfil PCQ (Ola 15)

**Fecha:** 2026-10-23. Capturé la ruta `network/settings` con el plan sintético creado por V1-ci en el tenant de pruebas `srqa-mod11-r5-20261006`. El API respondió `200` en health, login y lectura de perfiles; la pantalla cargó la tabla con **1 plan y 1 perfil PCQ configurado** en cada captura. No se modificaron ajustes ni código de producto.

| Viewport | Claro | Oscuro | Resultado |
| ---: | --- | --- | --- |
| 375 px | [captura](evidence/mod13-ui/v4-plan-settings-375-light.png) | [captura](evidence/mod13-ui/v4-plan-settings-375-dark.png) | 1/1 plan con lista PCQ; tabla desplazable en su propio contenedor; sin overflow de página |
| 768 px | [captura](evidence/mod13-ui/v4-plan-settings-768-light.png) | [captura](evidence/mod13-ui/v4-plan-settings-768-dark.png) | 1/1 plan con lista PCQ; sin overflow de página |
| 1280 px | [captura](evidence/mod13-ui/v4-plan-settings-1280-light.png) | [captura](evidence/mod13-ui/v4-plan-settings-1280-dark.png) | 1/1 plan con lista PCQ; sin overflow de página |

**Conteo real:** 6/6 PNG generados y revisados; claro 3/3, oscuro 3/3; plan/perfil visible 6/6; overflow horizontal de página 0/6. Se enmascararon el menú de usuario y la línea «Último cambio» para no exponer nombres personales. En móvil, el desplazamiento horizontal queda contenido en la tabla.

**Límite:** V4-plan queda cubierto. V1-ci permanece bloqueado por el requisito de material instalado que impide cerrar una OT `NOT_EXECUTED` sin falsear el estado del CPE; no se declara cerrado G4 ni se crearon expedientes, CPE, OT o redes parciales.

## Corrección del catálogo de routers y ayudas de IPv4

**Fecha:** 2026-10-26. **Estado:** corrección local verificada con pruebas de componentes y análisis estático. **Modo:** diseño, ajuste de tabla operativa y formularios existentes.

**Solicitud:** aclarar interfaz LAN, sede, nombre de red, gateway y exclusiones, y corregir la acción de activar/desactivar en `/dashboard/network/routers`.

### Diagnóstico y cambio

- El botón siempre renderizaba `ToggleLeft`, independientemente del estado. Ahora el router activo muestra `ToggleRight` y «Desactivar»; el inactivo muestra `ToggleLeft` y «Activar». Se conserva el nombre accesible con el router, el objetivo mínimo de 44 px y la deshabilitación durante la petición. La distinción usa forma y texto, además del acento de color del estado activo.
- Se distinguen «Nombre del router» y «Nombre de la red», y se centralizan las ayudas en `network-catalog-labels.ts`. Las ayudas se asocian a sus controles mediante `aria-describedby`.
- La interfaz LAN es una referencia opcional de una interfaz o bridge, como `bridge-clientes`. El contrato vigente no contiene una colección de interfaces. Guardar una IP con máscara en este campo no crea una red ni configura el equipo.
- La sede corresponde a `organization_sites`: Organización ya admite base técnica y monitoreo operativo, además de oficina y otros tipos. El nodo comercial procede del catálogo de cobertura; es una referencia independiente de la ubicación física.
- La red IPv4 es el bloque asignable de servicios asociado al router. Su nombre distingue segmentos de un mismo equipo. El gateway es un dato explícito de cada red: el modelo actual y el adaptador manual no descubren su valor a partir del equipo.
- Las exclusiones impiden asignar determinadas direcciones a servicios, por ejemplo las reservadas a infraestructura. `IpamService` ya omite gateway, dirección de red y difusión, tanto en selección automática como al validar una IP manual.

La UI conserva `Button`, `Input`, `NetworkFormField` y las superficies compartidas. Mantiene sombra de panel y datos técnicos monoespaciados, y aplica el acento activo con tokens existentes `iwana-secondary-700`/`400`.

### Evidencia de verificación

Primero se ejecutó la regresión sin el cambio: **1 suite fallida, 2 pruebas fallidas y 3 aprobadas**. Ambas fallas señalaron la ausencia del texto visible «Desactivar» en el botón.

| Comando | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/portal exec jest components/network --listTests --runInBand` | 2 archivos de pruebas encontrados |
| `pnpm --filter @iwana/portal exec jest components/network --runInBand --no-cache --coverage=false` | 2 suites aprobadas; 13 pruebas aprobadas; 0 omitidas |
| `pnpm --filter @iwana/portal typecheck` | Salida 0 |
| `pnpm --filter @iwana/portal exec eslint src/components/network/NetworkRouterCatalogClient.tsx src/components/network/NetworkRouterCatalogClient.spec.tsx src/components/network/network-catalog-labels.ts src/components/network/NetworkRouterDrawer.tsx src/components/network/Ipv4NetworkDrawer.tsx` | Salida 0; sin diagnósticos |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/network` | Sin hallazgos |

Resumen literal de Jest:

```text
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

Las pruebas nuevas verifican desactivación y reactivación con su versión, bloqueo de doble clic, conservación del estado ante error y ausencia de acciones para lectura. La ejecución emitió avisos existentes de `ts-jest` por `allowJs` y de Node por `punycode`; no hubo fallas.

**Límites:** no se ejecutó E2E ni inspección visual en navegador en esta corrección; no se midió cobertura ni se declara cerrado el gate global ≥80 %. El alcance conserva los contratos y datos actuales; admitir múltiples interfaces por router y asociar cada red a una interfaz requiere un cambio posterior del modelo. Las capturas históricas del informe corresponden a sus fechas originales.

**Plan ejecutado:** [Routers: estado visible y claridad de los campos](../plans/2026-10-26-mod13-routers-claridad.md).
