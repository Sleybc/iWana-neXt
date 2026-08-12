# UX spec — Menú lateral / nav (`apps/web`)

**Versión:** 1.0  
**Estado:** Congelado  
**Fecha:** 2026-08-11  
**Propietario:** AI-PROD-UX  
**Alcance:** chrome de navegación de `apps/web` (`Sidebar` + copy `navigation` / `shell` que el shell ya consume). **No aplica a** `apps/portal`.  
**Prompt:** [`PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md)  
**Plan:** [`2026-08-11-web-sidebar-alineacion.md`](../plans/2026-08-11-web-sidebar-alineacion.md)  
**Informe:** [`INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md) — matriz + CA-NAV-01…06  
**Contrato DS hermano:** [`2026-08-11-web-sidebar-nav-ds-contrato.md`](2026-08-11-web-sidebar-nav-ds-contrato.md) (track B en paralelo; visual / z / sólido)  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md) — navy **Superado**; sidebar blanco vigente (BLOQUEO-3). No reabrir.  
**Antecedente táctil (no reabrir):** [`2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`](2026-08-10-web-shell-sidebar-carril-rapido-contrato.md) — CA-SB / CA-T1 **GO**.  
**Copy vivo:** [`apps/web/src/lib/platform-ui-copy.ts`](../../apps/web/src/lib/platform-ui-copy.ts) → `navigation` / `navigationGroups` / `shell`  
**Vocabulario:** skill `system-vocabulary-review` (tenant → empresa; auditoría → historial de cambios; cero jerga de control plane)

### Changelog

| Ver | Estado | Cambio |
| --- | --- | --- |
| **1.0** | **Congelado** | Alineación post-auditoría 79/100: lista plana de 5 destinos; cero Gobierno; copy literal; CA-NAV-01…06. |

Esta spec **congela** la experiencia de navegar. No rediseña destinos, no pide API, no define tokens ni primitives. FE no implementa hasta que el contrato DS hermano esté **Congelado**.

---

## 1. Persona / tarea

**Persona:** operador de plataforma (`SYSTEM_ADMIN`) en la consola `apps/web`.

**Tarea (un ciclo, sin wizard):**

1. **Sabe dónde está** (ítem activo reconocible + landmark de nav).
2. **Llega en un toque** a uno de los cinco destinos vigentes.
3. **Abre / cierra** el menú en viewport estrecho; **expande / contrae** el panel en desktop.

No hay empty de «primera vez» ni loading de parque: el menú siempre está. El daño a remediar es **vocabulario y arquitectura de información** (grupos Operacion/Gobierno), no la tarea de navegar.

---

## 2. Arquitectura de información

Lista **plana**. Una sola lista. **Cinco** ítems. **Sin** grupos. **Sin** eyebrows Operacion / Gobierno. **Sin** separador (default EM-ARCH; B no introduce uno en v1.0).

```text
375 (drawer abierto)               lg+ expandido                 lg+ colapsado
─────────────────────              ────────────────────          ────────────
Marca  ·  Cerrar menú              Marca + nombre de producto    Isotipo (ir al centro)
Centro de control                  Centro de control             icono + title
Empresas                           Empresas                      icono + title
Usuarios internos                  Usuarios internos             icono + title
Historial de cambios               Historial de cambios          icono + title
Plataforma                         Plataforma                    icono + title
```

Viewport estrecho cerrado: el hamburger del TopHeader usa `Abrir menú`. El layout del TopHeader **no se rediseña**; solo consume `shell.*`.

### Orden canónico (inmutable)

| # | Label (literal) | Ruta | Clave copy |
| --- | --- | --- | --- |
| 1 | Centro de control | `/dashboard` | `navigation.home` |
| 2 | Empresas | `/tenants` | `navigation.tenants` |
| 3 | Usuarios internos | `/users` | `navigation.users` |
| 4 | Historial de cambios | `/audit-logs` | `navigation.audit` |
| 5 | Plataforma | `/settings` | `navigation.settings` |

Mismo orden que hoy. **No** reordenar. **No** añadir destinos. **No** quitar destinos. `navigation.profile` (`Mi cuenta`) **no** entra al sidebar (vive en el chrome de cuenta; fuera de este alcance).

### Qué se retira

| Pieza | Motivo |
| --- | --- |
| Grupo «Operacion» / «Operación» | Ruido de IA con 5 ítems; corte por arquitectura, no por tarea |
| Grupo «Gobierno» | Jerga de control plane; contradice CA-SET-09 (settings ya la retiró) |
| Eyebrows de grupo | Mudos en colapsado; carga cognitiva en expandido |
| Separador antes de Plataforma | Default EM-ARCH: **sin** separador |

Historial de cambios es trabajo diario (el centro de control ya ofrece «Abrir historial»). No se aísla como «gobierno».

---

## 3. Copy canónico (literal)

Sentence case. Fuente: `PLATFORM_UI_COPY`. Cero strings de grupo o landmark sueltos en JSX. Congelado desde la matriz del informe + decisiones EM-ARCH (no reabrir).

### Destinos y marca (sin cambio — CA-NAV-04)

| Zona | Texto exacto |
| --- | --- |
| Ítem home | Centro de control |
| Ítem tenants | Empresas |
| Ítem users | Usuarios internos |
| Ítem audit | Historial de cambios |
| Ítem settings | Plataforma |
| Eyebrow de producto | Plataforma iWana |
| Ir al centro (colapsado) | Ir al centro de control |
| Expandir (desktop) | Expandir panel lateral |
| Contraer (desktop) | Contraer panel lateral |

«Usuarios internos» **se conserva**: distingue cuentas de consola frente a suscriptores de empresa. No es jerga. Acortar a «Usuarios» perdería esa frontera (informe: señal refutada).

### Shell — copy que cambia

| Zona | Deja de ser | Texto exacto congelado |
| --- | --- | --- |
| `shell.workspaceSubtitle` | Operacion y gobierno interno | Consola de plataforma. |
| `shell.openMenu` | Abrir menu | Abrir menú |
| `shell.closeMenu` | Cerrar menu | Cerrar menú |
| `shell.navLandmark` | hardcoded «Navegación principal» | Navegación principal |
| `shell.menuLandmark` | hardcoded «Menú principal» | Menú principal |

`workspaceSubtitle` lleva **punto final**. Visible en TopHeader xl+; no es rediseño de header.

### Retirado (no reintroducir)

| Texto | Dónde no puede aparecer |
| --- | --- |
| Gobierno / gobierno | Nav, `aria-label`, `workspaceSubtitle`, eyebrows, `navigationGroups` renderizado |
| Operacion / Operación | Nav visible (el grupo desaparece; no hay label que acentuar) |
| Operacion y gobierno interno | `workspaceSubtitle` y cualquier chrome de shell |

`navigationGroups` deja de alimentar la UI. Si las claves quedan huérfanas en el catálogo, FE las retira; no se pintan «por si acaso».

Auth `Gobierno de plataforma` (`PlatformAuthExperience`) queda **fuera de alcance** (misma raíz; otro prompt).

---

## 4. Flujo y estados de experiencia

Camino feliz: el operador elige un destino → llega a la ruta → el ítem queda activo (`aria-current="page"`). Un toque. Sin confirmación.

| Estado | Qué ocurre | Copy / señal |
| --- | --- | --- |
| **Desktop expandido** | Labels visibles; marca con eyebrow `Plataforma iWana` + nombre de producto | Lista plana de 5 |
| **Desktop colapsado** | Labels ocultos; isotipo con `Ir al centro de control`; cada ítem lleva `title` = label | Misma lista, misma orden |
| **Mobile cerrado** | Drawer fuera de vista; hamburger | `Abrir menú` |
| **Mobile abierto** | Drawer a 290 px; velo; botón X | `Cerrar menú`. Escape cierra. Clic en velo cierra. |
| **Ítem activo** | Una sola página corriente; barra lima + tinte (contrato DS / Firma #1; no se redefine aquí) | `aria-current="page"` |
| **Ítem inactivo** | Destino alcanzable | Label canónico |
| **Persistencia desktop** | El colapso se recuerda entre visitas (comportamiento vivo; no se cambia) | — |

No hay empty ni skeleton de nav. No hay segundo menú paralelo.

### Interacción que **no** se reabre (carril táctil GO)

- Targets ≥ 44 px (`min-h-11`) en ítems, marca y cierre.
- Foco visible canónico (`interactiveFocusClassName`).
- Escape cierra el drawer mobile.
- `title` en ítems cuando el panel está colapsado.
- Barra lima en el activo.

Detalle visual (z-index, fondo sólido, anchos 90/290) → contrato DS hermano. Esta spec no cita tokens.

---

## 5. Accesibilidad (WCAG 2.2 AA)

- Landmark del `aside`: `Navegación principal` (`shell.navLandmark`).
- Landmark del `<nav>`: `Menú principal` (`shell.menuLandmark`).
- Hamburger / X: `Abrir menú` / `Cerrar menú` (tilde; mismos strings en E2E).
- Ítem activo: `aria-current="page"`; el color no es la única señal (barra lima + texto).
- Colapsado: el nombre accesible del ítem sigue siendo el label (visible o vía `title`); no se sustituye por el nombre del icono.
- Contraste y foco: tokens reales del DS; si identidad y a11y chocan, prevalece a11y y se documenta en el contrato DS.
- No se reabre el focus trap del drawer (informe § Por verificar): Escape + overlay + GO táctil bastan en este carril.

---

## 6. Criterios de aceptación (CA-NAV)

Transcritos del informe. Todos deben PASS en G6. No reenumerar. IDs CA-SB / CA-T1 / CA-SET no se reutilizan.

| ID | Criterio | Nota de congelación |
| --- | --- | --- |
| **CA-NAV-01** | Cero «Gobierno» / «gobierno» en copy visible o `aria-label` de navegación y shell (`navigationGroups`, `workspaceSubtitle`). | `workspaceSubtitle` = `Consola de plataforma.` |
| **CA-NAV-02** | `Operación`, `Abrir menú`, `Cerrar menú` con tilde en `PLATFORM_UI_COPY`; E2E `web-shell-sidebar-touch-a11y` y specs que afirmen el string ASCII actualizan el canon. | Los grupos se retiran (CA-NAV-03): no hay label «Operación» visible. Sobrevive el tilde de **Abrir menú** / **Cerrar menú**. No reintroducir el grupo solo para acentuarlo. |
| **CA-NAV-03** | Sidebar de `apps/web` con **una** lista de los cinco destinos vigentes (mismo orden y mismas rutas). Sin eyebrows de grupo Operacion/Gobierno. Separador mudo opcional antes de Plataforma. | **Default congelado: sin separador.** B no añade uno en v1.0. |
| **CA-NAV-04** | «Usuarios internos», «Centro de control», «Empresas», «Historial de cambios», «Plataforma», «Plataforma iWana» permanecen. Tests de destinos no cambian de sentido. | Destinos sin cambio. |
| **CA-NAV-05** | Copy de nav/shell sale de `PLATFORM_UI_COPY` (incl. landmarks si se mueven). Cero strings de grupo en JSX. | Landmarks **sí** se mueven: `shell.navLandmark`, `shell.menuLandmark`. |
| **CA-NAV-06** | No regresión táctil/foco: `min-h-11`, `interactiveFocusClassName`, `aria-current="page"`, `title` en colapsado, Escape cierra mobile, barra lima en activo. **No reabre CA-SB/CA-T1.** | Intactos. |

CA-NAV-DS-01…03 son del track B (contrato DS hermano). Esta spec no los redefine. DS-03 deja de ser opcional por decisión EM-ARCH #9 (sólido); lo congela B.

---

## 7. Vocabulario (checklist `system-vocabulary-review`)

| Término interno | En producto (esta superficie) |
| --- | --- |
| tenant | Empresas |
| auditoría / audit-logs | Historial de cambios |
| settings | Plataforma |
| control plane / gobernanza | **No se dice.** Subtítulo = Consola de plataforma. |
| MFA / payload / schema | No aparecen en este chrome |

Público: operador de plataforma, no arquitecto. Tono: profesional, sentence case, español con tildes. «Usuarios internos» es canon de consola, no enum crudo.

Tests y E2E esperan el vocabulario **nuevo** (`Abrir menú` / `Cerrar menú` / `Consola de plataforma.`). El string ASCII sin tilde deja de ser contrato.

---

## 8. Fuera de alcance

| Fuera | Motivo |
| --- | --- |
| Sidebar de `apps/portal` | Prompt §5. Volumen de ítems distinto; no copiar grupos MENÚ/ADMINISTRACIÓN |
| Nuevas rutas o reorden de destinos | CA-NAV-04 |
| Navy / sidebar azul noche | Contrato Superado; BLOQUEO-3 blanco vigente |
| Auth «Gobierno de plataforma» | Misma raíz; otro prompt |
| Rediseño de TopHeader (layout) | Solo copy `shell.*` que ya consume |
| Extraer Sidebar a `@iwana/ui` | Firma §2.2 sigue fuera |
| API, OpenAPI, migraciones | Prompt §1.3 |
| Tokens, paleta, primitives nuevas | Dueño B; 0 primitives en este carril |
| Focus trap Tab del drawer mobile | Informe § Por verificar; no se eleva en este G2 |

---

## Decisiones no reabiertas (EM-ARCH)

| # | Decisión |
| --- | --- |
| 1 | **Lista plana** de 5 ítems, mismo orden: Centro de control → Empresas → Usuarios internos → Historial de cambios → Plataforma. **Sin** grupos Operacion/Gobierno. **Sin** separador (default). |
| 2 | Cero «Gobierno» / «gobierno» en nav y `shell.workspaceSubtitle`. |
| 3 | `workspaceSubtitle` = `Consola de plataforma.` |
| 4 | `Abrir menú` / `Cerrar menú` con tilde. Actualizar E2E `web-shell-sidebar-touch-a11y`. |
| 5 | Ítems de destino **sin cambio** (CA-NAV-04). |
| 6 | Landmarks a `PLATFORM_UI_COPY.shell` (`navLandmark`, `menuLandmark`). |

(Decisiones 7–10 del prompt — z, `text-[11px]`, sólido, no portal/TopHeader layout — son de B/C; esta spec las respeta y no las reabre.)

---

## Solicitud a DS-OWNER

Ningún patrón nuevo. Ninguna primitive. El flatten cabe en la composición viva del `<nav>`.

B congela en paralelo: z semántico, retiro de `text-[11px]` (absorbido al quitar grupos), aside sólido, barra lima intacta. **No** navy. **No** separador en v1.0.

---

*Congelado 2026-08-11 por AI-PROD-UX · v1.0. Track A del prompt ALINEACION-v1.0 (protocolo §3bis). Cita matriz + CA-NAV-01…06 del informe; copy literal; sin código ni tokens. Sin `[BLOQUEO]`.*
