# Review UI — Menú lateral / sidebar (`apps/web` shell)

**Versión:** 1.0  
**Estado:** Activo — auditoría pre-G2 Tracks A+B integrados (AI-PROD-UX + AI-DS-OWNER)  
**Fecha:** 2026-08-11  
**Emite:** protocolo v1.5 §3bis · Track A AI-PROD-UX · Track B AI-DS-OWNER (identidad/DS integrado 2026-08-11)  
**Prompt:** [`PROMPT-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md`](../prompts/PROMPT-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md)  
**Copy vivo:** `apps/web/src/lib/platform-ui-copy.ts` → `navigation` / `navigationGroups` / `shell`  
**Código vivo:** `apps/web/src/components/layout/Sidebar.tsx` (+ `PlatformBrandMark.tsx`)  
**Antecedente cerrado:** [`INFORME-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md`](INFORME-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md) — touch/foco **GO**; **no se reabren** CA-SB / CA-T1 salvo regresión (no hay).  
**Desempate EM-ARCH (2026-08-11):** el contrato [`2026-08-11-sidebar-azul-noche-ds-contrato.md`](../specs/2026-08-11-sidebar-azul-noche-ds-contrato.md) está **Superado**. El operador rechazó navy. El sidebar **blanco** es la decisión vigente (`BLOQUEO-3` de [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md)). **No se puntúa como defecto** que el aside no sea azul noche.

**Skills:** `system-vocabulary-review` (owner copy) · `ui-ux-pro-max` subordinada a `iwana-identity-ui-review` (navegación, no paletas genéricas).

---

## Resumen ejecutivo

Chrome de navegación de la **consola de plataforma** (`apps/web`): el operador recorre Centro de control, Empresas, Usuarios internos, Historial de cambios y Plataforma; reconoce el ítem activo (tinte + barra lima + `aria-current`); colapsa en desktop y abre/cierra en mobile. La **tarea se completa**: destinos, estado activo, Escape, foco y targets ≥44 px siguen en el cierre GO del carril táctil. El daño de esta auditoría es **vocabulario y arquitectura de información**, no interacción táctil ni color de fondo.

Se **confirma:** `navigationGroups.operation` = «Operacion» sin tilde; `governance` = «Gobierno» (jerga de control plane; settings ya la retiró del CardTitle, CA-SET-09); `shell.workspaceSubtitle` / `openMenu` / `closeMenu` sin tildes. Se **refuta** tratar «Usuarios internos» como defecto de tono: es el canon vivo de la consola. Los **dos grupos con cinco ítems** son ruido: cortan por gobernanza interna, no por tarea (Historial es trabajo diario; el centro de control ya enlaza «Abrir historial»).

**Modo:** código  
**Script:** `audit-ui.mjs` sobre `Sidebar.tsx` + `PlatformBrandMark.tsx` → **0 deterministas, 0 heurísticos** (A y B coinciden). No cubre copy, IA de grupos ni tildes.  
**Puntaje Track A (copy + nav UX):** **84/100** (P0: 0, P1: 1, P2: 2, P3: 0) — intacto.  
**Puntaje Track B (identidad / tokens / primitives):** **95/100** (P0: 0, P1: 0, P2: 1, P3: 2). Navy **excluido** del conteo (Superado).  
**Puntaje combinado A+B:** **79/100** (P0: 0, P1: 1, P2: 3, P3: 2) → `100 − 10 − 9 − 2`.  
**Banda:** 75–89 — aceptable con mejoras; no bloquea uso. Carril rápido (copy A + z/11px/sólido opcional B) **SÍ**. Reabrir navy **NO**.

Sin `[BLOQUEO]`.

---

## Hallazgos críticos (P0)

Ninguno.

---

## Hallazgos

### [P1][Vocabulario] Grupo «Gobierno» y «gobierno interno» en chrome permanente

- **Evidencia:**
  - `platform-ui-copy.ts:12` — `navigationGroups.governance: 'Gobierno'`.
  - `Sidebar.tsx:43-47` — el grupo etiqueta Historial de cambios + Plataforma.
  - `Sidebar.tsx:62-70` — el eyebrow se pinta en cada página (`portal-eyebrow-muted`, visible en desktop expandido).
  - `platform-ui-copy.ts:16` — `shell.workspaceSubtitle: 'Operacion y gobierno interno'` (se renderiza en TopHeader xl+; misma fuente de copy).
  - Canon reciente: [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md) CA-SET-09 — cero «Gobierno…» en CardTitle de `/settings` (PASS en G6).
  - Ancla: `system-vocabulary-review` — evitar copy de arquitectura / «gobernanza» de control plane en UI final.
- **Impacto:** El operador de plataforma ve jerga de control plane en el menú de **todas** las pantallas. Settings ya tradujo esa superficie a tarea (identidad + seguridad); el sidebar contradice el canon cerrado.
- **Recomendación:** Eliminar el rótulo «Gobierno». Preferencia de flujo: **sidebar plano** (hallazgo P2). Si se conservan grupos, labels de tarea (p. ej. nada / un separador mudo), nunca «Gobierno». Reescribir o retirar `workspaceSubtitle`. Fuera de este alcance: `PlatformAuthExperience.tsx:67` (`asideEyebrow = 'Gobierno de plataforma'`) — misma raíz, no se puntúa aquí.
- **Esfuerzo:** S  
- **Track:** A

### [P2][Copy] Acentos omitidos en chrome de navegación

- **Evidencia:**
  - `platform-ui-copy.ts:11` — `operation: 'Operacion'`.
  - `platform-ui-copy.ts:16` — `workspaceSubtitle: 'Operacion y gobierno interno'`.
  - `platform-ui-copy.ts:17-18` — `openMenu: 'Abrir menu'` / `closeMenu: 'Cerrar menu'`.
  - `Sidebar.tsx:35` consume `operation`; `Sidebar.tsx:205` consume `closeMenu`.
  - Contraste en el mismo catálogo: `expandSidebar` / `collapseSidebar` (`:19-20`) y el resto de `PLATFORM_UI_COPY` **sí** usan tildes (`configuración`, `atención`, `página`).
  - El E2E `e2e/tests/web-shell-sidebar-touch-a11y.spec.ts:23-27` fija `'Abrir menu'` / `'Cerrar menu'` — el error ortográfico quedó como contrato de test.
- **Impacto:** Chrome en español incorrecto, en mayúsculas de eyebrow (`OPERACION`) y en `aria-label` de abrir/cerrar. No bloquea la tarea; rompe tono profesional y consistencia del catálogo.
- **Recomendación:** `Operación` · `Abrir menú` · `Cerrar menú`. Actualizar E2E CA-T1 y cualquier spec que espere el string ASCII. `workspaceSubtitle` se reescribe con el P1 (no basta con poner tilde a «gobierno»).
- **Esfuerzo:** S  
- **Track:** A

### [P2][UX] Dos grupos para cinco ítems: ruido de IA, corte por arquitectura

- **Evidencia:**
  - `Sidebar.tsx:33-48` — grupo Operacion (3) + grupo Gobierno (2) = **5 destinos**.
  - `Sidebar.tsx:61-70` — cada grupo monta eyebrow `mt-6` + `mb-2` (el primero `mt-0`); en colapsado los labels se ocultan (`lg:hidden`) y queda una lista plana de iconos: los grupos **no aportan** en el modo denso.
  - Tarea diaria: `platform-ui-copy.ts:56` — el centro de control ofrece «Abrir historial»; Historial es trabajo operativo, no «gobierno».
  - Heurística (`ui-ux-pro-max` §9, filtrada por iWana): sidebar para pantallas grandes; agrupación útil cuando hay muchos destinos o categorías de **tarea**. Cinco ítems caben en una lista (límite típico de nav primaria ≤5).
  - Comparación de receta (fuera de alcance, solo contraste): el portal agrupa porque tiene **8+** ítems de trabajo (`MENÚ`) más administración — `apps/portal/src/components/layout/Sidebar.tsx:68-112`. En web el volumen no justifica el mismo patrón.
- **Impacto:** Carga cognitiva sin beneficio: el operador debe interpretar un eje Operación/Gobierno que no describe lo que va a hacer. Historial queda semánticamente lejos de Empresas/Usuarios.
- **Recomendación:** **Aplanar** a una sola `<ul>` de cinco ítems, mismo orden (Centro de control → Empresas → Usuarios internos → Historial de cambios → Plataforma). Separador visual opcional antes de Plataforma **sin** label. No cambiar rutas (fuera de alcance). No copiar grupos del portal.
- **Esfuerzo:** S  
- **Track:** A → FE composición; sin primitive nueva.

### [P2][Ingeniería] Z literales en chrome del shell (ADR-075)

- **Evidencia:** `Sidebar.tsx:158` — `z-40` en el `<aside>`; `layout.tsx:42` — velo mobile `z-30`. Portal ya consume `z-(--z-drawer)`.
- **Ancla:** [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md) §2 — en `apps/*/src` **prohibido z literal**; aside → `--z-drawer`, velo → `--z-overlay` (`globals.css`).
- **Impacto:** apilamiento negociado en clases; el token semántico ya existe. No cambia la tarea de navegar.
- **Recomendación:** `z-(--z-drawer)` en el aside; `z-(--z-overlay)` en el velo. Orden 300 > 200 se conserva.
- **Esfuerzo:** S  
- **Track:** B · **CA-NAV-DS-01**

### [P3][Diseño visual] `text-[11px]` pisa `.portal-eyebrow-muted`

- **Evidencia:** `Sidebar.tsx:64` — `portal-eyebrow-muted … text-[11px]`. La utility ya fija `text-[10px]` (`globals.css`). El eyebrow de marca (`Sidebar.tsx:182`) usa la primitive **sin** override.
- **Ancla:** receta `component-recipes.md` §11; `tokens.md` — 10 px reservados al eyebrow del sistema.
- **Impacto:** valor arbitrario sobre la primitive; no bloquea la tarea.
- **Recomendación:** quitar `text-[11px]`.
- **Duplicidad:** **absorbido si CA-NAV-03** (flatten retira los eyebrows de grupo). El P3 **no se borra**; deja de ser trabajo extra cuando A aplana.
- **Esfuerzo:** S  
- **Track:** B · **CA-NAV-DS-02**

### [P3][Identidad] Glass/blur residual en chrome estático (no viola Firma)

- **Evidencia:** `Sidebar.tsx:159` — `bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85` + `dark:bg-dark-surface-2/95`. En `lg:static` no hay contenido detrás que desenfocar. Portal: `bg-white` / `dark:bg-dark-surface-2` **sólido**.
- **Ancla:** Firma §5 — glass **prohibido** en tablas/forms; **permitido** en overlays, chrome sticky y drawers. El aside es chrome, no superficie de contenido. BLOQUEO-3 congela **blanco**, no el blur como valor de marca.
- **Impacto:** blur inerte en desktop + clases ad-hoc (no `.iwana-glass`) + divergencia con portal. No diluye la barra lima ni el reconocimiento de marca.
- **Recomendación (opcional, paridad):** sólido como portal. **No reabre navy.**
- **Esfuerzo:** S  
- **Track:** B · **CA-NAV-DS-03**

---

## Señales del encargo — confirmadas / refutadas

| Señal | Veredicto | Dónde |
| --- | --- | --- |
| `navigationGroups.operation` = «Operacion» sin tilde | **Confirmada** (P2 copy) | `platform-ui-copy.ts:11` → `Sidebar.tsx:35` |
| `governance` = «Gobierno» (jerga control plane) | **Confirmada** (P1 vocab) | `platform-ui-copy.ts:12` → `Sidebar.tsx:43`; settings ya evitó el término en CardTitle |
| `shell.workspaceSubtitle` / `openMenu` sin tildes | **Confirmada** (P2 copy; subtítulo también carga el P1) | `platform-ui-copy.ts:16-17`; closeMenu `:18` igual |
| «Usuarios internos» vs tono de producto | **Refutada como defecto** | Canon: `navigation.users` + `users.title` (`:5`, `:87`), Historial (`entityTypeLabels.user`), búsqueda global, E2E `admin-bootstrap`. Distingue cuentas de consola frente a suscriptores de empresa. Acortar a «Usuarios» perdería esa frontera. |
| ¿Grupos aportan o son ruido con 5 ítems? | **Ruido** (P2 UX) | 3+2 ítems; labels mudos en colapsado; Historial mal cortado |

---

## Matriz de copy

| Zona | Actual (evidencia) | Propuesto | Notas |
| --- | --- | --- | --- |
| **Grupo operation** | Operacion (`platform-ui-copy.ts:11`, `Sidebar.tsx:35`) | **Retirar grupo** | Si EM-ARCH exige conservar grupos: «Operación» (con tilde), nunca como eje vs Gobierno |
| **Grupo governance** | Gobierno (`:12`, `Sidebar.tsx:43`) | **Retirar grupo** | Misma jerga que CA-SET-09; no reintroducir |
| **Ítem home** | Centro de control (`navigation.home`, `:3`) | Sin cambio | OK · sentence case |
| **Ítem tenants** | Empresas (`:4`) | Sin cambio | Canon tenant → empresa |
| **Ítem users** | Usuarios internos (`:5`) | Sin cambio | Canon de consola; no es jerga |
| **Ítem audit** | Historial de cambios (`:6`) | Sin cambio | Canon auditoría → historial |
| **Ítem settings** | Plataforma (`:7`) | Sin cambio | Canónico post-settings (CA-SET-08) |
| **shell.workspace** | Plataforma iWana (`:15`, `Sidebar.tsx:182`) | Sin cambio | Eyebrow de producto; no es el ítem Plataforma |
| **shell.workspaceSubtitle** | Operacion y gobierno interno (`:16`) | Consola de plataforma. · o **retirar** | Visible en TopHeader xl+ (mención; no rediseño de header). Cero «gobierno» |
| **shell.openMenu** | Abrir menu (`:17`) | Abrir menú | TopHeader hamburger; actualizar E2E |
| **shell.closeMenu** | Cerrar menu (`:18`, `Sidebar.tsx:205`) | Cerrar menú | Sidebar X + toggle mobile |
| **shell.expandSidebar** | Expandir panel lateral (`:19`) | Sin cambio | Tildes OK |
| **shell.collapseSidebar** | Contraer panel lateral (`:20`) | Sin cambio | Tildes OK |
| **shell.goHome** | Ir al centro de control (`:21`, `Sidebar.tsx:196`) | Sin cambio | OK |
| **aside landmark** | Navegación principal (`Sidebar.tsx:156`, hardcoded) | Mover a `PLATFORM_UI_COPY.shell.navLandmark` | No es defecto de vocabulario; consistencia de catálogo |
| **nav landmark** | Menú principal (`Sidebar.tsx:216`, hardcoded) | Menú principal (tilde) en el catálogo | Idem |
| **Auth eyebrow** | Gobierno de plataforma (`PlatformAuthExperience.tsx:67`) | Fuera de alcance | Misma raíz; no puntúa este INFORME |

Ítems de navegación (los cinco destinos) están en sentence case, sin enums crudos, sin `tenant`/`audit`/`settings` crudos en UI. El problema no son los destinos: son los **rótulos de grupo** y el **shell** sin tildes / con «gobierno».

---

## Criterios de aceptación (remediación futura — no congelados)

No reutilizan IDs CA-SB / CA-T1 / CA-D\* / CA-SET.

| ID | Criterio |
| --- | --- |
| **CA-NAV-01** | Cero «Gobierno» / «gobierno» en copy visible o `aria-label` de navegación y shell (`navigationGroups`, `workspaceSubtitle`). |
| **CA-NAV-02** | `Operación`, `Abrir menú`, `Cerrar menú` con tilde en `PLATFORM_UI_COPY`; E2E `web-shell-sidebar-touch-a11y` y specs que afirmen el string ASCII actualizan el canon. |
| **CA-NAV-03** | Sidebar de `apps/web` con **una** lista de los cinco destinos vigentes (mismo orden y mismas rutas). Sin eyebrows de grupo Operacion/Gobierno. Separador mudo opcional antes de Plataforma. |
| **CA-NAV-04** | «Usuarios internos», «Centro de control», «Empresas», «Historial de cambios», «Plataforma», «Plataforma iWana» permanecen. Tests de destinos no cambian de sentido. |
| **CA-NAV-05** | Copy de nav/shell sale de `PLATFORM_UI_COPY` (incl. landmarks si se mueven). Cero strings de grupo en JSX. |
| **CA-NAV-06** | No regresión táctil/foco: `min-h-11`, `interactiveFocusClassName`, `aria-current="page"`, `title` en colapsado, Escape cierra mobile, barra lima en activo. **No reabre CA-SB/CA-T1.** |
| **CA-NAV-DS-01** | Aside `z-(--z-drawer)` y velo mobile `z-(--z-overlay)`. Cero `z-40` / `z-30` literales en este chrome (ADR-075). |
| **CA-NAV-DS-02** | Cero `text-[11px]` sobre `.portal-eyebrow-muted` en el sidebar web. **Absorbido si CA-NAV-03** retira los grupos. |
| **CA-NAV-DS-03** | (Opcional) Aside sólido `bg-white` / `dark:bg-dark-surface-2` como portal; o documentar `bg-white/95` + blur como excepción de chrome. **No** navy. |

---

## No reabierto (antecedente GO)

Verificado en código vivo; no son hallazgos de este INFORME.

| Control | Evidencia | Estado |
| --- | --- | --- |
| Foco canónico | `Sidebar.tsx:88, 177, 194, 208` — `interactiveFocusClassName` | Intactos |
| `aria-current` | `Sidebar.tsx:90` | Intactos |
| Title colapsado | `Sidebar.tsx:81` | Intactos |
| Escape mobile | `Sidebar.tsx:144-150` | Intactos |
| Targets ≥44 px | `min-h-11` ítems/marca (`:83, 175`); cierre `h-11 w-11` (`:207`) | Intactos (CA-T1 GO) |
| Barra lima activa | `Sidebar.tsx:92-97` — `w-1 h-6 rounded-r-full bg-iwana-secondary` | Intactos (firma #1) — **B PASS** |
| Icono lima AA | light `text-iwana-secondary-700` (6.2:1); dark `text-iwana-secondary` sobre `dark-surface-3` (~6.5:1) (`:103`) | Intactos — **B PASS** (no es `text-iwana-secondary` suelto sobre blanco) |
| Anchos 90 / 290 | `Sidebar.tsx:162-163`; portal idéntico | **B PASS** — squircle cabe en colapsado (CA-SB-05) |
| Dark-surface | aside `dark-surface-2/95`; canvas `dark-surface`; squircle `dark-surface-3` | **B PASS** — familia ADR-056; cero `dark:bg-gray-{700-950}` |
| Canvas `rounded-3xl` | `layout.tsx:64` | **B PASS** — operador 2026-08-11; CA-SB-02 superado. `--radius-3xl` no existe; 3xl Tailwind = `--radius-2xl` |

---

## Hallazgos de identidad / DS (Track B — AI-DS-OWNER)

**Modo:** review (`iwana-identity-ui-review`). **Contrato nuevo:** no. **Código:** no.

### Dictamen navy

Receta `component-recipes.md` §10 (`bg-iwana-primary`) y sample de `firma-elements.md` §1 son **dirección Firma**. El contrato [`2026-08-11-sidebar-azul-noche-ds-contrato.md`](../specs/2026-08-11-sidebar-azul-noche-ds-contrato.md) está **Superado** (operador rechazó navy 2026-08-11). Rige sidebar **blanco** + BLOQUEO-3. **Navy no es defecto; no entra al puntaje.** Receta §10 queda **desactualizada** respecto al desempate: enmendar en docs (mejora estratégica), no en este G2.

### Firma sobre blanco — PASS

Barra lima (firma #1) + tinte `bg-iwana-surface-soft` + icono lima AA (`iwana-secondary-700` claro / DEFAULT lima sobre `dark-surface-3`). `PlatformBrandMark` squircle 44×40 (`h-10 w-11 rounded-xl`, `bg-iwana-surface-soft`) vs contrato carril v1.1: **PASS**. **0 primitives nuevas.** No extraer Sidebar a `@iwana/ui` (Firma §2.2 sigue fuera).

### Glass / blur ¿viola Firma?

**No.** Firma §5 prohíbe glass en tablas/forms; permite overlays, chrome sticky y drawers. El aside es chrome. BLOQUEO-3 congela blanco, no el blur como marca. P3 opcional de paridad con portal sólido (CA-NAV-DS-03), no incumplimiento.

### Tabla de cierre (preguntas de A → dictamen B)

| Tema | Dictamen B |
| --- | --- |
| **Navy vs blanco** | Superado + BLOQUEO-3 vigente. **No puntuar** blanco como deuda. Receta §10 → enmendar docs (excepción web / desempate). |
| Script `audit-ui.mjs` | Confirmado: **0 deterministas, 0 heurísticos**. Exit 0. |
| Barra lima + tinte activo | **PASS** sobre blanco. |
| Glass / `backdrop-blur` | **No viola Firma.** P3 opcional sólido (CA-NAV-DS-03). |
| Canvas `rounded-3xl` + `iwana-surface-soft` | **PASS** (operador; CA-SB-02 superado; paridad portal). |
| Eyebrow `text-[11px]` | P3 CA-NAV-DS-02. **Absorbido si CA-NAV-03.** |
| `PlatformBrandMark` | **PASS** vs carril v1.1. |
| Primitives nuevas | **0.** Coincido con A. |
| ¿Carril rápido visual? | **SÍ** para z + 11px + sólido opcional. Navy **NO**. |
| Portal sidebar | Fuera de alcance. Portal sólido (sin blur) y `z-(--z-drawer)` son el contraste de receta. |

**ui-ux-pro-max (subordinada, texto de A conservado):** se adoptan `nav-state-active`, `nav-label-icon`, `adaptive-navigation`, Escape del drawer y targets ≥44 px (ya GO). Se descartan paletas, glassmorphism genérico y “navy because Linear”. El flatten de 5 ítems es IA iWana (menos chrome, misma tarea), no un patrón de template.

---

## Quick wins

1. Tildes en `operation` / `openMenu` / `closeMenu` + E2E.
2. Borrar `navigationGroups` del Sidebar (una `<ul>`) y las claves si quedan huérfanas.
3. Reescribir o retirar `workspaceSubtitle` (cero «gobierno»).
4. `z-(--z-drawer)` / `z-(--z-overlay)` en aside y velo (CA-NAV-DS-01).
5. Quitar `text-[11px]` — o absorberlo al flatten (CA-NAV-DS-02 / CA-NAV-03).

---

## Mejoras estratégicas

- ~~Enmendar `component-recipes.md` §10~~ **Hecho 2026-08-11:** receta viva = aside blanco; navy no se puntúa (`iwana-identity-ui-review` anti-FP 8).
- Auth `Gobierno de plataforma`: misma raíz de vocabulario; otro prompt.
- Unificar grupos portal (`MENÚ` / `ADMINISTRACIÓN`, `Programacion` sin tilde) en auditoría **portal**, no aquí.
- **No** congelar UX spec en este INFORME (prompt: solo auditoría).

---

## Deslinde

| Superficie | En alcance |
| --- | --- |
| `apps/web` `Sidebar.tsx` + `platform-ui-copy.ts` `navigation*` / `navigationGroups` / `shell` | **Sí** |
| `PlatformBrandMark.tsx` (barrido script) | **Sí** (mecánico; visual → B) |
| `apps/portal` sidebar | **No** (solo comparación de receta: volumen de ítems) |
| `TopHeader.tsx` | **No**, salvo mención: `openMenu` / `workspace` / `workspaceSubtitle` / hamburger. Residual: el título xl+ clava `navigation.home` («Centro de control») en **todas** las rutas — orientación, no se puntúa aquí. |
| Nuevas rutas / IA de destinos | **No** |
| Color navy del aside | **No** como defecto (Superado) |
| Implementación FE | **No** |

---

## Por verificar

1. Contraste runtime del eyebrow `text-gray-500` de grupo sobre `bg-white/85` (AA) — irrelevante si CA-NAV-03 retira los grupos; B **no** conserva grupos (coincide flatten de A).
2. Focus trap del drawer mobile (Tab al canvas con overlay abierto) — no cubierto por CA-T1; no se eleva a P1 porque Escape + overlay click + GO táctil existen. QA si reabren a11y de drawer. B no reabre.

---

## Veredicto

**Aprobada con cambios.**

No requiere rediseño de destinos ni de interacción: la tarea de navegar y reconocer el activo ya está resuelta (carril táctil GO). Firma sobre blanco **PASS** (barra lima + icono AA). Bloqueantes de cierre de **copy/IA:** **CA-NAV-01**, **CA-NAV-02**, **CA-NAV-03**. CA-NAV-04 es no-regresión de destinos canónicos. DS: **CA-NAV-DS-01** (z) en el mismo carril; **CA-NAV-DS-02** absorbible por flatten; **CA-NAV-DS-03** opcional.

### Remediación posterior viable por carril rápido: **SÍ** (copy + flatten + z + 11px + sólido opcional)

- No altera alcance de producto, contrato de datos, boundaries ni tokens de marca.
- **0 primitives nuevas** — `PLATFORM_UI_COPY` + composición del `<nav>` + tokens `--z-*` ya vivos.
- Reabrir sidebar azul noche: **NO** (contrato Superado; operador rechazó). Eso **reabriría** composición de marca → **no** es carril rápido.
- Glass/blur **no viola Firma**; alinear a sólido portal es pulido opcional (CA-NAV-DS-03).
- Sin `[BLOQUEO]`.

---

## Tracks

| Rol | Dictamen |
| --- | --- |
| AI-PROD-UX (A) | Owner INFORME + matriz copy + CA-NAV-01…06. Puntaje **84/100** **intacto**. Tres hallazgos (P1 Gobierno · P2 tildes · P2 grupos). «Usuarios internos» se conserva. |
| AI-DS-OWNER (B) | Identidad/DS integrado. Navy **no** es defecto (Superado + BLOQUEO-3). Puntaje DS **95/100**. Hallazgos: P2 z literales (CA-NAV-DS-01) · P3 `text-[11px]` (CA-NAV-DS-02, absorbido si CA-NAV-03) · P3 glass residual no viola Firma (CA-NAV-DS-03 opcional). Barra lima + icono AA **PASS**. Carril visual **SÍ** (z + 11px + sólido opcional). Navy **NO**. Receta §10 desactualizada → enmendar docs, no este G2. |
| Siguiente (EM-ARCH) | Score combinado **79/100** (banda 75–89). Prompt alineación G2 si se exige; congelar UX/DS **después**. |

## Puntaje (fórmula skill)

`Puntaje = max(0, 100 − 20·P0 − 10·P1 − 3·P2 − 1·P3)`

### Track A (copy + nav UX) — intacto

| Conteo | Valor |
| --- | --- |
| P0 | 0 |
| P1 | 1 (Gobierno / gobierno interno) |
| P2 | 2 (tildes · grupos con 5 ítems) |
| P3 | 0 (landmarks hardcoded = consistencia de catálogo, no se puntúa; navy no entra) |

`100 − 0 − 10 − 6 − 0` = **84/100**

### Track B (identidad / tokens / primitives)

| Conteo | Valor |
| --- | --- |
| P0 | 0 |
| P1 | 0 |
| P2 | 1 (z literales ADR-075) |
| P3 | 2 (`text-[11px]` · glass residual) |

`100 − 0 − 0 − 3 − 2` = **95/100** · navy **excluido**

### Combinado A+B

| Conteo | Valor |
| --- | --- |
| P0 | 0 |
| P1 | 1 (Gobierno / gobierno interno) |
| P2 | 3 (tildes · grupos · z literales) |
| P3 | 2 (`text-[11px]` · glass residual) |

`100 − 10 − 9 − 2` = **79/100**

| Referencia | Puntaje |
| --- | --- |
| A copy + nav UX | **84/100** (intacto) |
| B Identidad/DS | **95/100** (navy **excluido**) |
| **Combinado A+B** | **79/100** |

---

## Barrido mecánico (EM-ARCH)

```text
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs \
  apps/web/src/components/layout/Sidebar.tsx \
  apps/web/src/components/layout/PlatformBrandMark.tsx
```

**Resultado (2026-08-11):** `audit-ui: sin hallazgos en las rutas analizadas.` · exit **0** · **0 deterministas**.

---

## Adenda G6 — GO/NO-GO alineación (Track D · AI-SR-QA)

**Fecha:** 2026-08-11  
**Agente:** AI-SR-QA  
**Prompt:** [`PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md)  
**Specs:** UX nav v1.0 Congelado · DS nav v1.0 Congelado (carril rápido GO)  
**Alcance:** solo chrome de nav `apps/web` (`Sidebar` + velo de `layout` + copy `navigation` / `shell`). Sin portal/API. Sin commit.  
**Código contrastado:** `Sidebar.tsx` · `layout.tsx` · `platform-ui-copy.ts` · `Sidebar.spec.tsx` · `e2e/tests/web-shell-sidebar-touch-a11y.spec.ts`

> Conserva la auditoría pre-remediación (79/100) intacta arriba. Esta adenda dictamina **solo** el cierre G6 de CA-NAV-01…06 y CA-NAV-DS-01…07 tras implementación Track C.

### Matriz CA-NAV ↔ evidencia

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-NAV-01** | Cero «Gobierno» / «gobierno» en nav y shell | Grep `platform-ui-copy.ts` = **0**. `navigationGroups` retirado. Jest `not.toHaveProperty('navigationGroups')` + `queryByText(/gobierno/i)` ausente. `workspaceSubtitle` = `Consola de plataforma.` | **PASS** |
| **CA-NAV-02** | Tildes en menú; E2E actualiza canon | Copy: `Abrir menú` / `Cerrar menú`. Grupo «Operación» no reaparece (CA-NAV-03). E2E usa los literales con tilde. Jest congela los strings. | **PASS** |
| **CA-NAV-03** | Una lista de 5 destinos; sin grupos; sin separador | `navItems` plano → un `<ul>` / cinco `<li>`. Jest: `querySelectorAll('ul')` = 1, `hr` null, sin Operacion/Gobierno. Orden canónico intacto. | **PASS** |
| **CA-NAV-04** | Destinos canónicos sin cambio | Labels: Centro de control · Empresas · Usuarios internos · Historial de cambios · Plataforma · Plataforma iWana. Rutas `/dashboard` `/tenants` `/users` `/audit-logs` `/settings`. | **PASS** |
| **CA-NAV-05** | Copy nav/shell desde `PLATFORM_UI_COPY` | Landmarks `shell.navLandmark` / `shell.menuLandmark`. Cierre/apertura desde `shell.*`. Cero strings de grupo en JSX. | **PASS** |
| **CA-NAV-06** | No regresión táctil/foco | Jest: `min-h-11`, `aria-current="page"`, `title` colapsado, Escape, barra lima, `interactiveFocusClassName` en 4 nodos. E2E CA-T1: hitboxes ≥44 px. **No reabre CA-SB/CA-T1.** | **PASS** |

### Matriz CA-NAV-DS ↔ evidencia

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-NAV-DS-01** | Aside `z-(--z-drawer)`; velo `z-(--z-overlay)` | Código: `Sidebar.tsx` aside + `layout.tsx` velo. Grep `z-40`/`z-30`/`z-[` en Sidebar + layout = **0**. Jest: `aside.className` contiene `z-(--z-drawer)`. | **PASS** |
| **CA-NAV-DS-02** | Cero `text-[11px]` en Sidebar | Grep `Sidebar.tsx` = **0**. Eyebrow de marca = `.portal-eyebrow-muted` sin override. Absorbido por flatten. | **PASS** |
| **CA-NAV-DS-03** | Aside sólido; cero blur/navy | `bg-white dark:bg-dark-surface-2`. Grep `backdrop-blur` / `bg-white/95` / `bg-white/85` / `dark:bg-dark-surface-2/95` / `bg-iwana-primary` en aside = **0**. Jest lo afirma. | **PASS** |
| **CA-NAV-DS-04** | Un `<ul>`; cero eyebrows de grupo; cero separador mudo | Jest: 1 `ul`, 5 destinos, `hr` null. Código: sin `<p>` eyebrow de grupo, sin `border-t` entre ítems. | **PASS** |
| **CA-NAV-DS-05** | Lima + T1 + foco canónico intactos | Jest: barra `h-6 w-1 … bg-iwana-secondary`; `min-h-11` nav/marca; close `h-11 w-11`; `interactiveFocusClassName` en Link nav, marca expandida, marca colapsada y botón cerrar. E2E ≥44 px. | **PASS** |
| **CA-NAV-DS-06** | Cero Sidebar nuevo en `@iwana/ui`; squircle y canvas intactos | Grep `packages/ui` Sidebar = **0**. `PlatformBrandMark` `h-10 w-11 rounded-xl` sin ring. Canvas `lg:rounded-3xl` en `layout.tsx` no tocado. | **PASS** |
| **CA-NAV-DS-07** | `audit-ui.mjs` 0 deterministas P0/P1 | Barrido 2026-08-11 Track D sobre `Sidebar.tsx` + `layout.tsx` + `PlatformBrandMark.tsx`: **sin hallazgos** · exit **0**. Cero `dark:bg-gray-{700-950}`, hex de marca, `z-9999`. | **PASS** |

### Evidencia de comandos (fresca · 2026-08-11)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Jest Sidebar | `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern="Sidebar.spec" --no-coverage` | **1 suite · 5/5 PASS** · exit **0** |
| Playwright touch/a11y | `pnpm exec playwright test e2e/tests/web-shell-sidebar-touch-a11y.spec.ts --config e2e/playwright.web.config.ts` | **1/1 PASS** · 2,9 s · exit **0** (entorno permitió; `reuseExistingServer`) |
| audit-ui | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `Sidebar.tsx` + `layout.tsx` + `PlatformBrandMark.tsx` | **sin hallazgos** · exit **0** |
| Grep Gobierno | `navigation` / `shell` / `Sidebar` / `layout` | **0** en copy vivo. Specs solo niegan el término. |
| Grep z literal | `Sidebar.tsx` + `layout.tsx` | **0** `z-40` / `z-30` / `z-[` |
| Grep `text-[11px]` | `Sidebar.tsx` | **0** |
| Grep blur / navy | aside `Sidebar.tsx` | **0** `backdrop-blur` / `bg-white/95` / `bg-iwana-primary` |

### Hallazgos / residuales (no bloquean)

| Sev | Hallazgo | Dictamen |
| --- | --- | --- |
| — | Ningún CA-NAV ni CA-NAV-DS en FAIL | — |
| Cerrado (2026-08-11) | Residual Auth: `asideEyebrow` ya no es «Gobierno de plataforma»; default = `PLATFORM_UI_COPY.shell.workspace` (`Plataforma iWana`) | Cero «gobierno» en chrome de login |
| Observación | No hay `TopHeader.spec.tsx` en `apps/web`; hamburger/tildes cubiertos por E2E + consumo de `shell.*` | Aceptable · no bloquea G6 |

### Tests de barrera

Track C ya cubría copy, flatten, z, sólido, Escape y `title`. Track D añadió aserciones GO en `Sidebar.spec.tsx` para barra lima + `interactiveFocusClassName` en los cuatro nodos (CA-NAV-06 / CA-NAV-DS-05). Sin tests adicionales pendientes.

### Skills aplicadas (lectura)

`verification-before-completion` · `testing-patterns` · `e2e-testing-patterns` (+ `audit-ui.mjs` de `iwana-identity-ui-review`).

### Dictamen

**GO.** CA-NAV-01…06 y CA-NAV-DS-01…07 **PASS** con evidencia Jest + Playwright + audit-ui + grep. Specs UX/DS Congeladas respetadas. Navy no reabierto. Aside sólido. Cero «Gobierno» en nav/shell. Sin commit. Sin portal.

### Adenda residual Auth (2026-08-11)

El operador pidió cerrar el residual que G6 dejó fuera de alcance. `PlatformAuthExperience` toma el eyebrow del aside desde `PLATFORM_UI_COPY.shell.workspace` (`Plataforma iWana`). Barrera: `PlatformLoginExperience.spec.tsx` niega `/gobierno/i`.
