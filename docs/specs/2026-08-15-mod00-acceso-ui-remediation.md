# Design — MOD00 Acceso — Remediación UI/UX

**Version:** 1.13
**Estado:** Aprobado (congelado por AI-PROD-UX el 2026-08-29; opción B del plan de catálogo)
**Fecha:** 2026-08-29
**Autor:** AI-PROD-UX
**Superficie:** `apps/portal` → `/dashboard/settings/access` (y ayuda mínima en `/dashboard/users`, §6.7)
**Congela para:** AI-FE-PLATFORM y AI-SR-QA (protocolo §3bis, track UX; re-sync de contratos de cards)
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**ADR de corte:** `docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md` (D4; RF-ACC-16 / RF-ACC-17)
**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Specs antecedentes:** `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md` y `docs/specs/2026-05-27-mod00-access-copy-design.md`
**Plan (remediación 2026-08-15):** `docs/plans/2026-08-15-mod00-acceso-ui-remediation.md`
**Plan (convergencia):** `docs/plans/2026-08-28-mod00-convergencia-rbac-granular.md`
**Plan (catálogo en peek):** `docs/plans/2026-08-29-mod00-acceso-catalogo-sugeridos-en-peek.md` **v1.1 — Aprobado, opción B**
**Spec hermana Fase 3:** `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` (v1.2)
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Identidad:** `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
**Receta:** `.agents/skills/iwana-identity-ui-review/references/component-recipes.md` #9 (`PortalSidePeek`)
**Vocabulario:** skill `system-vocabulary-review`
**Hermana visual:** `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`

**Qué cambia vs v1.12.** El momento lista deja de ser una tira plana `divide-y` + un pozo `rounded-lg`. Las 9 filas viven en el shell de tabla (`portalDataTableShellClassName` + `shadow-iwana-card`); «Empezar desde cero» usa el mismo radio `rounded-2xl`, el mismo `border-gray-200` y la misma sombra dual, con relleno `iwana-surface-soft`. Sigue prohibida la galería de 9 cards. Flujo y primitive **no** se reabren.

**Qué cambia vs v1.11.** El lima de `Ver lo que permite` deja de ser estático ×9 (gramática de índice). En reposo es meta gris; lima AA solo en hover/foco de la fila. El momento detalle usa `.portal-eyebrow-muted` por sección y `divide-gray-100`. Nace CA-ACC-UX-32. Flujo, primitive y galería **no** se reabren.

**Qué cambia vs v1.10.** Presentación del momento lista del peek: intro con peso de ayuda (`text-xs`) y copy más corto (mismos cuatro hechos POST-02); «Empezar desde cero» sale del `divide-y` del catálogo y usa pozo `iwana-surface-soft` + icono lima AA. Nacen CA-ACC-UX-31 y CA-ACC-UX-33. Flujo, primitive y galería **no** se reabren.

**Qué cambia vs v1.9.** Retira la galería permanente de 9 cards de la página. El catálogo de perfiles sugeridos vive **solo** en un `PortalSidePeek` de creación con dos momentos (elegir → ver qué trae → confirmar). El borrador (nombre, tipo de usuario, accesos, guardar) vuelve a la **página principal**. Se elimina el diálogo modal de dos caminos. Sin Drawer nuevo, sin fallback de «una línea», sin edición in-place de `isSystem`, sin copy-on-write. CA-ACC-UX-14 se sustituye (empty + CTA visibles sin scroll). CA-ACC-UX-15, 16 y 18 quedan **Superados**. CA-ACC-UX-12 se reescribe (MFA debajo del workspace). Nacen CA-ACC-UX-21…30. CA-ACC-POST-01, 02, 04, 05 y 06 se conservan; POST-03 se reescribe contra filas del peek.

**Prevalencia v1.13.** Donde esta spec y las specs de mayo discrepen en copy, IA, accesibilidad o primitivas de `/dashboard/settings/access`, **prevalece este documento**. Esta versión gobierna el empty post-corte, la IA de página **sin** galería y el flujo único de peek de creación. La spec de Fase 3 (`2026-08-28-mod00-convergencia-nav-gates-ux.md` v1.2) **no redefine** ese empty: solo declara las 9 entradas, el orden canónico y los nombres humanos **dentro del peek**. El ownership (perfiles aquí, asignación de usuarios en `/dashboard/users`) no cambia.

**Qué no es.** No redefine tokens ni API de componentes. No escribe código. No pide endpoints, migraciones ni cambios de permisos. No contiene PII; los nombres de ejemplo son ilustrativos (`Monitoreo operativo`, `Perfil comercial`, `Técnico de campo`). Veredicto AI-DS-OWNER (2026-08-29): **GO CON CONDICIONES** — §10.1.

---

## 1. Objetivo

Corregir `/dashboard/settings/access` para que una persona administradora cree y ajuste perfiles de acceso **sin lenguaje interno, sin CTA huérfano y con las mismas primitivas que Organización**.

Metas simultáneas:

1. la tarea principal es visible en el primer viewport — post-corte: los sugeridos ya están en uso y **no se editan aquí**; crear un perfil **no cambia a quién lo usa**; el admin **debe** ir a Usuarios y **reemplazar** el sugerido por el nuevo;
2. el copy habla de perfiles sugeridos, tipo de usuario y accesos; nunca de plantilla/sistema/módulo/clave cruda;
3. eliminar un perfil pide confirmación iWana;
4. los errores de API nunca se muestran crudos;
5. CTA, tabla, checkboxes, tabs, peek y objetivos táctiles alineados a Organización;
6. cumplir WCAG 2.2 AA en claro y oscuro.

No se añaden endpoints, migraciones, paquetes ni tokens. El alcance es **portal**.

---

## 2. Alcance

### 2.1 Entra

- Copy visible de esta ruta y de la tarjeta de atajo del hub que apunta a ella.
- Arquitectura de información (orden de bandas y colocación del CTA). **Sin** galería permanente de sugeridos en la página.
- Empty y copy del estado post-corte (§3.1, §5, §6.1).
- Peek único de creación (§8, §6.8): catálogo de 9 perfiles sugeridos + desde cero; detalle de lo que permite; confirmar deja el borrador en la página.
- Banner de siguiente paso tras guardar un perfil nuevo (§6.6).
- Ayuda de una línea en `/dashboard/users` cuando hay un perfil sugerido seleccionado (§6.7, CA-ACC-POST-06).
- Sanitización de errores de carga, política MFA, guardar y borrar.
- Diálogo iWana para eliminar un perfil personalizado (no el de crear).
- Mapeo de `operations` y fallbacks de sección/acceso.
- Primitivas: `PortalPanel.actions`, `PortalDataTableHead`, `CheckboxCard`, tabs del portal, `PortalSidePeek`, `PortalAlert`, `Button` de reintento. Sin Drawer nuevo.
- Objetivos táctiles ≥44 px, foco visible, empty states con acción.
- Pruebas unitarias, E2E, axe y evidencia visual autenticada.

### 2.2 No entra

- API, OpenAPI, PostgreSQL, migraciones, tenancy, matriz de permisos o endpoints nuevos.
- Edición in-place de perfiles sugeridos (`isSystem`): sin `Editar` / `Editar accesos` / eliminar en las filas del peek de creación (CA-ACC-POST-03, CA-ACC-UX-30). El seed puede reescribir descripción y accesos de un sugerido al canon; mutarlos en UI chocaría RF-ACC-17.
- Copy-on-write con reasignación masiva (evolución futura; fuera de este freeze).
- Navegación global, rediseño del componente `PageHeader`, otras subsecciones de Configuración.
- Tokens nuevos, `Switch` nuevo o cambios globales de `@iwana/ui`.
- Cambio de ownership: la asignación de perfiles a personas sigue en Usuarios. Esta spec no mueve esa tarea a Access ni altera el checkbox de asignación ni el panel de accesos efectivos de Fase 3, salvo la línea de ayuda §6.7.

En `/dashboard/users` el diccionario global sigue usando «categoría base». La prohibición de ese término es exclusiva de la ruta access (§6.3).

---

## 3. Persona y tarea

**Persona principal:** administradora (`ADMIN`) que crea o ajusta perfiles de acceso y decide qué puede hacer cada tipo de usuario.

**Tarea principal post-corte (estado por defecto):** dos superficies, no un gesto. (1) En Access: crear un perfil **nuevo** a partir del sugerido y ajustar sus accesos. Eso **no** cambia a las personas que ya usan el sugerido. (2) En Usuarios: **reemplazar** el perfil de esa persona (quitar el sugerido y dejar solo el nuevo). Access **no** promete «editar el perfil que ya usan tus técnicos» como un solo paso.

**Tarea en un ciclo para un perfil personalizado ya creado:** elegirlo en la lista, revisar o cambiar sus accesos y guardar, sin salir de la pantalla. Eso solo afecta a quien **ya tenga asignado** ese perfil personalizado.

**Tarea secundaria:** activar o desactivar la verificación en dos pasos global de la empresa.

Si un bloque no sirve a una de esas tareas, no se añade.

### 3.1 Estado post-corte (RF-ACC-16)

Tras la migración del corte, un tenant típico tiene:

- **9 perfiles sugeridos** (`isSystem`), uno por tipo de usuario, **ya asignados** a las personas activas no administradoras que no tenían perfil.
- **0 perfiles personalizados.**

Este es el **estado por defecto**, no un empty de «primera vez».

Hechos de producto que el copy debe enseñar (AI-SR-FULL; no se muestran claves de API en la UI):

1. **Crear no mueve a nadie.** Confirmar en el peek (`Usar este perfil`) copia accesos a un **borrador** en la página. `POST /profiles` ocurre al **guardar** ese borrador. Las personas siguen asignadas al perfil sugerido (`isSystem`). No hay fork ni reasignación masiva en este freeze.
2. **Asignar es reemplazar el set.** En Usuarios, guardar perfiles (`PUT /users/:id/profiles`) **sustituye** la lista completa; no «añade». Para que el técnico deje el sugerido, el admin deja marcado **solo** el personalizado (quita el sugerido). Si deja ambos, los accesos se **unen**.
3. **Un solo gesto en Access no cambia lo que ya usan.** No hay CTA ni copy que prometa editar in-place el perfil que ya tienen asignado los técnicos.

Los perfiles sugeridos no se mutan in place (RF-ACC-17). El seed puede reescribir descripción y accesos de un sugerido al canon V2.

---

## 4. Arquitectura de información

Orden de lectura, de arriba hacia abajo:

1. Encabezado de página: título + subtítulo. **Sin** `PageHeader.actions`.
2. Alertas de operación (éxito / error recuperable / borrador de nuevo perfil / **banner de siguiente paso** §6.6).
3. Workspace: grid `xl:grid-cols-[perfiles personalizados | accesos del perfil]` con `items-start` (las columnas no se estiran a la misma altura en vacío).
4. Verificación en dos pasos global (política secundaria, al final).

**No hay banda 4 de 9 cards.** El heading `Perfiles sugeridos` no vive en la página: vive como `title` del peek de creación (§6.8, §8). El empty post-corte y el subtítulo **siguen enseñando** que los equipos ya usan los sugeridos; el catálogo para crear se abre solo con `Crear perfil`.

El CTA `Crear perfil` sigue en empty (`PortalEmptyState embedded`) y, con listado, en `PortalPanel.actions` de **Perfiles personalizados**. No en `PageHeader`. No se duplican. Cuando no hay perfiles personalizados, el panel omite su `description` (el empty carga el mensaje).

En desktop 1440×900 con 0 personalizados, empty post-corte (o el listado si ya hay personalizados) **y** el CTA `Crear perfil` permanecen visibles sin scroll (CA-ACC-UX-14 sustituido).

La política MFA no comparte título de página con los perfiles y no usa borde lima. Queda **debajo del workspace** de personalizados (CA-ACC-UX-12 reescrito).

---

## 5. Matriz de estados (congelada)

| Estado | Superficie | Copy / acción |
| --- | --- | --- |
| Carga inicial | Skeleton | `Cargando perfiles de acceso y sus accesos` |
| Vacío post-corte | `PortalEmptyState embedded` en panel `compact` | 0 personalizados **y** ≥1 sugerido. Título y descripción de §6.1 (vacío post-corte) + un solo `Crear perfil`. Sin pozo anidado (`rounded-2xl` extra). **No** usar el copy de «aún no has creado». |
| Vacío sin sugeridos | `PortalEmptyState embedded` en panel `compact` | 0 personalizados **y** 0 sugeridos (tenant sin sugeridos). Título y descripción de §6.1 (vacío sin sugeridos) + un solo `Crear perfil`. Mismo empty embebido. |
| Sin perfil seleccionado | Solo `description` del panel Accesos | `Elige un perfil de la lista para revisar o cambiar sus accesos.` Sin `PortalEmptyState` ni título `Sin perfil seleccionado`. Sin segundo CTA. |
| Búsqueda sin resultados | `PortalEmptyState embedded` + acción | `No encontramos accesos en esta sección` + `Limpiar búsqueda` |
| Sin accesos compatibles | `PortalEmptyState embedded` | `Sin accesos disponibles` + `No hay accesos activos para mostrar en este momento.` |
| Éxito: perfil nuevo guardado | `PortalAlert` success + acción | Banner §6.6 **obligatorio** (`live="polite"`): nadie usa el perfil todavía; `Ir a Usuarios` es el siguiente paso, no un atajo opcional. El perfil nuevo ya está en la lista. |
| Error de carga | `PortalAlert` + reintento | Mensaje sanitizado de §6.4 + `Reintentar` |
| Error de política MFA | `PortalAlert` en el panel | Mensaje sanitizado de §6.4 |
| Error de submit de perfil | Conservar el workspace de borrador en página | Mensaje sanitizado; no `error.message`. El peek de creación ya está cerrado. |
| Eliminar perfil | `Dialog` iWana | Copy de §6.5; no llama al API hasta confirmar |
| Peek de creación: lista | `PortalSidePeek` | Abierto desde `Crear perfil`. 9 filas en orden canónico (spec Fase 3 §3.3) + fila `Empezar desde cero`. Sin borrador en la página. |
| Peek de creación: detalle | `PortalSidePeek` (mismo panel) | Accesos agrupados, solo lectura. Footer: `Usar este perfil` / `Volver a la lista`. |
| Peek de creación: cerrado sin confirmar | Página | Escape, Cerrar o velo: peek cierra; **no** hay borrador. |
| Borrador en página | Workspace personalizados + accesos | Tras `Usar este perfil` o `Empezar desde cero`: peek cerrado; foco en el campo nombre. |

En 1440×900 con 0 personalizados, el empty post-corte y el CTA `Crear perfil` son visibles sin scroll (sustituye el rol de CA-ACC-UX-14 v1.9).

---

## 6. Copy congelado

Fuente: spec de mayo 2026-05-27, elevada a contrato de esta ruta; v1.9 actualizó encabezado, empty y sugeridos para el post-corte; v1.10 mueve el catálogo al peek y retira el diálogo de dos caminos. En esta pantalla, `UserRole` se nombra **tipo de usuario**, no categoría base.

### 6.1 Encabezado y paneles

| Pieza | Copy |
| --- | --- |
| Page title | `Perfiles de acceso` |
| Page subtitle | `Crear un perfil aquí no cambia a quién lo usa. Para que alguien deje el perfil sugerido, debes reemplazarlo en Usuarios.` |
| Loading subtitle | `Cargando perfiles de acceso y sus accesos` |
| Panel | `Perfiles personalizados` |
| Panel description | `Crea perfiles propios para tu empresa y define qué puede hacer cada uno. Las personas no los usan hasta que los asignas en Usuarios.` |
| Vacío post-corte (título) | `Tus equipos ya usan los perfiles sugeridos` |
| Vacío post-corte (descripción) | `No se editan aquí. Crear uno a partir del sugerido no mueve a nadie: después debes ir a Usuarios, quitar el perfil sugerido y dejar solo el nuevo.` |
| Vacío sin sugeridos (título) | `Aún no has creado perfiles personalizados` |
| Vacío sin sugeridos (descripción) | `Cuando crees tu primer perfil, aparecerá aquí para que puedas editarlo y revisar sus accesos.` |
| Panel | `Accesos del perfil` / `Accesos del nuevo perfil` |
| Panel MFA title | `Verificación en dos pasos global` (se conserva) |
| Hub card description | `Crea perfiles nuevos a partir de los sugeridos. Para que alguien los use, debes reemplazar el perfil sugerido en Usuarios.` |

### 6.2 Tabla, acciones y diálogo de eliminar

| Pieza | Copy |
| --- | --- |
| Columna | `Tipo de usuario` |
| Campo de formulario | `Tipo de usuario permitido` |
| CTA listado y empty | `Crear perfil` |
| Editor submit | `Guardar cambios` |
| Vacío búsqueda | `No encontramos accesos en esta sección` |
| Acción búsqueda | `Limpiar búsqueda` |
| Fallback sección | `Sección` |
| Fallback acceso | `Acceso no descrito` |
| Sección `operations` | `Operaciones` |

Las filas del peek de perfiles sugeridos **no** muestran `Editar`, `Editar accesos` ni eliminar. Esos CTAs viven solo en la tabla o cards de **perfiles personalizados**.

El diálogo modal `Crear nuevo perfil` (selectores `Usar un perfil sugerido` / `Empezar desde cero`) **se retira**. Sus ayudas de «crear no mueve» se reubican en el peek (§6.8).

### 6.3 Términos prohibidos en UI final de esta ruta

`plantilla`, `plantillas`, `sistema` (como eyebrow o descripción de perfil), `usar como base`, `categoría base`, `módulo`, `matriz`, claves `operations` / `wfm` / `permissionKey`.

`Verificación en dos pasos` se conserva para MFA. `Crear perfil`, `Ver lo que permite`, `Usar este perfil`, `Volver a la lista`, `Empezar desde cero`, `Editar perfil`, `Editar accesos`, `En edición`, `activo` / `inactivo` se conservan — estos dos «Editar…» **solo** en personalizados.

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

### 6.6 Banner de siguiente paso (tras guardar un perfil nuevo)

Tras un guardado **exitoso** de un perfil **nuevo** (creado desde un sugerido o desde cero), se muestra un `PortalAlert variant="success"` con `live="polite"` **encima** del workspace (banda 2 de §4). Primitiva existente; sin tokens nuevos.

El banner es **obligatorio** (no un atajo opcional). Crear el perfil (`POST /profiles`) **no** reasigna a nadie: las personas siguen en el sugerido. En Usuarios, guardar perfiles **reemplaza** el set completo (`PUT /users/:id/profiles`): el admin debe dejar marcado **solo** el nuevo. No hay reasignación masiva en este freeze.

| Pieza | Copy |
| --- | --- |
| Título (desde sugerido) | `Perfil creado. Debes asignarlo en Usuarios` |
| Descripción (desde sugerido) | `Nadie cambió de perfil. En Usuarios, abre a la persona y deja marcado solo «{nombre}»: quita el perfil sugerido. Si dejas ambos, sumará los accesos de los dos.` |
| Título (desde cero) | `Perfil creado. Debes asignarlo en Usuarios` |
| Descripción (desde cero) | `Nadie usa este perfil todavía. En Usuarios, abre a la persona y deja marcado «{nombre}».` |
| Acción | `Ir a Usuarios` → `/dashboard/users` (`Button size="lg"` + `min-h-11`) |

`{nombre}` es el nombre visible del perfil recién guardado. El banner permanece hasta la siguiente navegación, hasta un nuevo intento de creación o hasta un error que lo reemplace. No se muestra al guardar solo accesos de un perfil personalizado ya existente (`Guardar cambios`).

Prohibido: copy de éxito que diga solo «perfil creado» o que sugiera que los técnicos ya usan el nuevo perfil.

### 6.7 Ayuda en Usuarios (CA-ACC-POST-06)

En el side peek de edición (`EditUserModal`), dentro de la sección «Perfiles de acceso» (`CompanyRolesAssignmentSection`), cuando **al menos un perfil seleccionado** es sugerido (`isSystem = true`), se muestra una línea de ayuda bajo la lista. No cambia checkboxes, preview de accesos finales ni el panel de accesos efectivos de Fase 3.

| Pieza | Copy |
| --- | --- |
| Ayuda | `Un perfil sugerido no se edita en Perfiles de acceso. Para cambiar lo que permite, créalo allí y, en esta lista, deja solo el nuevo: quita el sugerido. Si dejas ambos, sumará los accesos.` |
| Enlace (texto del mismo párrafo o inmediato) | `Perfiles de acceso` → `/dashboard/settings/access` |

`CreateUserModal` muestra la misma ayuda si hay un perfil sugerido seleccionado. Si no hay ninguno seleccionado, la línea no se pinta.

En Usuarios se conserva «categoría base» (diccionario global). Esta ayuda no usa los prohibidos de §6.3.

### 6.8 Peek de creación (catálogo)

El heading `Perfiles sugeridos` y su descripción **ya no son banda de página**. Viven en el peek. Vocabulario de la ruta: perfil sugerido / tipo de usuario / accesos. Nunca `plantilla`, `sistema`, `módulo` ni clave cruda (§6.3).

#### Momento lista

| Pieza | Copy |
| --- | --- |
| `title` | `Perfiles sugeridos` |
| `description` (slot `<p>`, una línea) | omitido |
| Intro en `children` | `Ya están en uso y no se editan aquí. Elegir no mueve a nadie: en Usuarios quitas el sugerido y dejas solo el nuevo.` |
| Fallback descripción de fila | `Perfil sugerido` |
| Meta de fila | `{tipo de usuario} · {n} accesos` |
| Acción de fila sugerida (visible) | `Ver lo que permite` |
| Nombre accesible de fila sugerida | `Ver lo que permite {nombre}` |
| Fila extra | `Empezar desde cero` |
| Ayuda de desde cero | `Define los accesos paso a paso. Luego asígnalo en Usuarios.` |

No hay selector `Usar un perfil sugerido`: la lista **es** el catálogo. La ayuda «empieza con un perfil sugerido y ajusta solo lo necesario» queda cubierta por el intro de `children` + el workspace de borrador. El slot `description` del peek es un `<p>` de una línea: el párrafo largo **no** va ahí (desempate EM-ARCH / DS-OWNER).

#### Momento detalle

| Pieza | Copy |
| --- | --- |
| `eyebrow` | omitido (estable: no cambia entre momentos; el slot no anuncia el detalle) |
| `title` | Nombre humano del perfil sugerido (mapa Fase 3 §3.2; fallback `profile.name`) |
| `description` (una línea) | `{tipo de usuario} · {n} accesos` |
| Heading en `children` | `Lo que permite este perfil` |
| Vacío de accesos | `Sin accesos asignados a este perfil sugerido.` |
| CTA primario (`footer`) | `Usar este perfil` |
| CTA secundario (`footer`) | `Volver a la lista` |

`Usar este perfil` **no** asigna personas y **no** llama a `POST /profiles`: cierra el peek y deja el borrador en la página. El peek no promete asignación.

Labels retirados (no reaparecen en UI): `Crear a partir de este perfil`, `Usar un perfil sugerido`, `Elige un perfil sugerido y pulsa «Crear a partir de este perfil» para comenzar.`, `Crear nuevo perfil` como título de diálogo modal.

---

## 7. Campo y labels de sección

`getAccessModuleLabel` debe incluir `operations` → `Operaciones` y `wfm` → `Operaciones de campo`. Cualquier otra clave cae a `Sección`, nunca al `moduleKey`.

En el peek de creación (momento detalle), si falta `description` del permiso se muestra `Acceso no descrito`, nunca la clave.

---

## 8. Crear y previsualizar (flujo único de peek)

Un solo `PortalSidePeek` de **dos momentos** sustituye: el diálogo modal de dos caminos, el peek de preview por card y los CTAs de cada card.

```text
Crear perfil
    → peek, momento lista (9 sugeridos + Empezar desde cero)
        → fila sugerida / Ver lo que permite
            → peek, momento detalle (accesos agrupados, solo lectura)
                → Usar este perfil → peek cierra; borrador en página; foco en el nombre
                → Volver a la lista → momento lista; sin borrador
        → Empezar desde cero → salta el detalle; peek cierra; borrador vacío en página; foco en el nombre
        → Escape / Cerrar / velo → peek cierra; sin borrador
```

Reglas:

- Un peek abierto a la vez. No hay segundo overlay. No hay `Dialog` de creación.
- Escape, Cerrar (`aria-label="Cerrar"` de la primitiva) y clic en el velo = **sin borrador** (igual que cancelar el diálogo retirado).
- `Empezar desde cero` no muestra el momento detalle.
- Confirmar (`Usar este perfil`) copia accesos al borrador; **no** muta el sugerido; **no** reasigna personas. `POST /profiles` ocurre al guardar en la página. Al guardar, aplica §6.6.
- Ningún CTA del peek promete editar el perfil que ya usan los técnicos ni asignar gente.
- Tras confirmar o desde cero, el foco se mueve al campo **nombre** del borrador en la página.

---

## 9. Dar de baja / eliminar

Solo perfiles **no** de sistema. Acción de fila con nombre accesible `Eliminar perfil {nombre}`.

No hay `window.confirm`. El diálogo de §6.5 es obligatorio.

Las filas del peek de perfiles sugeridos no ofrecen eliminar ni editar.

---

## 10. Contrato visual (AI-DS-OWNER — sin tokens nuevos)

Se usa la **misma barra** que Organización. Prohibido crear tokens o primitivas globales.

- CTA de sección: `Button size="lg"`.
- Reintentos: `Button variant="link"` + `min-h-11`.
- Acciones de fila: `Button size="sm"` + `min-h-11`. Sin override `h-8`.
- Selecciones (MFA, accesos, mantener activo): `CheckboxCard` con superficie global `iwana-surface-soft` en claro (`bg-iwana-surface-soft/60`, hover `bg-iwana-surface-soft`, borde `gray-200`), dark intacto (`dark:bg-dark-surface-3/60`, `dark:hover:bg-dark-surface-3`, `dark:border-dark-border`); veredicto AI-DS-OWNER (v1.8).
- Encabezados de tabla: `PortalDataTableHead` + class-tokens de `portal-ui.tsx`. Sin pager (cardinalidad de settings).
- Tabs de sección: `portalModuleTabsTrackClassName` + `portalModuleTabTriggerClassName` (activo = `bg-iwana-primary text-white`). Lima no marca la sección actual.
- Peek: consumo exclusivo de `PortalSidePeek` (§10.1). `shadow-iwana-soft`. Prohibido `z-10000`, `shadow-2xl` y glass en cabecera del panel.
- Superficies: `PortalPanel` con borde `border-gray-200`. Prohibido `border-iwana-secondary` como marco de panel o card.
- Fila en edición: barra lima izquierda + píldora `En edición` (`bg-iwana-secondary-50` + `text-iwana-secondary-700`) — acento válido.
- MFA activa: badge tonal `bg-iwana-secondary-100` + `text-iwana-secondary-900`, no borde lima del panel.
- Footer MFA: apilado en mobile (`flex flex-col items-stretch`, botón `w-full`) y en fila desde `sm` (`sm:flex-row sm:items-center sm:justify-between`, botón `sm:w-auto`). En 390×844 la ayuda queda encima del CTA, sin solape.
- Reposo: `shadow-iwana-soft` / `shadow-iwana-card`. Prohibido `shadow-[var(--shadow-iwana)]` y `shadow-2xl`.
- Foco: `interactiveFocusClassName` en controles custom (filas del peek de creación, Cerrar).
- Objetivos táctiles: ≥44 px (`min-h-11` o `size="lg"`).
- Densidad: ritmo de página `space-y-4`. `PortalPanel compact` en MFA y paneles vacíos. Workspace con tabla/editor puede quedar `p-5`.
- Empty de perfiles: `PortalEmptyState embedded` (sin card-dentro-de-card). Accesos sin selección: sin empty ilustrado. Empty de búsqueda y de “sin accesos compatibles”: también `embedded`.
- Loading, sesión no disponible y acceso restringido usan el mismo ritmo `space-y-4` que la vista cargada.
- Toolbar de acciones en card móvil: `PortalActionToolbar compact` sin override `bg-gray-50`. El pozo es el del primitive (`iwana-surface-soft`).
- **Sin galería de cards sugeridas en la página.** El contrato v1.3–v1.8 de grid `md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, CTAs apilados por card y superficie suave del preview de card queda **superado**: esas superficies no existen. El catálogo se compone en el peek (§10.1).
- Banner §6.6: `PortalAlert variant="success"` existente; el CTA `Ir a Usuarios` es `Button size="lg"` + `min-h-11`. Sin variante nueva de alerta.
- Ayuda §6.7: texto `text-xs` / ayuda de sección existente (mismo ritmo que «Accesos finales»); el enlace usa el foco `interactiveFocusClassName` o el de `Button variant="link"`. Sin primitiva nueva.

`Crear perfil` de listado con datos usa `PortalPanel.actions`. El empty no duplica el CTA del header de página. `primary size="lg"` queda reservado a `Crear perfil` (panel o empty), `Usar este perfil` (footer del peek) e `Ir a Usuarios` (§6.6).

### 10.1 Consumo de `PortalSidePeek` (peek de creación)

**Veredicto AI-DS-OWNER (2026-08-29): GO CON CONDICIONES.** Carril rápido: sí. Catálogo de creación: un solo `PortalSidePeek` (`apps/portal/src/components/shared/portal-ui.tsx`) hospeda la lista compacta de 9 sugeridos + «Empezar desde cero» y, con el mismo `open`, el detalle de accesos en solo lectura. Se componen con `eyebrow` / `title` / `description` / `children` / `footer` vigentes; sin prop nueva, sin Drawer, sin token. El cuerpo (`children`) es el único scroll; el `footer` permanece `shrink-0`. Al pasar lista↔detalle el consumidor mueve el foco al primer control del nuevo momento (la trampa se arma solo al abrir). Overlay: `z-(--z-drawer)` y panel `shadow-iwana-soft`. Prohibido `z-10000`, `shadow-2xl`, glass en cabecera y galería de 9 cards dentro del peek. CTA de confirmación: `Button primary size="lg"` en `footer`.

**Primitiva única.** Solo `PortalSidePeek` existente. Props de contrato: `title`, `description`, `eyebrow`, `children`, `footer` (y `open` / `onClose`). Sin Drawer, sin sheet nuevo, sin tokens, sin variante global de `@iwana/ui`. El slot `description` es un `<p>`: una línea o omitido.

| Slot | Momento lista | Momento detalle |
| --- | --- | --- |
| `eyebrow` | omitido (estable entre momentos) | omitido |
| `title` | `Perfiles sugeridos` | Nombre humano del sugerido |
| `description` | omitido | `{tipo de usuario} · {n} accesos` |
| `children` | Intro §6.8 (ayuda `text-xs`) + 9 filas en shell de tabla + fila `Empezar desde cero` en shell gemelo (`iwana-surface-soft`) | Heading `Lo que permite este perfil` + accesos agrupados **solo lectura** (sin `CheckboxCard` de edición) |
| `footer` | omitido (Cerrar vive en el header de la primitiva) | `Usar este perfil` (`Button variant="primary" size="lg"` + `min-h-11`) y `Volver a la lista` (ghost/secundario, `min-h-11`) |

Composición de filas (contrato UX; DS-OWNER confirma clases): cada fila sugerida es un control de bloque completo, `min-h-11`, foco `interactiveFocusClassName`. Una acción visible por fila (`Ver lo que permite`) en reposo como meta (`text-gray-500` / `dark:text-gray-400`); lima AA solo en hover/foco de la fila (`group-hover:text-iwana-secondary-700` / `dark:group-hover:text-iwana-secondary-300`). El lima de avance del flujo es `Usar este perfil` (footer del detalle). No dos CTAs `primary`+`ghost` como en las cards retiradas. Las 9 filas viven en **un** shell de tabla (`portalDataTableShellClassName` + `overflow-hidden shadow-iwana-card`), con `portalDataTableBodyClassName` y celdas `px-4`. Prohibido 9 cards `rounded-2xl` sueltas o grid de 4 columnas. Intro en `children` con peso de ayuda (`text-xs leading-5 text-gray-500`), no clona el `text-sm leading-6` del slot `description`. `Empezar desde cero` **fuera** del `divide-y` del catálogo, en un shell **gemelo** (mismo `rounded-2xl`, `border-gray-200`, `shadow-iwana-card`) con relleno `iwana-surface-soft` e icono lima AA. Momento detalle: heading `.portal-eyebrow`; grupos con `.portal-eyebrow-muted` y `divide-gray-100`.

Un peek a la vez. Overlay de la primitiva: velo cierra (`onClose`) sin borrador. Prohibido `z-10000`, `shadow-2xl` y glass en la cabecera del panel; la primitiva ya aplica `shadow-iwana-soft` y `z-(--z-drawer)`. En 390×844 el peek permanece usable: lista con scroll interno (`children` ya es `overflow-y-auto`); footer del detalle no solapa las acciones; targets ≥44 px.

---

## 11. Accesibilidad (WCAG 2.2 AA)

1. Contraste AA en claro y oscuro. Si identidad y contraste chocan, prevalece contraste.
2. Foco visible en reintento, filas del peek de creación, Cerrar, tabs, acciones de fila, `Ir a Usuarios` y el enlace de §6.7.
3. Teclado: crear (abre peek), recorrer filas, ver detalle, confirmar, desde cero, guardar, eliminar, reintentar, ir a Usuarios. Escape cierra el peek sin borrador.
4. `PortalSidePeek` atrapa el foco y lo restaura al **abrir**. Al pasar lista↔detalle **sin** cerrar `open`, el consumidor mueve el foco al primer control del nuevo `children` (condición DS-OWNER). Un peek a la vez.
5. Nombre accesible de acciones de fila incluye el nombre del perfil, sin IDs internos.
6. Empty post-corte, empty sin sugeridos y empty de búsqueda se distinguen por copy y por acción.
7. El banner §6.6 se anuncia con `live="polite"` (`role="status"` de `PortalAlert`).

Viewports de verificación: 390×844, 1024×768, 1440×900, claro y oscuro.

---

## 12. Fuera de alcance

- API, OpenAPI, PostgreSQL, migraciones, tenancy, matriz de permisos, seeds backend o endpoints nuevos.
- Edición in-place de perfiles sugeridos y copy-on-write con reasignación masiva.
- Navegación global.
- Tokens, `Switch`, cambios globales de `@iwana/ui` o `PortalDataTableShell`.

---

## 13. Criterios de aceptación (UX/DS)

Los CA-ACC-UX-01…11, 13, 17, 19 y 20 siguen vigentes (17 reescrito). CA-ACC-UX-03 aplica a **ambos** vacíos de §5 (un solo `Crear perfil` en el empty). CA-ACC-UX-08 se **extiende** al peek de creación. CA-ACC-UX-12 y CA-ACC-UX-14 se **reescriben**. CA-ACC-UX-15, 16 y 18 quedan **Superados** (layout de cards en página): no exigirlos a FE ni a QA.

| ID | Criterio |
| --- | --- |
| CA-ACC-UX-01 | El h1 es `Perfiles de acceso` y no hay `Crear perfil` en el PageHeader. |
| CA-ACC-UX-02 | Con listado, `Crear perfil` está en el panel Perfiles personalizados. |
| CA-ACC-UX-03 | Vacío editable muestra un solo `Crear perfil` (empty). |
| CA-ACC-UX-04 | No aparece `Plantillas iniciales`, `Usar como base` ni `Categoría base` en esta ruta. |
| CA-ACC-UX-05 | La pestaña `operations` se lee `Operaciones`; nunca la clave cruda. |
| CA-ACC-UX-06 | Un 500/403 de API no pinta el mensaje interno. |
| CA-ACC-UX-07 | Eliminar abre diálogo; el API no se llama al pulsar el icono. |
| CA-ACC-UX-08 | El peek de creación usa `PortalSidePeek` (`role="dialog"`, trampa de foco, restauración al cerrar). Un peek a la vez. |
| CA-ACC-UX-09 | MFA, accesos y «mantener activo» usan `CheckboxCard`. |
| CA-ACC-UX-10 | Controles interactivos alcanzan al menos 44 px. |
| CA-ACC-UX-11 | Claro y oscuro cumplen WCAG AA. |
| CA-ACC-UX-12 | La política MFA queda debajo del workspace de perfiles personalizados (ya no «debajo de sugeridos en página»). |
| CA-ACC-UX-13 | Vacío de perfiles sin pozo anidado; un solo `Crear perfil`; el panel no duplica su description. |
| CA-ACC-UX-14 | Con 0 perfiles personalizados, el empty post-corte (o el listado si aplica el vacío sin sugeridos) **y** el CTA `Crear perfil` son visibles sin scroll en desktop 1440×900. El heading `Perfiles sugeridos` **no** vive en la página. |
| CA-ACC-UX-15 | **Superado (v1.10).** Layout de cards en página (intersección título/CTA). No exigir a FE/QA. |
| CA-ACC-UX-16 | **Superado (v1.10).** Layout de cards en página (CTA apilado en grid xl). No exigir a FE/QA. |
| CA-ACC-UX-17 | Empties internos de Accesos van `embedded`; las filas del peek no repiten el eyebrow `Sugerido` (el `title` del peek ya es `Perfiles sugeridos`); la toolbar móvil no usa pozo `bg-gray-50`. |
| CA-ACC-UX-18 | **Superado (v1.10).** Layout de cards en página (card única en grilla). No exigir a FE/QA. |
| CA-ACC-UX-19 | El editor muestra `Revisa lo que «{perfil}» puede/podrá ver o hacer en cada sección.` según sea perfil guardado o borrador. |
| CA-ACC-UX-20 | En 390×844 la ayuda MFA queda encima del CTA, sin solape, y `Guardar política` ocupa el ancho disponible; desde `sm` vuelven a fila. |
| CA-ACC-UX-21 | `Crear perfil` (empty o `PortalPanel.actions`) abre el peek de creación en momento lista. No hay diálogo modal `Crear nuevo perfil`. |
| CA-ACC-UX-22 | El momento lista muestra exactamente 9 filas de sugeridos cuando el backend expone 9 perfiles system, en el orden canónico de `UserRole` de la spec Fase 3 §3.3 (verificable por nombre). |
| CA-ACC-UX-23 | El momento lista incluye una fila `Empezar desde cero` además de las 9. |
| CA-ACC-UX-24 | El momento detalle muestra los accesos del sugerido agrupados por sección, **solo lectura** (sin checkboxes de edición ni `Editar accesos`). |
| CA-ACC-UX-25 | `Usar este perfil` cierra el peek, deja el borrador en la página (nombre, tipo de usuario, accesos copiados) y mueve el foco al campo nombre. No llama a `POST /profiles` en ese gesto. |
| CA-ACC-UX-26 | Escape, Cerrar o clic en el velo cierran el peek **sin** crear borrador. La página queda como antes de abrir el peek. |
| CA-ACC-UX-27 | `Empezar desde cero` salta el momento detalle: cierra el peek y deja un borrador vacío en la página, con foco en el nombre. |
| CA-ACC-UX-28 | El peek es operable por teclado: Tab recorre filas y CTAs; Enter en una fila sugerida abre el detalle; Escape cierra sin borrador (en lista o detalle). |
| CA-ACC-UX-29 | En 390×844 el peek es usable: lista con scroll interno, filas ≥44 px, footer del detalle sin solape, `Volver a la lista` y `Usar este perfil` alcanzables. |
| CA-ACC-UX-30 | Las filas sugeridas del peek no renderizan `Editar`, `Editar accesos` ni eliminar. |
| CA-ACC-UX-31 | Tras el `title` del peek, el intro es ayuda compacta (`text-xs`, no más de dos frases) y no iguala el peso tipográfico de los nueve nombres. Los cuatro hechos de POST-02 siguen presentes entre subtítulo + empty + este intro. |
| CA-ACC-UX-32 | Cada fila sugerida muestra `Ver lo que permite` (y el `aria-label` vigente). En reposo ese texto **no** usa lima; el lima aparece en hover/foco de la fila. El avance del flujo de creación es `Usar este perfil` (momento detalle). |
| CA-ACC-UX-33 | `Empezar desde cero` está visualmente separado de las nueve filas y usa el **mismo** radio y borde que el shell del catálogo (`rounded-2xl` + `border-gray-200` + `shadow-iwana-card`), con relleno `iwana-surface-soft`. Sigue siendo una fila clicable además de las 9 (CA-ACC-UX-23). |

### 13.1 Post-corte (v1.9; POST-03 reescrito en v1.10)

| ID | Criterio |
| --- | --- |
| CA-ACC-POST-01 | Con 0 personalizados y ≥1 sugerido, el empty **no** usa `Aún no has creado perfiles personalizados` ni implica que no hay perfiles en uso. Muestra el título y la descripción de vacío post-corte de §6.1, incluida la frase de que **crear no mueve a nadie** y que **debe** ir a Usuarios a reemplazar. |
| CA-ACC-POST-02 | Subtítulo, empty post-corte y descripción del peek de creación (momento lista, §6.8) dicen, entre los tres: que los sugeridos **ya están en uso**, que **no se editan aquí**, que **crear/elegir no mueve a nadie** y que el admin **debe** ir a Usuarios, **quitar el sugerido y dejar solo el nuevo**. Ninguna de esas piezas promete un solo gesto en Access. Barrido: cero apariciones de los prohibidos de §6.3 en esta ruta. |
| CA-ACC-POST-03 | Las filas del peek de perfiles sugeridos **no** renderizan `Editar` ni `Editar accesos` (ni eliminar). Esos CTAs existen solo en perfiles personalizados. |
| CA-ACC-POST-04 | Tras guardar un perfil creado desde un sugerido, aparece el banner §6.6 con título `Perfil creado. Debes asignarlo en Usuarios`, descripción de que **nadie cambió de perfil**, instrucción de dejar marcado **solo** el nuevo (quitar el sugerido), advertencia de unión si quedan ambos, y `Ir a Usuarios` a `/dashboard/users`. No basta un toast genérico de «perfil creado». |
| CA-ACC-POST-05 | Un admin de prueba completa «cambiar un acceso de un técnico que solo tiene el perfil sugerido» (`Crear perfil` → elegir sugerido → `Usar este perfil` → guardar → banner → Usuarios → quitar sugerido y dejar solo el nuevo → guardar) en ≤ 8 acciones conscientes, sin documentación interna. Verificable en walkthrough E2E o checklist de QA. Tras el `POST` de creación y **antes** de guardar en Usuarios, el técnico sigue con el sugerido. |
| CA-ACC-POST-06 | En el peek de edición de Usuarios, con al menos un perfil sugerido seleccionado, se muestra la ayuda §6.7 (no se edita en Access; dejar solo el nuevo; unión si ambos) y el enlace a `/dashboard/settings/access`. El preview de accesos finales sigue mostrando la **unión** si quedan sugerido y personalizado marcados. Sin la selección de un sugerido, la línea no está en el DOM. |

---

## 14. Relación con artefactos vigentes

| Artefacto | Efecto |
| --- | --- |
| ADR-040 | Sin cambio de ownership ni permisos. |
| ADR-083 D4 / PRD-MOD00 §4.3.4 RF-ACC-16 y RF-ACC-17 | El empty y el copy post-corte reflejan asignación automática y prohibición de mutar sugeridos in place. |
| Spec roles de empresa (2026-05-25) | Se conserva: perfiles aquí, asignación en Usuarios. |
| Spec copy Access (2026-05-27) | Esta spec **congela** su mapa de renombres para la ruta, con el ajuste post-corte de §6.1 / §6.6 / §6.7. |
| Spec Fase 3 nav-gates v1.2 | 9 entradas, orden y nombres humanos **en el peek**. El empty/IA post-corte **no** lo redefine: lo gobierna esta v1.10. |
| Remediación Organización (2026-08-15) | Barra visual hermana: CTA en panel, 44 px, `CheckboxCard`, `PortalDataTableHead`, errores sanitizados, diálogo destructivo. |
| Firma iWana | Lima = avance/selección, no marco ni tab de posición. |

No se requiere PRD, HLD ni ADR nuevos. Copy-on-write (evolución futura de RF-ACC-17, **no** la opción B de catálogo en peek) queda registrada si CA-ACC-POST-05 no se cumple en operación.

---

## 15. Desbloqueo de tracks

Esta spec v1.13 queda **congelada** el 2026-08-29 por AI-PROD-UX (shells de tabla en el peek: mismo radio/borde/sombra dual). Re-sync §3bis: v1.10 flujo; v1.11 intro + desde cero; v1.12 lima de preview; v1.13 profundidad y bordes. Historial: v1.10 congeló peek de dos momentos y galería fuera de página; v1.9 congeló empty, subtítulo, banner y ayuda in Users (CA-ACC-POST-01…06); v1.1–v1.8 gobernaron densidad y cards — esas reglas de card quedan superadas aquí.

- AI-DS-OWNER: veredicto **GO CON CONDICIONES** estampado en §10.1 (2026-08-29). Sin tokens ni primitiva nueva.
- AI-FE-PLATFORM implementa contra §3.1, §4–§11 (copy `ACCESS_SETTINGS_COPY` alineado a §6.8, sin grid de sugeridos, peek de dos momentos, workspace de borrador en página, banner §6.6, ayuda §6.7). **GO de implementación.** No implementar con v1.9.
- AI-SR-QA escribe RED y E2E contra copy literal §6.8, CA-ACC-UX-01…14 / 17 / 19 / 20 / 21…33 (no 15, 16, 18) y CA-ACC-POST-01…06. Regenerar los 6 snapshots de access contra el **primer viewport sin grid**. Re-verificar CA-ACC-UX-20: MFA sube de viewport al desaparecer el grid.
- Un cambio posterior se versiona (v1.11+) y se notifica; no se parchea solo en código.
