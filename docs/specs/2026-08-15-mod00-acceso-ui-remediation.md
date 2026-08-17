# Design — MOD00 Acceso — Remediación UI/UX

**Version:** 1.8
**Estado:** Aprobado
**Fecha:** 2026-08-15
**Autor:** AI-PROD-UX
**Superficie:** `apps/portal` → `/dashboard/settings/access`
**Congela para:** AI-FE-PLATFORM y AI-SR-QA (protocolo §3bis, track UX)
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Specs antecedentes:** `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md` y `docs/specs/2026-05-27-mod00-access-copy-design.md`
**Plan:** `docs/plans/2026-08-15-mod00-acceso-ui-remediation.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Identidad:** `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
**Vocabulario:** skill `system-vocabulary-review`
**Hermana visual:** `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`

**Qué es este documento.** Contrato correctivo de experiencia, copy y superficies para `/dashboard/settings/access`. Corrige hallazgos P1–P3 de la auditoría del 2026-08-15 sin cambiar alcance funcional, contratos de API ni tokens. Donde esta spec y las specs de mayo discrepen en copy, IA, accesibilidad o primitivas de esta ruta, **prevalece este documento**. El ownership (perfiles aquí, asignación de usuarios en `/dashboard/users`) no cambia.

**Qué no es.** No redefine tokens ni API de componentes. No escribe código. No pide endpoints, migraciones ni cambios de permisos. No contiene PII; los nombres de ejemplo son ilustrativos (`Monitoreo operativo`, `Perfil comercial`).

---

## 1. Objetivo

Corregir `/dashboard/settings/access` para que una persona administradora cree y ajuste perfiles de acceso **sin lenguaje interno, sin CTA huérfano y con las mismas primitivas que Organización**.

Metas simultáneas:

1. la tarea principal (perfiles + accesos) es visible en el primer viewport;
2. el copy habla de perfiles sugeridos, tipo de usuario y accesos; nunca de plantilla/sistema/módulo/clave cruda;
3. eliminar un perfil pide confirmación iWana;
4. los errores de API nunca se muestran crudos;
5. CTA, tabla, checkboxes, tabs, peek y objetivos táctiles alineados a Organización;
6. cumplir WCAG 2.2 AA en claro y oscuro.

No se añaden endpoints, migraciones, paquetes ni tokens. El alcance es **solo portal**.

---

## 2. Alcance

### 2.1 Entra

- Copy visible de esta ruta y de la tarjeta de atajo del hub que apunta a ella.
- Arquitectura de información (orden de bandas y colocación del CTA).
- Sanitización de errores de carga, política MFA, guardar y borrar.
- Diálogo iWana para eliminar un perfil personalizado.
- Mapeo de `operations` y fallbacks de sección/acceso.
- Primitivas: `PortalPanel.actions`, `PortalDataTableHead`, `CheckboxCard`, tabs del portal, `PortalSidePeek`, `Button` de reintento.
- Objetivos táctiles ≥44 px, foco visible, empty states con acción.
- Pruebas unitarias, E2E, axe y evidencia visual autenticada.

### 2.2 No entra

- API, OpenAPI, PostgreSQL, migraciones, tenancy o matriz de permisos.
- `/dashboard/users` (sigue usando «categoría base» del diccionario global).
- Navegación global, rediseño del componente `PageHeader`, otras subsecciones de Configuración.
- Tokens nuevos, `Switch` nuevo o cambios globales de `@iwana/ui`.
- Asignación de perfiles a personas (sigue en Usuarios).

---

## 3. Persona y tarea

**Persona principal:** administradora (`ADMIN`) que crea o ajusta perfiles de acceso y decide qué puede hacer cada uno por sección.

**Tarea en un ciclo:** elegir un perfil (sugerido o propio), revisar o cambiar sus accesos y guardar, sin salir de la pantalla.

**Tarea secundaria:** activar o desactivar la verificación en dos pasos global de la empresa.

Si un bloque no sirve a una de esas dos tareas, no se añade.

---

## 4. Arquitectura de información

Orden de lectura, de arriba hacia abajo:

1. Encabezado de página: título + subtítulo. **Sin** `PageHeader.actions`.
2. Alertas de operación (éxito / error recuperable / borrador de nuevo perfil).
3. Workspace: grid `xl:grid-cols-[perfiles personalizados | accesos del perfil]` con `items-start` (las columnas no se estiran a la misma altura en vacío).
4. Perfiles sugeridos (cards de apoyo a la creación).
5. Verificación en dos pasos global (política secundaria, al final).

El CTA de listado con datos (`Crear perfil`) vive en `PortalPanel.actions` de **Perfiles personalizados**, no en `PageHeader`. El empty editable conserva `Crear perfil` solo en `PortalEmptyState embedded`. No se duplican. Cuando no hay perfiles personalizados, el panel omite su `description` (el empty carga el mensaje).

La política MFA no comparte título de página con los perfiles y no usa borde lima.

---

## 5. Matriz de estados (congelada)

| Estado | Superficie | Copy / acción |
| --- | --- | --- |
| Carga inicial | Skeleton | `Cargando perfiles de acceso y sus accesos` |
| Vacío editable | `PortalEmptyState embedded` en panel `compact` | `Aún no has creado perfiles personalizados` + descripción de §6 + `Crear perfil`. Sin pozo anidado (`rounded-2xl` extra). |
| Sin perfil seleccionado | Solo `description` del panel Accesos | `Elige un perfil de la lista para revisar o cambiar sus accesos.` Sin `PortalEmptyState` ni título `Sin perfil seleccionado`. Sin segundo CTA. |
| Búsqueda sin resultados | `PortalEmptyState embedded` + acción | `No encontramos accesos en esta sección` + `Limpiar búsqueda` |
| Sin accesos compatibles | `PortalEmptyState embedded` | `Sin accesos disponibles` + `No hay accesos activos para mostrar en este momento.` |
| Error de carga | `PortalAlert` + reintento | Mensaje sanitizado de §6.4 + `Reintentar` |
| Error de política MFA | `PortalAlert` en el panel | Mensaje sanitizado de §6.4 |
| Error de submit de perfil | Conservar diálogo abierto | Mensaje sanitizado; no `error.message` |
| Eliminar perfil | `Dialog` iWana | Copy de §6.5; no llama al API hasta confirmar |

---

## 6. Copy congelado

Fuente: spec de mayo 2026-05-27, elevada a contrato de esta ruta. En esta pantalla, `UserRole` se nombra **tipo de usuario**, no categoría base.

### 6.1 Encabezado y paneles

| Pieza | Copy |
| --- | --- |
| Page title | `Perfiles de acceso` |
| Page subtitle | `Crea perfiles de acceso, define lo que puede usar cada uno y apóyate en perfiles sugeridos para empezar más rápido.` |
| Loading subtitle | `Cargando perfiles de acceso y sus accesos` |
| Panel | `Perfiles personalizados` |
| Panel description | `Crea perfiles propios para tu empresa y define qué puede hacer cada uno.` |
| Panel | `Perfiles sugeridos` |
| Panel description | `Estos perfiles sugeridos te ayudan a crear nuevos perfiles de acceso con menos trabajo manual.` |
| Fallback descripción sugerido | `Perfil sugerido` |
| Panel | `Accesos del perfil` / `Accesos del nuevo perfil` |
| Panel MFA title | `Verificación en dos pasos global` (se conserva) |
| Hub card description | `Administra perfiles de acceso, perfiles sugeridos y accesos por sección.` |

### 6.2 Tabla, acciones y diálogo

| Pieza | Copy |
| --- | --- |
| Columna | `Tipo de usuario` |
| Campo de formulario | `Tipo de usuario permitido` |
| CTA listado | `Crear perfil` |
| CTA sugerido | `Crear a partir de este perfil` |
| CTA preview | `Ver lo que permite` |
| Selector | `Usar un perfil sugerido` |
| Selector help | `Empieza con un perfil sugerido y ajusta solo lo necesario.` |
| Empezar desde cero help | `Crea el perfil desde cero y define sus accesos paso a paso.` |
| Feedback elegir sugerido | `Elige un perfil sugerido y pulsa «Crear a partir de este perfil» para comenzar.` |
| Peek eyebrow | `Lo que permite este perfil` |
| Peek CTA | `Crear a partir de este perfil` |
| Editor submit | `Guardar cambios` |
| Vacío búsqueda | `No encontramos accesos en esta sección` |
| Acción búsqueda | `Limpiar búsqueda` |
| Fallback sección | `Sección` |
| Fallback acceso | `Acceso no descrito` |
| Sección `operations` | `Operaciones` |

### 6.3 Términos prohibidos en UI final de esta ruta

`plantilla`, `plantillas`, `sistema` (como eyebrow o descripción de perfil), `usar como base`, `categoría base`, `módulo`, `matriz`, claves `operations` / `wfm` / `permissionKey`.

`Verificación en dos pasos` se conserva para MFA. `Crear perfil`, `Editar perfil`, `Editar accesos`, `En edición`, `Empezar desde cero`, `activo` / `inactivo` se conservan.

### 6.4 Errores sanitizados

Nunca se pinta `error.message` ni `Forbidden resource`.

| Caso | Copy |
| --- | --- |
| Carga de perfiles | `No pudimos cargar los perfiles de acceso. Intenta nuevamente.` |
| 401 | `Tu sesión expiró. Inicia sesión nuevamente.` |
| 403 perfiles | `Solo las personas administradoras pueden gestionar perfiles de acceso.` |
| Guardar perfil o accesos | `No pudimos guardar los cambios. Intenta nuevamente.` |
| Eliminar | `No pudimos eliminar el perfil. Intenta nuevamente.` |
| Carga MFA | `No fue posible cargar la política de verificación en dos pasos.` |
| Guardar MFA | `No fue posible guardar la política de verificación en dos pasos. Intenta de nuevo.` |
| 403 MFA | `Solo las personas administradoras pueden cambiar la política de autenticación.` |

Reintento de carga: `Reintentar` con `Button variant="link" size="lg" className="min-h-11"`.

### 6.5 Diálogo de eliminar

- Título: `¿Eliminar el perfil «{nombre}»?`
- Cuerpo: `Las personas que lo tengan asignado dejarán de usarlo. Esta acción no se puede deshacer.`
- Confirmar: `Eliminar perfil`
- Cancelar: `Cancelar`

Confirmar llama a `accessControlApi.deleteProfile` **solo** después de `Eliminar perfil`. Cancelar no dispara el API.

---

## 7. Campo y labels de sección

`getAccessModuleLabel` debe incluir `operations` → `Operaciones` y `wfm` → `Operaciones de campo`. Cualquier otra clave cae a `Sección`, nunca al `moduleKey`.

En el peek de sugerido, si falta `description` del permiso se muestra `Acceso no descrito`, nunca la clave.

---

## 8. Crear y previsualizar

El diálogo `Crear nuevo perfil` ofrece dos caminos: `Usar un perfil sugerido` / `Empezar desde cero`.

La vista previa de un perfil sugerido usa `PortalSidePeek` (no overlay a `z-10000`). Overlay no cierra por clic accidental en el velo si la primitive ya define el contrato; Escape y Cerrar sí. CTA del pie: `Crear a partir de este perfil`.

---

## 9. Dar de baja / eliminar

Solo perfiles **no** de sistema. Acción de fila con nombre accesible `Eliminar perfil {nombre}`.

No hay `window.confirm`. El diálogo de §6.5 es obligatorio.

---

## 10. Contrato visual (AI-DS-OWNER — sin tokens nuevos)

Se usa la **misma barra** que Organización. Prohibido crear tokens o primitivas globales.

- CTA de sección: `Button size="lg"`.
- Reintentos: `Button variant="link"` + `min-h-11`.
- Acciones de fila: `Button size="sm"` + `min-h-11`. Sin override `h-8`.
- Selecciones (MFA, accesos, mantener activo): `CheckboxCard` con superficie global `iwana-surface-soft` en claro (`bg-iwana-surface-soft/60`, hover `bg-iwana-surface-soft`, borde `gray-200`), dark intacto (`dark:bg-dark-surface-3/60`, `dark:hover:bg-dark-surface-3`, `dark:border-dark-border`); veredicto AI-DS-OWNER (v1.8).
- Encabezados de tabla: `PortalDataTableHead` + class-tokens de `portal-ui.tsx`. Sin pager (cardinalidad de settings).
- Tabs de sección: `portalModuleTabsTrackClassName` + `portalModuleTabTriggerClassName` (activo = `bg-iwana-primary text-white`). Lima no marca la sección actual.
- Peek: `PortalSidePeek` con `shadow-iwana-soft`. Prohibido `z-10000`, `shadow-2xl` y glass en cabecera del panel.
- Superficies: `PortalPanel` con borde `border-gray-200`. Prohibido `border-iwana-secondary` como marco de panel o card.
- Fila en edición: barra lima izquierda + píldora `En edición` (`bg-iwana-secondary-50` + `text-iwana-secondary-700`) — acento válido.
- MFA activa: badge tonal `bg-iwana-secondary-100 text-iwana-secondary-900`, no borde lima del panel.
- Footer MFA: apilado en mobile (`flex flex-col items-stretch`, botón `w-full`) y en fila desde `sm` (`sm:flex-row sm:items-center sm:justify-between`, botón `sm:w-auto`). En 390×844 la ayuda queda encima del CTA, sin solape.
- Reposo: `shadow-iwana-soft` / `shadow-iwana-card`. Prohibido `shadow-[var(--shadow-iwana)]` y `shadow-2xl`.
- Foco: `interactiveFocusClassName` en controles custom (selector de creación).
- Objetivos táctiles: ≥44 px (`min-h-11` o `size="lg"`).
- Densidad: ritmo de página `space-y-4`. `PortalPanel compact` en sugeridos, MFA y paneles vacíos. Workspace con tabla/editor puede quedar `p-5`.
- Empty de perfiles: `PortalEmptyState embedded` (sin card-dentro-de-card). Accesos sin selección: sin empty ilustrado. Empty de búsqueda y de “sin accesos compatibles”: también `embedded`.
- Loading, sesión no disponible y acceso restringido usan el mismo ritmo `space-y-4` que la vista cargada.
- Toolbar de acciones en card móvil: `PortalActionToolbar compact` sin override `bg-gray-50`. El pozo es el del primitive (`iwana-surface-soft`).
- Cards de perfiles sugeridos: título → `line-clamp-2` (sin `min-h` artificial) → meta → CTAs apilados `flex-col gap-2` y `w-full` (nunca `sm:flex-row` ni `sm:w-auto`). Preview `ghost size="sm" min-h-11` con superficie suave compuesta localmente (sin variante global nueva; tailwind-merge del `cn` de `Button` resuelve los hover): `border border-gray-200/80 bg-iwana-surface-soft hover:bg-iwana-secondary-50 dark:border-dark-border dark:bg-dark-surface-3 dark:hover:bg-dark-surface-4`. El hover lima es acento de interacción permitido («hover marcado»), nunca fondo base. Sin override de foco: ring primario del ghost base con offset coincidente con el fondo de la card. Crear `primary size="sm" min-h-11` (sin `size="lg"` ni `sm:flex-1`). El `primary` de card alinea la variante del CTA de creación con el del pie del peek y resuelve el `secondary` plano; `primary size="lg"` queda reservado al `Crear perfil` del panel de listado y al pie del peek. La grilla de perfiles sugeridos usa **siempre** `grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, incluso con una sola card: la card ocupa una columna responsive en desktop y el ancho completo en mobile. Sin `max-w-*`, sin estilos inline ni ramas por cantidad de cards. Sin eyebrow por card: el panel ya se titula `Perfiles sugeridos`. El título no comparte fila con los botones.

`Crear perfil` de listado con datos usa `PortalPanel.actions`. El empty editable no duplica el CTA del header de página.

---

## 11. Accesibilidad (WCAG 2.2 AA)

1. Contraste AA en claro y oscuro. Si identidad y contraste chocan, prevalece contraste.
2. Foco visible en reintento, selector de creación, peek, tabs y acciones de fila.
3. Teclado: crear, previsualizar, editar accesos, guardar, eliminar, reintentar.
4. `PortalSidePeek` atrapa el foco y lo restaura.
5. Nombre accesible de acciones de fila incluye el nombre del perfil, sin IDs internos.
6. Empty de primera vez vs búsqueda se distinguen por copy y por acción.

Viewports de verificación: 390×844, 1024×768, 1440×900, claro y oscuro.

---

## 12. Fuera de alcance

- API, OpenAPI, PostgreSQL, migraciones, tenancy, matriz de permisos o seeds backend.
- Usuarios, asignación de perfiles, navegación global.
- Tokens, `Switch`, cambios globales de `@iwana/ui` o `PortalDataTableShell`.

---

## 13. Criterios de aceptación (UX/DS)

| ID | Criterio |
| --- | --- |
| CA-ACC-UX-01 | El h1 es `Perfiles de acceso` y no hay `Crear perfil` en el PageHeader. |
| CA-ACC-UX-02 | Con listado, `Crear perfil` está en el panel Perfiles personalizados. |
| CA-ACC-UX-03 | Vacío editable muestra un solo `Crear perfil` (empty). |
| CA-ACC-UX-04 | No aparece `Plantillas iniciales`, `Usar como base` ni `Categoría base` en esta ruta. |
| CA-ACC-UX-05 | La pestaña `operations` se lee `Operaciones`; nunca la clave cruda. |
| CA-ACC-UX-06 | Un 500/403 de API no pinta el mensaje interno. |
| CA-ACC-UX-07 | Eliminar abre diálogo; el API no se llama al pulsar el icono. |
| CA-ACC-UX-08 | Preview usa `PortalSidePeek` (role dialog con trampa de foco). |
| CA-ACC-UX-09 | MFA, accesos y «mantener activo» usan `CheckboxCard`. |
| CA-ACC-UX-10 | Controles interactivos alcanzan al menos 44 px. |
| CA-ACC-UX-11 | Claro y oscuro cumplen WCAG AA. |
| CA-ACC-UX-12 | La política MFA queda debajo de perfiles sugeridos. |
| CA-ACC-UX-13 | Vacío de perfiles sin pozo anidado; un solo `Crear perfil`; el panel no duplica su description. |
| CA-ACC-UX-14 | Con 0 perfiles personalizados, el heading `Perfiles sugeridos` es visible sin scroll en desktop 1440×900. |
| CA-ACC-UX-15 | La caja del título de una card sugerida no intersecta la caja de su CTA de creación. |
| CA-ACC-UX-16 | En desktop ≥1440 px con ≥4 perfiles sugeridos, cada CTA de una card queda dentro del ancho de esa card, apilado, con altura ≥44 px y sin salto de línea. |
| CA-ACC-UX-17 | Empties internos de Accesos van `embedded`; las cards sugeridas no repiten el eyebrow `Sugerido`; la toolbar móvil no usa pozo `bg-gray-50`. |
| CA-ACC-UX-18 | Con una sugerencia, la card ocupa una columna responsive en desktop y ancho completo en mobile. |
| CA-ACC-UX-19 | El editor muestra `Revisa lo que «{perfil}» puede/podrá ver o hacer en cada sección.` según sea perfil guardado o borrador. |
| CA-ACC-UX-20 | En 390×844 la ayuda MFA queda encima del CTA, sin solape, y `Guardar política` ocupa el ancho disponible; desde `sm` vuelven a fila. |

---

## 14. Relación con artefactos vigentes

| Artefacto | Efecto |
| --- | --- |
| ADR-040 | Sin cambio de ownership ni permisos. |
| Spec roles de empresa (2026-05-25) | Se conserva: perfiles aquí, asignación en Usuarios. |
| Spec copy Access (2026-05-27) | Esta spec **congela** su mapa de renombres para la ruta. |
| Remediación Organización (2026-08-15) | Barra visual hermana: CTA en panel, 44 px, `CheckboxCard`, `PortalDataTableHead`, errores sanitizados, diálogo destructivo. |
| Firma iWana | Lima = avance/selección, no marco ni tab de posición. |

No se requiere PRD, HLD ni ADR nuevos.

---

## 15. Desbloqueo de tracks

Esta spec v1.7 queda **aprobada** el 2026-08-15. v1.1 aclaró el layout de cards sugeridas. v1.2 congeló densidad embebida (`compact` / `embedded`, `items-start`, CA-ACC-UX-13…15). v1.3 compactó cards sugeridas (grid 4 cols, CTAs `size="sm"`). v1.4 cierra la review de identidad: CTAs sugeridos siempre apilados a ancho de card, empties internos `embedded`, sin eyebrow repetido, toolbar móvil sin pozo gris, ritmo `space-y-4` también en loading, CA-ACC-UX-16…17. v1.5 añade card sugerida única contenida (grilla responsive incondicional `md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`), copy orientado a tarea del editor (`Revisa lo que «{perfil}» puede/podrá ver o hacer en cada sección.` para perfil guardado y borrador) y footer MFA responsive (apilado en mobile, en fila desde `sm`), con CA-ACC-UX-18…20. v1.6 cambia la variante del CTA de creación de la card sugerida (`secondary` → `primary`), veredicto AI-DS-OWNER, sin cambio en CA-ACC-UX-16/17; notificación a AI-FE-PLATFORM y AI-SR-QA vía orquestador. v1.7 compone una superficie suave local en el preview de cards sugeridas para que el botón se lea como botón sobre card blanca; veredicto AI-DS-OWNER; sin cambio en CA-ACC-UX-10/16/17; notificación a AI-FE-PLATFORM y AI-SR-QA vía orquestador. v1.8 hace global la superficie suave del `CheckboxCard` (selecciones MFA, accesos y «mantener activo»): en claro `bg-iwana-surface-soft/60` + hover `bg-iwana-surface-soft` + borde `gray-200`, dark intacto; veredicto AI-DS-OWNER; sin cambio en CA-ACC-UX ni en restricciones v1.3/v1.4; notificación a AI-FE-PLATFORM y AI-SR-QA vía orquestador.

- AI-DS-OWNER verifica el §10.
- AI-FE-PLATFORM implementa contra §4–§11.
- AI-SR-QA escribe RED y E2E contra copy literal y CA-ACC-UX-01…20.
- Un cambio posterior se versiona (v1.8+) y se notifica; no se parchea solo en código.
