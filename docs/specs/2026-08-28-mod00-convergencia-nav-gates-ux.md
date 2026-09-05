# Spec UX — MOD00 Convergencia RBAC: navegación por permisos, gates de página, Access y Users

**Version:** 1.2
**Estado:** Aprobado para ejecucion (congelado por AI-EM-ARCH el 2026-08-28; v1.1 nota de prevalencia empty/IA post-corte el 2026-08-29; v1.2 catálogo de 9 en peek; puntero Access **v1.11** el 2026-08-29)
**Fecha:** 2026-08-29
**Autor:** AI-PROD-UX
**Implementa para:** AI-FE-PLATFORM (Fase 3 del plan) · Verifica AI-SR-QA (Fase 4)
**Contrato AI-DS-OWNER:** consumo de tokens y primitivas existentes; sin tokens ni primitivas nuevas. Peek de creación: veredicto aparte sobre `PortalSidePeek` (spec prevalente §10.1).

**v1.2.** El empty y la IA post-corte de `/dashboard/settings/access` los gobierna la spec prevalente **v1.13**. Esta spec **ya no exige** 9 cards en la ruta. Las 9 entradas, el orden canónico `UserRole` y los nombres humanos viven en el `PortalSidePeek` de creación. CA-ACV2-01 y CA-ACV2-04 se reescriben contra el peek. Snapshots contra el primer viewport **sin** grid.

**v1.1.** Nota de prevalencia empty/IA post-corte (entonces v1.9). Superada en lo que exigía galería en página.

---

## Referencias normativas

| Fuente | Uso en esta spec |
| --- | --- |
| `docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md` (Aprobado) | D3 (matriz V2), D4 (plantillas estándar y corte), D6 (frontend derivado de permisos efectivos) |
| `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` §6.6 (addendum) y §6.6.1 (firmas G1) | Condiciones G1 AI-PROD-UX 1–6; contexto `usePermissions()` en layout; cache `access:perms:{tenantId}:{userId}` TTL ≤ 60 s |
| `docs/plans/2026-08-28-mod00-convergencia-rbac-granular.md` §1–§3 | Contratos congelados; mapeo menú → permiso (congelado); alcance de Fase 3 |
| `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` (v1.13, **prevalente** para `/dashboard/settings/access`) | Vocabulario de la ruta access, CA-ACC-UX (14 sustituido; 15/16/18 superados; 21…33 peek), CA-ACC-POST-01…06, contrato visual §10.1 (`PortalSidePeek`), matriz de estados §5 (empty/IA post-corte + peek de creación). Esta spec de Fase 3 **no** redefine ese empty. |
| `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` | Dirección visual iWana (lima = avance/selección, foco, sombras) |
| UI real: `apps/portal/src/components/layout/Sidebar.tsx`, `settings/SettingsSectionGrid.tsx`, `settings/SettingsClient.tsx`, `settings/AccessControlSettingsClient.tsx`, `access-control/EffectivePermissionsPanel.tsx`, `users/EditUserModal.tsx`, `users/CreateUserModal.tsx`, `users/CompanyRolesAssignmentSection.tsx`, `users/company-role-preview.ts`, `lib/system-vocabulary.ts`, `app/dashboard/layout.tsx`, `components/shared/portal-ui.tsx` | Estado de partida verificado el 2026-08-28 |
| E2E: `e2e/tests/portal-settings-access-ui.spec.ts` + 6 snapshots en `portal-settings-access-ui.spec.ts-snapshots/` | Regeneración de capturas contra el **primer viewport sin grid**; CA-ACC-UX-14 (empty + CTA) y CA-ACC-UX-20 |

**Qué es este documento.** Contrato UX de Fase 3 de la convergencia RBAC: gramática de navegación por permisos efectivos, gates de página con 3 estados, **9 entradas de perfiles sugeridos en el peek de creación** de `/dashboard/settings/access` (orden y nombres humanos; **sin** galería en la ruta), montaje del panel de accesos efectivos en el side peek de edición de usuarios y advertencia por cambio de tipo de usuario. Congela modelo de interacción, copy, estados y criterios de aceptación para desbloquear AI-FE-PLATFORM y AI-SR-QA. El empty, el workspace de borrador y el flujo de dos momentos del peek los gobierna la prevalente v1.10.

**Qué no es.** No define backend, contratos de API nuevos, tokens, ni componentes globales de `@iwana/ui`. No escribe código. No cambia alcance funcional. No contiene PII: los ejemplos de perfiles y usuarios son ilustrativos.

---

## 1. Navegación (Sidebar) por permisos efectivos

### 1.1 Decisión de gramática (condición G1-2): ocultar lo no efectivo (MVP)

**Decisión única: ocultar.** Un item del Sidebar se muestra solo si el usuario tiene **efectivo** el permiso de lectura mapeado (§1.2). Los items sin permiso efectivo no se renderizan (ni visibles, ni disabled, ni con candado).

Justificación contra la alternativa de 3 bandas (ocultar / disabled-candado / enlazar con `compatibilityMatrix`):

1. **Carga cognitiva:** el operador ve solo lo que puede usar; la banda de candado añade ruido permanente para una acción (solicitar acceso) que hoy no tiene flujo propio.
2. **Semántica engañosa:** `compatibilityMatrix` define qué es *asignable* por categoría base, no qué le falta a este usuario; un candado sobre esa base comunica una promesa que el admin podría no conceder.
3. **Costo:** la banda de candados exigiría el catálogo completo en el layout (request extra en la ruta crítica de render) y una gramática collapsed (solo icono + candado) que no existe en el Sidebar.
4. **Cobertura equivalente:** el "enlazar" de la banda 3 se satisface con los gates de página (§2): un deep-link a sección oculta produce una pantalla de acceso restringido que **explica** el motivo y ofrece salidas. Nadie queda sin explicación.
5. **Patrón vigente:** ADR-083 D6 manda seguir el patrón `requiredPermissions` del hub de Configuración; ocultar es la extensión natural del comportamiento actual del hub para la navegación global.

La gramática de 3 bandas queda **registrada como evolución futura** (requeriría nueva spec + re-G1 + flujo de solicitud de accesos); no se implementa en este ciclo.

### 1.2 Mapeo item → permiso (congelado, plan §2)

Semántica de visibilidad por item: **(techo estático) AND (permisos efectivos)**.

- **Techo estático:** los `allowedRoles` que hoy existen en `Sidebar.tsx` se conservan como filtro adicional durante la transición (espejo del techo estructural `@Roles`, ADR-083 D2). Un permiso efectivo jamás muestra un item cuyo techo de rol no lo contempla.
- **Permisos efectivos:** set devuelto por `GET /access-control/me/effective-permissions` (`effectivePermissions`).

| Item del Sidebar | Permisos efectivos requeridos | Techo estático actual (`allowedRoles`) | Semántica |
| --- | --- | --- | --- |
| Inicio (`/dashboard`) | (sin gate) | — | Siempre visible |
| Oportunidades (`/dashboard/crm/expedientes`) | `crm.expedientes.read` | — | Ocultar sin permiso |
| Suscriptores (`/dashboard/crm/subscribers`) | `crm.subscribers.read` | — | Ocultar sin permiso |
| Programación (`/dashboard/scheduling`) | `wfm.schedule.read` | — | Ocultar sin permiso |
| Mesa de ayuda (`/dashboard/assurance`) | `assurance.tickets.read` | — | Ocultar sin permiso |
| Operaciones (`/dashboard/operations`) | `operations.execution_orders.read` OR `operations.tasks.read` OR `operations.execution_orders.execute` | ADMIN, NOC, SUPPORT, SALES, TECHNICIAN, CONTRACTOR | Visible con ≥1 del OR y techo |
| Inventario (`/dashboard/inventory`) | `inventory.stock.read` | ADMIN, NOC, SUPPORT | Ocultar sin permiso |
| Comercial (`/dashboard/commercial`) | `commercial.catalog.read` | — | Ocultar sin permiso |
| Configuración (`/dashboard/settings`) | `settings.read` | — | Ocultar sin permiso |
| Usuarios (`/dashboard/users`) | `users.read` | — | Ocultar sin permiso |

Notas:

- El mapeo es el contrato congelado del plan §2; un cambio de claves o de agrupaciones reabre §3bis vía orquestador.
- ADMIN no lleva caso especial cliente: su baseline la calcula el backend (`EffectivePermissionsService`) y llega en el mismo response.
- Los grupos «Menú» y «Administración» se conservan; un grupo sin items visibles no renderiza su encabezado.
- `crm.customers.*` (deprecadas) no aparecen en ningún mapeo; prohibido usarlas en frontend.

### 1.3 Ubicación del contexto `usePermissions()`

- Contexto compartido alojado en **`apps/portal/src/app/dashboard/layout.tsx`** (no dentro de `Sidebar`), tal como fija HLD §6.6. El `Sidebar` y los gates de página (§2) consumen el mismo contexto; una sola llamada a `GET /access-control/me/effective-permissions` por sesión de navegación.
- El fetch arranca solo con sesión resuelta (después del guard de auth del layout); convive con la carga de branding sin bloquearla.
- Ciclo de vida del dato: fetch al montar con sesión · **reintento silencioso** ante fallo (2 reintentos con backoff 5 s / 15 s) · **refetch en `visibilitychange` → visible** solo si el último fetch exitoso tiene > 60 s (alineado al TTL del cache Redis del backend, HLD §6.6). No hay refetch por navegación.
- Prohibido ampliar permisos desde la presentación (HLD-DE-06): el contexto es lectura pura, sin uniones client-side que agreguen acceso.

### 1.4 Estados de carga: skeleton con forma, sin flash de items

- Los items **sin gate** (Inicio) se renderizan de inmediato.
- Mientras el contexto está en `loading`, cada **slot gateado** del array estático (9 items gateados del mapeo) renderiza un **skeleton con la forma del item**: fila `min-h-11 rounded-lg` con bloque de brillo del tamaño de icono (20 px) + etiqueta, usando el patrón `animate-pulse` gris existente (`gray-100` / `dark:bg-dark-surface-3`). El número de skeletons es estable (deriva del array estático), por lo que la altura del menú no salta.
- Al resolver: los slots se convierten en items reales (con permiso) o desaparecen (sin permiso). **Un item interactivo real jamás aparece y luego se oculta** (definición de "sin flash"). El skeleton que se resuelve a oculto es comportamiento esperado de placeholder, no flash.
- Accesibilidad del loading: `role="status"` + `aria-live="polite"` sr-only con etiqueta `Cargando navegación` (patrón de `SettingsSkeleton`), `aria-busy="true"` en el contenedor del menú.

### 1.5 Estados de error: degradación estática + reintento silencioso

- Si el fetch de permisos efectivos falla (red, 5xx), el Sidebar **degrada al comportamiento estático actual**: filtrado solo por `allowedRoles`, exactamente como hoy. **Nunca se bloquea la navegación** ni se muestra error en el Sidebar (sin banners, sin alerts).
- Los reintentos (§1.3) son silenciosos; al tener éxito, el menú conmuta a filtrado por permisos en el próximo render.
- **Tripwire anti-nav vacía:** si el fetch tiene éxito y un usuario **no-ADMIN** resulta con **cero** items gateados visibles, el menú cae a filtrado estático y agenda un reintento. Esto protege el caso "tenant sin corte aplicado" y el caso "categoría sin plantilla asignada" (ver condición dura §5.4). En este ciclo no se pinta ningún aviso al usuario por este motivo.
- El estado de error/limitación es observable por QA: el contexto expone `status` (`loading | ready | degraded`) verificable en tests de componente.

### 1.6 Comportamiento collapsed y mobile

- **Desktop colapsado:** los skeletons adoptan la misma forma responsive que los items reales (`lg:justify-center lg:px-2`, bloque circular de 20 px); al resolverse, solo los iconos de items permitidos aparecen. `title` de icono solo en items reales (nunca en skeleton).
- **Drawer mobile:** mismo filtrado y skeletons; el drawer conserva su contrato actual (foco al abrir, Escape para cerrar, `inert` cuando está cerrado). Ningún skeleton es focoable (`aria-hidden` en placeholders).
- El indicador de item activo (barra lima + `aria-current="page"`) funciona igual sobre items permitidos; una ruta activa sin permiso efectivo (caso degradado) sigue mostrándose por la regla de degradación, sin estado intermedio.

---

## 2. Gates de página (3 estados)

### 2.1 Componente

Componente portal-local (nombre de implementación libre para FE, p. ej. `PagePermissionGate`) que envuelve el contenido de una superficie y resuelve **antes de renderizar contenido**:

| Estado | Cuándo | Render |
| --- | --- | --- |
| `checking` | Contexto en `loading` al llegar a la ruta | Skeleton con forma de página (PageHeader fantasma + bloque de contenido, patrón `PortalSkeletonBlock`, ritmo `space-y-4`) |
| `autorizado` | Permiso de lectura efectivo | `children` sin alteración |
| `restringido` | Permiso de lectura ausente, con datos resueltos | Pantalla de acceso restringido (§2.3) |
| `error` | El contexto está en fallo y sin datos para decidir (sin degradación disponible en la página) | PortalAlert `variant="error"` sanitizado + `Reintentar` (§2.4) |

Reglas transversales:

- El gate consume el **mismo** contexto `usePermissions()` del layout; no hace su propio fetch (salvo reintento del propio contexto).
- Gate a nivel de **árbol de rutas**: la ruta padre gatea y las subrutas heredan (§2.2). El gate no depende del ítem del Sidebar (un deep-link sin nav funciona igual).
- Prohibido presentar un 403 como estado vacío (HLD §7 UI rules) y prohibido pintar `error.message` crudo.

### 2.2 Superficies gateadas (6)

| # | Superficie | Rutas gateadas (padre + subrutas) | Permiso |
| --- | --- | --- | --- |
| 1 | Suscriptores | `/dashboard/crm/subscribers`, `/new`, `/[id]` | `crm.subscribers.read` |
| 2 | Oportunidades | `/dashboard/crm/expedientes`, `/[id]` | `crm.expedientes.read` |
| 3 | Mesa de ayuda | `/dashboard/assurance` | `assurance.tickets.read` |
| 4 | Inventario | `/dashboard/inventory` | `inventory.stock.read` |
| 5 | Comercial | `/dashboard/commercial` | `commercial.catalog.read` |
| 6 | Programación *(si aplica — ver §8 hallazgo 1)* | `/dashboard/scheduling`, `/agenda`, `/pending-visits`, `/unrealized-visits` | `wfm.schedule.read` |

Notas de alcance:

- **Compras** (HLD §6.6): en la UI real no existe página de Compras; es la pestaña `purchasing` dentro de `/dashboard/inventory` (`inventory-nav.ts`). La page-gate de Inventario usa `inventory.stock.read`; la **pestaña Compras** se muestra solo con `inventory.purchasing.read` efectivo (gate de pestaña, mismo mecanismo, no cuenta como séptima página). Así se honra el cableado del HLD sin inventar rutas.
- `/dashboard/subscribers` es redirect a `/dashboard/crm/subscribers`: hereda el gate tras el redirect.
- `/dashboard/operations` **no** lleva page-gate en este ciclo (no está en las 6 superficies); su visibilidad queda gobernada por la nav (§1.2) y su contenido por el backend vigente (`@Roles`). Gap transitorio aceptado por el plan (endpoints de operations sin cablear).
- Detalle: las acciones de escritura dentro de una superficie autorizada siguen su lógica actual; el gate solo decide lectura de la página.

### 2.3 Estado restringido: explicación + salida

Copy congelado (sentence case, vocabulario aprobado; sin "permiso", "rol", "RBAC" ni claves crudas):

| Pieza | Copy |
| --- | --- |
| Badge | `Acceso restringido` (patrón visual del hub: `Badge variant="warning"` + `Lock`, tokens ámbar existentes) |
| Título | `No tienes acceso a esta sección` |
| Descripción | `Tu tipo de usuario y sus perfiles asignados no incluyen el acceso necesario para usar esta sección.` |
| Acción primaria | `Volver a inicio` (enlace a `/dashboard`, `Button size="lg"`) |
| Acción secundaria (condicional) | `Ver usuarios y accesos` → `/dashboard/users`, **solo** si `users.read` es efectivo; oculta en caso contrario |

- El estado restringido **no redirige**: la URL se conserva (deep-link compartible, recargable), lo que permite que el usuario reporte el enlace exacto a su administrador.
- `document.title` de la ruta no cambia; el contenido sensible de la página nunca se monta (ni en DOM oculto).

### 2.4 Estado error

| Pieza | Copy |
| --- | --- |
| Título PortalAlert | `No pudimos verificar tu acceso` |
| Descripción | `Intenta nuevamente en unos segundos. Si el problema continúa, contacta a un administrador.` |
| Acción | `Reintentar` (`Button variant="link" size="lg"` + `min-h-11`, patrón de la spec prevalente §6.4) |

- `Reintentar` dispara el reintento del contexto; al resolver, el gate reevalúa sin recargar la página.
- Mientras el contexto está `degraded` (regla §1.5), el gate **no** muestra error por sí solo: con techo estático que permite la ruta, autoriza (continuidad); sin techo, muestra restringido. El error explícito queda para el caso sin datos y sin techo aplicable.

### 2.5 Deep-link

- Deep-link con permiso → contenido normal.
- Deep-link sin permiso → estado restringido en la propia URL (§2.3).
- Deep-link a ruta inexistente → 404 existente, sin cambios.
- Compartir enlace entre usuarios con distinto acceso es seguro: quien no tiene permiso ve la explicación, no el contenido.

---

## 3. Access — 9 sugeridos en el peek de creación

### 3.1 Modelo

`/dashboard/settings/access` mantiene la arquitectura de bandas de la spec prevalente **v1.10** (§4): encabezado → alertas → workspace personalizados|accesos → MFA. **No hay sección de 9 cards en la ruta.** El catálogo de perfiles sugeridos (uno por tipo de usuario, incluidos SALES, ACCOUNTANT y HR de Fase 1) vive **solo** en el `PortalSidePeek` de creación: 9 entradas + orden + nombres humanos. El empty, el subtítulo y el copy post-corte los gobierna la prevalente v1.10 (§3.1, §5, §6.1, §6.8); no se redefinen aquí.

### 3.2 Extensión de `SYSTEM_TEMPLATE_PROFILE_NAMES` (`apps/portal/src/lib/system-vocabulary.ts`)

Se agregan las 3 entradas faltantes con los nombres humanos del vocabulario vigente (`SYSTEM_BASE_ROLE_LABELS`):

| Clave | Valor de display |
| --- | --- |
| `UserRole.SALES` | `Ventas` |
| `UserRole.ACCOUNTANT` | `Contabilidad` |
| `UserRole.HR` | `Talento humano` |

- `getAccessProfileDisplayName` no cambia de lógica: para `isSystem = true` resuelve por `baseRoleConstraint` contra el mapa extendido y cae a `profile.name` si no hay entrada (fallback intacto).
- Los nombres DB de las plantillas pueden diferir; el display UI lo gobierna este mapa (patrón actual de las 6 existentes). En copy visible nunca se dice «plantilla» ni «sistema».

### 3.3 Orden congelado por tipo de usuario

Las **9 entradas del peek** (momento lista) se ordenan por el **orden canónico de `UserRole`** (excluyendo SUBSCRIBER/PARTNER/INVESTOR, que no tienen perfil sugerido). Orden exacto:

1. Administrador (ADMIN)
2. Monitoreo operativo (NOC)
3. Soporte inicial (SUPPORT)
4. Ventas (SALES)
5. Técnico de campo (TECHNICIAN)
6. Contabilidad (ACCOUNTANT)
7. Talento humano (HR)
8. Contratista (CONTRACTOR)
9. Auditor (AUDITOR)

Se implementa como lista de orden fija en el cliente (no orden alfabético ni orden de API): estable ante reordenes del backend y localización. Tras las 9, la fila `Empezar desde cero` (prevalente §6.8 / CA-ACC-UX-23). **No hay grid de cards en la página.**

### 3.4 Copy de las 3 entradas nuevas

- Título de fila: el display de §3.2.
- Descripción (momento detalle, si el seed la expone): la que Fase 1 siembre en el backend (`profile.description`). **Restricción de vocabulario:** las descripciones visibles no contienen los prohibidos de la spec prevalente §6.3 (`plantilla`, `sistema`, `categoría base`, `módulo`, `matriz`, claves crudas) ni «en fase futura». QA verifica contra este gate (CA-ACV2-06).
- Meta de fila: `{tipo de usuario} · {n} accesos` (prevalente §6.8).
- CTAs: los del peek de dos momentos (prevalente §6.8 / §8). **Sin** `Editar` ni `Editar accesos` en filas sugeridas (prevalente CA-ACC-POST-03 / CA-ACC-UX-30). No hay CTAs de card en la página.

### 3.5 Estados

La matriz de empty/IA post-corte y del peek de creación la gobierna la spec prevalente v1.10 §5. Esta spec no la redefine. Conservado aquí: carga → skeleton `Cargando perfiles de acceso y sus accesos`; si `systemTemplates.length === 0`, el peek lista solo `Empezar desde cero` (sin las 9 filas); errores de API sanitizados por §6.4 de la spec prevalente.

### 3.6 Regeneración de E2E y verificación de CA-ACC-UX-14/20

- Los **6 snapshots** `access-{desktop|tablet|mobile}-{light|dark}.png` de `e2e/tests/portal-settings-access-ui.spec.ts-snapshots/` se **regeneran** contra el **primer viewport sin grid** (empty o workspace + MFA; sin banda de 9 cards).
- Actualización de mocks del spec E2E: +3 perfiles system (SALES, ACCOUNTANT, HR) con `baseRoleConstraint` correspondiente; `catalogVersion: 'MOD00_ACCESS_V2'`; el test que esperaba 9 cards en página pasa a: abrir `Crear perfil` → **9 filas** en el peek (CA-ACV2-01).
- **CA-ACC-UX-14** (prevalente v1.10): empty post-corte + CTA `Crear perfil` visibles sin scroll en 1440×900 con 0 personalizados. El heading `Perfiles sugeridos` se verifica **dentro del peek**, no en la página.
- **CA-ACC-UX-20** (pie MFA en 390×844): se re-verifica; la sección MFA queda debajo del workspace (prevalente §4) y sube de viewport al desaparecer el grid.
- Axe `wcag2a+wcag2aa`: 0 violaciones en los 6 combos (condición de Fase 3 del plan).

---

## 4. Users — panel de accesos efectivos en el side peek de edición

### 4.1 Montaje del panel

- En `EditUserModal` (side peek de edición, `PortalSidePeek`) se monta el panel de **accesos efectivos guardados** del usuario editado, debajo de la sección «Acceso» (estado + tipo de usuario + perfiles), **colapsado por defecto** con el patrón `details`/`summary` ya usado por «Datos de perfil» (progressive disclosure).
- Fuente de datos: `GET /access-control/users/{userId}/effective-permissions` (`accessControlApi.getEffectivePermissions`, **contrato existente**; sin cambio de backend, condición G1-5). Se pide al abrir el peek y se refresca tras un guardado exitoso.
- El componente `EffectivePermissionsPanel` (hoy sin montaje en el portal) se adapta como base visual: banda de categoría base (`recoveryPermissions` → «Accesos incluidos en la categoría base»), lista de accesos efectivos como pills con label del catálogo, y desglose por fuente (`profileSources`).

### 4.2 Distinción de origen por cross-reference `isSystem`

- Cada entrada de `profileSources` se clasifica cruzando `profileId` contra `availableProfiles` (prop que el peek ya recibe):
  - `isSystem = true` → etiqueta `Perfil sugerido`.
  - `isSystem = false` → etiqueta `Perfil personalizado`.
  - **Fallback (fuente desaparecida):** si el `profileId` no existe en `availableProfiles` (perfil eliminado, inactivo o filtrado), la etiqueta cae a `Perfil de acceso` y el nombre mostrado es `profileName` del summary. Nunca se muestra el id interno ni un hueco vacío.
- El fallback aplica también si `availableProfiles` aún no cargó: el panel muestra la etiqueta genérica y no bloquea.
- Vocabulario del panel: la ruta `/dashboard/users` **conserva «categoría base»** (la prohibición de ese término es exclusiva de la ruta access, spec prevalente §2.2/§6). El eyebrow de la banda sigue siendo `Categoría base`.
- Ayuda post-corte junto a la lista de perfiles: copy y visibilidad los gobierna la spec prevalente v1.10 §6.7 (CA-ACC-POST-06). Esta spec no los redefine.

### 4.3 Frescura del dato

- El panel refleja el estado **guardado**; la selección de perfiles del formulario muestra su proyección en la línea «Accesos finales» existente (`buildCompanyRolePreview`). Para evitar confusión, el panel lleva una nota fija bajo su título:

| Pieza | Copy |
| --- | --- |
| Título del panel | `Accesos efectivos` (conservado) |
| Nota | `Refleja los accesos guardados. Los cambios de esta edición se aplican al guardar.` |

### 4.4 Estados del panel en el peek

| Estado | Render |
| --- | --- |
| Carga | Skeleton con forma (bloque banda + pills fantasma; existe `h-28 animate-pulse` como base) |
| Sin datos / usuario sin accesos | Empty `Sin resumen disponible` / lista vacía con `Sin accesos adicionales.` por fuente (copy actual del panel) |
| Error de carga | Mensaje sanitizado (`No pudimos cargar los accesos efectivos. Intenta nuevamente.`) + `Reintentar`; nunca `error.message` |

### 4.5 Advertencia al cambiar el tipo de usuario (solo edición)

- En `EditUserModal`, cuando el cambio de «Categoría base» (select `role`) provoca que la regla de compatibilidad descarte perfiles seleccionados (el filtro existente desmarca los `baseRoleConstraint` incompatibles), se muestra un **`PortalAlert variant="warning"` con `live="polite"`** (role `status`, `aria-live="polite"` — soportado por la primitiva) dentro de la sección «Acceso».
- **Solo en edición.** `CreateUserModal` no muestra esta alerta (no hay selección previa que descartar; elegir categoría solo filtra opciones disponibles).
- La alerta aparece al producirse el descarte, lista el impacto y desaparece si se revierte el cambio antes de guardar (nuevo cambio que no descarte nada) o al cerrar el peek.

Copy congelado:

| Pieza | Copy |
| --- | --- |
| Título | `Perfiles descartados por el cambio de tipo de usuario` |
| Descripción (n = 1) | `Al cambiar el tipo de usuario, 1 perfil dejó de ser compatible y se desmarcó: {nombre}. Al guardar, quedará sin asignar.` |
| Descripción (n = 2…3) | `Al cambiar el tipo de usuario, {n} perfiles dejaron de ser compatibles y se desmarcaron: {nombre1}, {nombre2} y {nombre3}. Al guardar, quedarán sin asignar.` |
| Descripción (n > 3) | `Al cambiar el tipo de usuario, {n} perfiles dejaron de ser compatibles y se desmarcaron: {nombre1}, {nombre2}, {nombre3} y {restantes} más. Al guardar, quedarán sin asignar.` |
| Nota final | `Usa Cancelar para descartar todos los cambios de esta edición.` |

- `{nombre}` usa `getAccessProfileDisplayName` (mismo fallback de §4.2 si la fuente desapareció).
- Comportamiento subyacente sin cambios: el descarte es inmediato en el formulario; la persistencia ocurre al guardar; volver al tipo anterior **no** re-marca automáticamente los perfiles (deben marcarse de nuevo manualmente) — la alerta y «Cancelar» son los caminos de reversión.

---

## 5. Transversal

### 5.1 Matriz de estados — Navegación

| Estado | Condición | Presentación | Acción |
| --- | --- | --- | --- |
| Carga | Contexto `loading` | Skeletons con forma por slot gateado (§1.4); Inicio visible; `aria-busy` + anuncio sr-only | Ninguna (no interacción sobre placeholders) |
| Resuelto | Contexto `ready` | Items filtrados por techo estático AND permisos | Navegación normal |
| Degradado (error) | Fetch fallido | Filtrado solo estático (comportamiento actual); **sin** indicador visible en nav | Reintento silencioso + refetch en focus > 60 s |
| Tripwire nav vacía | `ready` + no-ADMIN con 0 items gateados | Filtrado estático (§1.5) | Reintento; nunca nav vacía para no-ADMIN |
| Cambio de datos | TTL > 60 s y vuelta a la pestaña | Refetch en `visibilitychange`; swap en próximo render | Transparente |

### 5.2 Matriz de estados — Gates de página

| Estado | Condición | Presentación | Copy / acción |
| --- | --- | --- | --- |
| Checking | Contexto `loading` | Skeleton con forma de página, ritmo `space-y-4` | sr-only `Verificando acceso` |
| Autorizado | Permiso efectivo | Contenido de la página | — |
| Restringido | Sin permiso, datos resueltos | Badge `Acceso restringido` + `Lock` + explicación + salidas (§2.3) | `Volver a inicio` siempre; `Ver usuarios y accesos` solo con `users.read` |
| Error | Sin datos para decidir y sin techo aplicable | `PortalAlert` error sanitizado | `Reintentar` |
| Restrictivo-degradado | Contexto `degraded` | Techo estático permite → autoriza; no permite → restringido | Continuidad operativa |

### 5.3 Accesibilidad — WCAG 2.2 AA con tokens reales (sin tokens nuevos)

1. **Contraste:** texto sobre tokens vigentes (`text-gray-900/600/500`, `dark:text-gray-300/400`, ámbar del patrón restringido del hub `text-amber-900 dark:text-amber-200` sobre `amber-50/80`); verificar AA en claro y oscuro en los nuevos estados (restricted, error, skeletons no portan texto salvo sr-only).
2. **Foco:** todo control nuevo usa `interactiveFocusClassName` (enlaces del nav, `Reintentar`, `Volver a inicio`, summary del panel colapsable). Foco visible en claro y oscuro.
3. **Teclado:** navegación completa por teclado de nav (links nativos), gate (enlaces/botones), panel del peek (details/summary nativo) y alerta (no focoable, anunciada por live region).
4. **Targets ≥ 44 px:** `min-h-11` en items del nav (ya vigente), `Reintentar`, `Volver a inicio`; filas y CTAs del peek de creación conservan `min-h-11` (prevalente CA-ACC-UX-10 / 29).
5. **Live regions:** anuncio sr-only de carga del nav (`aria-live="polite"`); `PortalAlert live="polite"` en la advertencia de descarte de perfiles (§4.5); sin `aria-live` en skeletons decorativos (`aria-hidden`).
6. **Semántica:** `aria-current="page"` intacto; badge restringido con texto (no solo color/icono); el estado restringido usa `h1`-visible propio de la página o encabezado de sección, nunca solo un ícono.
7. **Sin contenido sensible montado:** en estado restringido el contenido de la página no existe en el DOM.

Viewports de verificación: 390×844, 1024×768, 1440×900, claro y oscuro (mismos de la spec prevalente).

### 5.4 Condición dura de despliegue (G1-1, bloqueante)

**Dependencia dura:** el gating de navegación por permisos (§1) **solo se activa en un tenant después de que la migración del corte de Fase 1 (catálogo V2 + plantillas estándar + asignación D4) haya corrido en ese tenant.** Activarlo antes deja la nav vacía para todo no-ADMIN sin perfiles (riesgo G1 registrado en el plan §4).

Mecanismo congelado para esta spec (variante **sin cambio de contrato backend**):

1. **Orden de despliegue:** el release de FE de Fase 3 sale **después** del release de API que incluye las migraciones de Fase 1. La migración corre por cadena de migraciones al primer toque del tenant (plan §4), por lo que todo tenant servido tras el despliegue de API queda cortado antes de renderizar el dashboard.
2. **Tripwire runtime (§1.5):** ante cualquier hueco (tenant dormido alcanzado con migración fallida, categoría sin plantilla, fallo de seed), un no-ADMIN con 0 items gateados cae a nav estática con reintento. La nav vacía para no-ADMIN es **inaceptable** en cualquier estado.
3. **Alternativa registro:** un flag por tenant o la versión de catálogo expuesta al response de permisos serían señales más precisas, pero exigen cambio de contrato backend → queda como opción para el orquestador (ver §8 hallazgo 3); no es requisito de esta spec.

**Criterios de aceptación de la condición dura:**

- **CA-DEP-01:** con API de Fase 1 desplegada y tenant migrado, un no-ADMIN con plantilla estándar ve su nav por permisos (piloto técnico → Suscriptores visible).
- **CA-DEP-02:** simulación de tenant sin corte (permisos efectivos vacíos para no-ADMIN): la nav **no** queda vacía; aplica degradación estática y reintento (tripwire verificable en test de componente con el contexto en estado `ready` y set vacío).
- **CA-DEP-03:** ante fallo del endpoint de permisos efectivos, la nav muestra el comportamiento estático actual y la navegación sigue operable (sin pantalla de bloqueo).

---

## 6. Criterios de aceptación medibles

### 6.1 Navegación (CA-NAV)

| ID | Criterio |
| --- | --- |
| CA-NAV-01 | Con `effectivePermissions` sin `crm.subscribers.read`, el item Suscriptores no existe en el DOM del Sidebar (ni visible, ni disabled, ni candado). |
| CA-NAV-02 | Un usuario con `crm.subscribers.read` efectivo ve Suscriptores aunque su rol no esté en ninguna lista estática previa, siempre que el techo estático del item no lo excluya (items con `allowedRoles`). |
| CA-NAV-03 | Durante la carga, cada slot gateado muestra exactamente un skeleton con forma de item (icono + etiqueta) y ninguno es focoable; Inicio es clicable desde el primer render. |
| CA-NAV-04 | Al resolver permisos, ningún item interactivo visible pasa a oculto sin pasar por estado de carga (cero flash de items reales); verificado con test de componente que monta con datos ya resueltos y con datos en diferido. |
| CA-NAV-05 | Con el endpoint de permisos en error, el Sidebar renderiza el filtrado estático actual, no muestra mensajes de error y los links siguen operables; tras 2 reintentos fallidos permanece degradado y reintenta al volver el foco > 60 s. |
| CA-NAV-06 | No-ADMIN con set vacío de permisos efectivos (`ready`) → nav en filtrado estático (tripwire), nunca vacía. |
| CA-NAV-07 | El contexto `usePermissions()` vive en el layout del dashboard y genera **una sola** llamada a `/access-control/me/effective-permissions` por carga del dashboard, compartida por Sidebar y gates (verificable en test con contador de fetch). |
| CA-NAV-08 | En desktop colapsado (≥ 1024 px, `lg:w-[90px]`) los skeletons y items adoptan forma circular centrada; en drawer mobile el filtrado es idéntico al desktop expandido. |
| CA-NAV-09 | Los grupos («Menú», «Administración») sin items visibles no renderizan su encabezado. |

### 6.2 Gates de página (CA-GATE)

| ID | Criterio |
| --- | --- |
| CA-GATE-01 | Deep-link directo a cada una de las 6 rutas padre sin permiso efectivo muestra el estado restringido con URL conservada (sin redirect, sin 404, sin contenido de la página en el DOM). |
| CA-GATE-02 | Las subrutas listadas en §2.2 heredan el gate del padre (verificado al menos en `/dashboard/crm/subscribers/[id]` y `/dashboard/scheduling/agenda`). |
| CA-GATE-03 | El estado restringido muestra: badge `Acceso restringido`, título `No tienes acceso a esta sección`, descripción §2.3, `Volver a inicio` (target ≥ 44 px) y — solo con `users.read` efectivo — `Ver usuarios y accesos`; sin ese permiso el segundo enlace no existe en el DOM. |
| CA-GATE-04 | En estado `checking` se renderiza skeleton con ritmo `space-y-4` y anuncio sr-only `Verificando acceso`; el contenido autorizado aparece sin re-layout brusco (mismo contenedor). |
| CA-GATE-05 | Con el endpoint de permisos caído y sin techo estático aplicable, la página muestra `No pudimos verificar tu acceso` + `Reintentar`; pulsar Reintentar recupera el estado autorizado sin recarga completa. |
| CA-GATE-06 | La pestaña `Compras` de `/dashboard/inventory` solo es visible/navegable con `inventory.purchasing.read` efectivo; el resto de pestañas de Inventario obedecen al gate de página (`inventory.stock.read`). |
| CA-GATE-07 | Ningún estado del gate pinta `error.message`, códigos HTTP ni claves de permiso crudas. |

### 6.3 Access — 9 sugeridos en el peek (CA-ACV2)

| ID | Criterio |
| --- | --- |
| CA-ACV2-01 | Al abrir `Crear perfil`, el peek (momento lista) muestra exactamente 9 filas de sugeridos cuando el backend expone 9 perfiles system, en el orden §3.3 (verificable por título de fila). **No** hay una sección `Perfiles sugeridos` con 9 cards en la ruta. |
| CA-ACV2-02 | `SYSTEM_TEMPLATE_PROFILE_NAMES` resuelve `Ventas`, `Contabilidad` y `Talento humano` para SALES/ACCOUNTANT/HR; un perfil system sin entrada en el mapa cae a `profile.name`. |
| CA-ACV2-03 | El orden de las 9 filas del peek es invariante ante reordenamiento del array de la API (test con fixtures en orden aleatorio). |
| CA-ACV2-04 | En 1440×900 con 0 personalizados, el primer viewport **no** muestra grid de cards; empty post-corte + CTA `Crear perfil` cumplen CA-ACC-UX-14 (v1.10). El heading `Perfiles sugeridos` aparece como `title` del peek, no en la página. |
| CA-ACV2-05 | Los 6 snapshots `access-{desktop,tablet,mobile}-{light,dark}.png` se regeneran contra el primer viewport **sin grid** y el suite E2E de access pasa completo, con mocks actualizados a `MOD00_ACCESS_V2` y 3 perfiles sugeridos nuevos; axe 0 violaciones en los 6 combos. Asertos de peek: abrir create → 9 filas → detalle → borrador en página. |
| CA-ACV2-06 | Las descripciones visibles de las 3 entradas nuevas (fila/detalle del peek) no contienen `plantilla`, `sistema`, `categoría base`, `módulo`, `matriz` ni claves crudas (barrido de copy en E2E/unit). |
| CA-ACV2-07 | En 390×844, CA-ACC-UX-20 sigue cumpliéndose con la página **sin** galería (ayuda MFA encima del CTA, sin solape, botón a ancho). CA-ACC-UX-29 cubre el peek en el mismo viewport. |

### 6.4 Users (CA-USR)

| ID | Criterio |
| --- | --- |
| CA-USR-01 | Abrir el side peek de edición monta el panel `Accesos efectivos` colapsado por defecto; expandirlo dispara (o reutiliza) la carga de `GET /access-control/users/{id}/effective-permissions`; guardar cambios lo refresca. |
| CA-USR-02 | Cada fuente del panel muestra etiqueta `Perfil sugerido` (isSystem true), `Perfil personalizado` (isSystem false) o `Perfil de acceso` (id ausente en `availableProfiles`), sin ids internos visibles. |
| CA-USR-03 | Con `availableProfiles` vacío o en carga, el panel usa la etiqueta genérica y no bloquea ni muestra error. |
| CA-USR-04 | El panel indica `Refleja los accesos guardados. Los cambios de esta edición se aplican al guardar.` y la línea `Accesos finales` del formulario sigue proyectando la selección en curso. |
| CA-USR-05 | En edición, cambiar el tipo de usuario de forma que se descarten perfiles seleccionados muestra una única `PortalAlert` warning con `role="status"` y `aria-live="polite"`, con el conteo y nombres correctos (casos n=1, n=3, n>3) y la nota de Cancelar. |
| CA-USR-06 | La alerta desaparece al revertir a un tipo que no descarte perfiles o al cerrar el peek; no se duplica con re-renders. |
| CA-USR-07 | `CreateUserModal` no muestra la alerta de descarte en ningún caso. |
| CA-USR-08 | Error de carga del panel muestra copy sanitizado + `Reintentar`; nunca `error.message` ni ids. |

---

## 7. Fuera de alcance

- **Backend y contratos:** nuevos endpoints, cambios de payload o de rutas (incluido exponer versión de catálogo al response de permisos), lógica de `EffectivePermissionsService`, migraciones, seeds y su orden.
- **Design system:** tokens, paleta, primitivas o variantes nuevas de `@iwana/ui`; el panel y los gates se componen con primitivas y class-tokens existentes (`PortalPanel`, `PortalAlert`, `PortalEmptyState`, `PortalSkeletonBlock`, `Button`, `Badge`, `interactiveFocusClassName`).
- **ABAC/scoping:** filtrado por `scopeSiteId`, scoping por asignación de expedientes (ADR-083 D7 y Fase 2 posterior).
- **Alcance funcional:** flujo de solicitud de acceso desde el estado restringido (más allá del enlace condicional §2.3), gramática de 3 bandas con candados, cambios de navegación fuera del mapeo congelado (§1.2), módulo media y `subscriber-tax` (exclusiones D7).
- **Otras superficies:** gates en rutas de settings (ya gobernadas por `requiredPermissions` del hub), Operaciones como página gateada, portal de suscriptores.
- **Infraestructura FE:** gestión de estado global adicional, service workers o prefetch de permisos.

---

## 8. Hallazgos que requieren resolución del orquestador

| # | Hallazgo | Impacto | Resolución propuesta en esta spec (a confirmar) |
| --- | --- | --- | --- |
| 1 | HLD §6.6 enuncia gates en «Suscriptores, Oportunidades, Assurance, Inventario, **Compras** y Comercial»; el encargo de Fase 3 habla de «…Inventario, Comercial, **Programación** si aplica». En la UI real no existe página de Compras: es pestaña dentro de Inventario (`inventory-nav.ts`); Programación sí existe (`/dashboard/scheduling`) y su permiso `wfm.schedule.read` está en el mapeo congelado del plan §2. | Define la 6.ª superficie gateada. | Congelado aquí: gates de página = Suscriptores, Oportunidades, Mesa de ayuda, Inventario, Comercial y **Programación**; **Compras** queda como gate de pestaña interna de Inventario (`inventory.purchasing.read`). Confirmar o ajustar antes del congelado. |
| 2 | D4 nombra las plantillas estándar «Acceso estándar {Categoría}» (9), pero hoy existen 6 perfiles system «sugeridos» con nombres humanos. La UI debe mostrar **exactamente 9 entradas en el peek** (una por tipo de usuario); si la migración de Fase 1 **coexiste** con los 6 actuales en lugar de absorberlos 1:1 por categoría, el peek mostraría duplicados por tipo de usuario. | Conteo y unicidad de filas en el peek de Access. | Entender que Fase 1 deja **un único perfil system por categoría** (9 en total). Confirmar con AI-SR-FULL/orquestador; si no, esta spec requerirá v1.3 con regla de deduplicación por `baseRoleConstraint`. |
| 3 | La condición dura §5.4 se congela sin señal runtime por tenant (orden de despliegue + tripwire), porque un flag por tenant o exponer la versión de catálogo al frontend exige cambio de contrato backend (fuera de alcance G1-5). | Precisión del gating por tenant. | Si el orquestador prefiere flag/versión como mecanismo primario, asignarlo a AI-SR-FULL como micro-cambio de contrato y esta spec lo adoptaría en v1.1; el tripwire (§1.5) se mantiene en ambos escenarios. |
| 4 | La nav gatea Operaciones por OR de permisos (plan §2), pero `/dashboard/operations` no recibe page-gate en este ciclo (no está en las 6 superficies) y sus endpoints siguen `@Roles`-only. Un deep-link sin permisos de nav dependerá del 403 actual del backend. | Gap transitorio de deep-link a Operaciones. | Aceptado como estado transitorio del plan (cableado de operations fuera del ciclo). Si el orquestador quiere simetría total, añadir 7.ª superficie en v1.1. |

---

## Relación con artefactos vigentes

| Artefacto | Efecto |
| --- | --- |
| Spec prevalente access v1.10 | **Gobierna** empty, subtítulo, peek de creación (§6.8 / §8 / §10.1), banner de siguiente paso y CA-ACC-POST-01…06. Esta spec **ya no añade** cards en página: añade las 3 entradas (SALES/ACCOUNTANT/HR), el orden canónico y los nombres humanos **en el peek**. CA-ACC-UX-15/16/18 superados; CA-ACC-UX-14 sustituido. |
| ADR-083 / HLD §6.6 / plan Fase 3 | Implementación frontend de D6 con las condiciones G1 AI-PROD-UX 1–6 incorporadas. |
| Plan catálogo en peek v1.1 | Opción B: 9 cards fuera de la página; catálogo solo en `PortalSidePeek`. |
| Firma iWana | Lima reservada a indicador de item activo; estados nuevos usan ámbar del patrón hub y tokens existentes. |
| Snapshot E2E access | Los 6 PNG quedan obsoletos con esta spec; se regeneran contra el primer viewport **sin grid** (CA-ACV2-05). |

Cambios posteriores a esta spec se versionan (v1.3+) y se notifican vía orquestador a AI-FE-PLATFORM y AI-SR-QA; nunca se parchean solo en código.
