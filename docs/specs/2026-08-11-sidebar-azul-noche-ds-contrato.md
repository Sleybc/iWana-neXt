# SPEC — Sidebar azul noche (web + portal): contrato DS G2

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.0 — **Superado** (2026-08-11 · el operador rechazó el navy; rige de nuevo el sidebar blanco + BLOQUEO-3)  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**Prompt de ejecución:** [`docs/prompts/PROMPT-WEB-PORTAL-SIDEBAR-AZUL-NOCHE-v1.0.md`](../prompts/PROMPT-WEB-PORTAL-SIDEBAR-AZUL-NOCHE-v1.0.md) v1.0  
**Modo de esta entrega:** `iwana-identity-ui-review` · **modo diseño** (playbook de alineación; no es informe de auditoría)  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)  
**Export de foco:** `packages/ui/src/focus.ts` → `interactiveFocusClassName` (vía `@iwana/ui`)

> Cualquier modificación post-congelación se versiona como v1.1+ y debe notificarse a AI-FE-PLATFORM y AI-SR-QA vía el orquestador **antes** de ejecutarse.  
> Esto **aplica** Firma iWana ya aprobada (`firma-elements.md` §1 · `component-recipes.md` §10). **No** es token nuevo ni lenguaje visual inventado.

---

## 0. Veredicto de carril (protocolo §3bis.3)

### Resultado: **GO** — contrato congelado; desbloquea C-1 / C-2 / C-3

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Misma navegación, mismos destinos; solo chrome visual del aside |
| Contrato de datos / API | No | Sin backend |
| Boundary Modulith | No | Dos `Sidebar.tsx` locales; **no** se extrae primitive |
| Tokens de marca en `globals.css` | No | Solo composición de `iwana-primary` / `iwana-secondary` / blanco con opacidad ya existentes |

**No es NO-GO.** No hay `[BLOQUEO]`.

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Cambio contractual |
| --- | --- | --- |
| G2-W | `apps/web/src/components/layout/Sidebar.tsx` | Aside navy + receta de ítem / chrome textual |
| G2-P | `apps/portal/src/components/layout/Sidebar.tsx` | **La misma receta visual** (no el mismo archivo) |
| G2-C | Wordmark, eyebrow, close, group labels | Legibles sobre navy (solo color; sin cambio de flujo) |
| G2-I | Isotipo / sello | Conservar geometría vigente; placa solo si el contraste lo exige |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Extraer sidebar a `@iwana/ui` o fusionar los dos archivos | Firma §2.2 queda **fuera** de este G2 (exige ADR) |
| 2 | Tokens nuevos o hex de marca en `globals.css` | Marca = CTO; este G2 solo aplica tokens vivos |
| 3 | Inventar `ring-*` / `shadow-*` / foco paralelo | Único anillo: `interactiveFocusClassName` (+ adaptación §6) |
| 4 | Reintroducir fondo blanco del aside «para no tocar portal» | Deroga el aplazamiento, no la Firma |
| 5 | Lima como fondo del aside o como urgencia | Firma §3: lima = avance / acento de nav, nunca base |
| 6 | Copiar TailAdmin (`#465FFF`, Outfit, expand-on-hover, `z-99999`) | ADR-023 = shell/interacción, **cero paleta** |
| 7 | TopHeader, canvas `rounded-*`, MetricCard, portada de señal, G6.5/G7, sidebar de auth | Fuera del prompt |
| 8 | Flujos UX nuevos (ítems, grupos, destinos, colapso, drawer) | PROD-UX no reabre wireframe |
| 9 | `dark:bg-gray-{700-950}` | ADR-056 §2 |
| 10 | `tailwind.config.*` | CSS-first |

`core-components`: `Sidebar` **no** está implementado en `@iwana/ui` (roadmap). Este G2 **no** lo promueve.

---

## 2. Precedencia y derogaciones puntuales

Este archivo **no reescribe** los contratos anteriores. Deroga solo las filas citadas. El resto permanece.

### 2.1 Se deroga (este G2 manda)

| Artefacto | Sección / fila derogada | Qué deja de aplicar |
| --- | --- | --- |
| [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0 | **§7 BLOQUEO-3** («Sidebar azul noche — prohibido») | La prohibición de `bg-iwana-primary` en el aside |
| Mismo | **§1** «Qué NO entra», primer bullet (sidebar permanece `bg-white/95` / `dark:bg-dark-surface-2/95`) | El aplazamiento de fase del fondo claro |
| Mismo | **§8 checklist A**, ítem «El fondo del sidebar sigue siendo `bg-white/95` — **no azul**» | El check de no-azul |
| [`2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`](2026-08-10-web-shell-sidebar-carril-rapido-contrato.md) v1.0 | **§2** fila `bg-white` / `bg-white/95` \| Sidebar | Fondo claro del aside |
| Mismo | **§2** fila `dark:bg-dark-surface-2` / `/95` \| Sidebar dark | Dark del aside como elevación `dark-surface-2` |
| Mismo | **§4** «Regla de separación shell», bullet «Sidebar: `bg-white/95` (light) / `dark:bg-dark-surface-2/95`» | Esos dos fondos; **no** se deroga el canvas |
| [`2026-08-10-web-shell-sidebar-deuda-contrato.md`](2026-08-10-web-shell-sidebar-deuda-contrato.md) v1.1 §3 | **Solo las clases de color** del activo / inactivo / icono pensadas para sidebar claro (`bg-iwana-surface-soft`, `text-iwana-primary`, `text-gray-600`, `text-iwana-secondary-700` en light) | Se sustituyen por la receta §4 de este G2 |

### 2.2 Vigente — no se deroga

| Pieza | Dónde vive | Qué se conserva |
| --- | --- | --- |
| Barra lima (geometría + token) | Fase-1 §2 · Firma §3.1 · `firma-elements.md` §1 | `absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary` |
| Foco canónico | Carril rápido §3 · `focus.ts` | `interactiveFocusClassName`; sin sombra/ring extra |
| Canvas sin mordida | Carril rápido §4 · CA-SB-02 | `<main>` **sin** `lg:rounded-3xl` ni radio equivalente |
| Isotipo squircle (web) | Carril rápido §5 · CA-SB-03…05 | `h-10 w-11 rounded-xl`; img `h-7 w-7 object-contain`; sin ring |
| Targets ≥ 44 px | Deuda T1 · CA-T1 | `min-h-11` en nav / marca / close `h-11 w-11` |
| Activo plano | Deuda D1 | **Sin** sombra, **sin** ring decorativo, **sin** `rounded-2xl`; radio de control `rounded-xl` |
| Separación canvas | Carril rápido §4 (canvas) | Canvas sigue `bg-iwana-surface-soft` / `dark:bg-dark-surface` |

**Lectura de «sidebar atenuada» (desempate EM-ARCH):** atenuada = chrome dim (ítems inactivos a `text-white/70` sobre navy), **no** fondo blanco. El canvas claro sigue dominando.

---

## 3. Tokens citados (verificación 2026-08-11)

Todos existen en `packages/ui/src/styles/globals.css`. Se citan **por token**, nunca por hex de implementación.

| Token / utilidad | Uso en este G2 | Notas |
| --- | --- | --- |
| `bg-iwana-primary` | Fondo del `<aside>` en **ambos** modos | El navy **ya es oscuro**; no se añade `dark:bg-dark-surface-2` |
| `bg-white/10` | Tinte del ítem activo | Blanco a 10 % sobre navy |
| `text-white` | Label del activo; wordmark | 17,32:1 sobre `iwana-primary` — AAA |
| `text-white/70` | Ítem inactivo; eyebrow; group labels; close en reposo | **8,92:1** — AA y AAA de texto (ver §5) |
| `text-white/50` | Icono inactivo en reposo | 5,15:1 — AA texto; holgado para gráfico (1.4.11 ≥ 3:1) |
| `hover:bg-white/5` | Hover del inactivo | Tinte, no texto |
| `hover:text-white` / `group-hover:text-iwana-secondary` | Hover inactivo (label / icono) | — |
| `bg-iwana-secondary` | Barra lima del activo | Firma §1; **no** es fondo del aside |
| `text-iwana-secondary` | Icono del activo (y hover del inactivo) | 8,62:1 sobre navy — AA. **No** usar `-700` aquí: `-700` sobre navy = 3,64:1 (falla texto) |
| `bg-iwana-surface-soft` | Placa del squircle web | 16,48:1 sobre navy — se conserva |
| `rounded-xl` (`--radius-xl`) | Ítem de nav (control interno) | Deuda D1 vigente |
| `min-h-11` / `h-11 w-11` | Target táctil ≥ 44 px | Deuda T1 vigente |
| `interactiveFocusClassName` | Único anillo focus-visible | Adaptación de offset en §6 |
| `.portal-eyebrow` / `.portal-eyebrow-muted` | **Solo física tipográfica** (10 px, uppercase, tracking, semibold) | El **color** de esas clases **no** se usa sobre navy (§7) |

**No se añaden tokens.** No se toca `globals.css`. No se usa `iwana-secondary-50` como fondo. No se usa `from-iwana-primary to-iwana-secondary` en el aside (no es progreso).

### Dark

El aside permanece `bg-iwana-primary` bajo `.dark`. **Prohibido** `dark:bg-dark-surface-2`, `dark:bg-dark-surface-2/95` o `dark:bg-gray-*` en el `<aside>`.

Los `dark:` de receta clara (p. ej. `dark:text-gray-400`, `dark:bg-dark-surface-3` del ítem, `dark:bg-iwana-secondary-400` de la barra) **sobran** sobre navy y se retiran del aside: el chrome no cambia de familia al activar dark.

---

## 4. Anatomía canónica

### 4.1 Árbol

```text
<aside>                          bg-iwana-primary · h-screen · col
  ├── header
  │     ├── Link marca           squircle/sello + wordmark + eyebrow (web)
  │     ├── Link marca colapsado solo marca (lg)
  │     └── button close         mobile · h-11 w-11
  └── nav
        └── grupo*
              ├── group label    oculto si colapsado
              └── Link ítem*     min-h-11 rounded-xl
                    ├── span barra lima     solo isActive · aria-hidden
                    ├── Icon
                    └── label               oculto si colapsado
```

Anchos, `z-*`, colapso `lg:w-[90px]` / `lg:w-[290px]`, drawer mobile y destinos de nav **no cambian**.

### 4.2 Aside

```
bg-iwana-primary
```

- Sólido. **Sin** `bg-white`, `bg-white/95`, `backdrop-blur`, `supports-[backdrop-filter]:bg-white/85`.
- **Sin** `dark:bg-dark-surface-2` ni `/95`.
- Borde: se conserva `border-r border-transparent` (sin inventar borde lima ni blanco).

### 4.3 Ítem — base compartida (activo e inactivo)

```
group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150
```

+ `interactiveFocusClassName` (siempre) + adaptación §6.

Portal alinea el radio a `rounded-xl` (hoy `rounded-lg` en varios nodos): el control de nav es `xl` (D1 vigente).

### 4.4 Ítem activo

```
relative bg-white/10 font-medium text-white
```

Barra (primer hijo, `aria-hidden="true"`):

```
absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary
```

Icono activo:

```
text-iwana-secondary
```

**Prohibido en el activo:** `shadow-*`, `ring-*` decorativo, `rounded-2xl`, `bg-iwana-surface-soft`, `bg-iwana-primary-50`, `text-iwana-primary`, `text-iwana-secondary-700`.

### 4.5 Ítem inactivo

```
text-white/70 hover:bg-white/5 hover:text-white
```

Icono inactivo:

```
text-white/50 group-hover:text-iwana-secondary
```

### 4.6 Ítem disabled (solo portal)

Rutas futuras (`aria-disabled`, no navegables):

```
flex min-h-11 cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/40
```

Icono y badge «Próximamente»: `text-white/40` / placa `bg-white/10 text-white/70`. Sin hover de acento. WCAG 1.4.3: componente inactivo — sin umbral de contraste de texto.

### 4.7 Clases canónicas (resumen FE)

```tsx
// aside
className={cn('…layout existente…', 'bg-iwana-primary')}

// Link nav
className={cn(
  'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150',
  isActive
    ? 'relative bg-white/10 font-medium text-white'
    : 'text-white/70 hover:bg-white/5 hover:text-white',
  interactiveFocusClassName,
  'dark:focus-visible:ring-offset-white', // §6
)}
```

---

## 5. Contraste (cálculo)

Método: composición sRGB (`C = fg·α + bg·(1−α)`) sobre el DEFAULT de `iwana-primary`, luego ratio WCAG 2.x. Valores del token leídos de `globals.css` el 2026-08-11. **No se duplica hex en este contrato.**

| Par (token / receta) | Ratio | Umbral | Veredicto |
| --- | --- | --- | --- |
| `text-white` sobre `iwana-primary` | **17,32:1** | 4,5:1 (texto) | AAA |
| `text-white/70` sobre `iwana-primary` | **8,92:1** | 4,5:1 | **AA + AAA — se conserva `/70`** |
| `text-white/80` sobre `iwana-primary` | 11,34:1 | 4,5:1 | Reserva; **no se usa** (innecesaria) |
| `text-white/50` (icono off) sobre `iwana-primary` | 5,15:1 | 3:1 gráfico / 4,5:1 texto | AA |
| `text-iwana-secondary` (icono on) sobre `iwana-primary` | 8,62:1 | 3:1 gráfico | AA |
| `text-iwana-secondary-700` sobre `iwana-primary` | 3,64:1 | 4,5:1 | **No usar** como texto/icono sobre navy |
| `bg-iwana-surface-soft` sobre `iwana-primary` (placa) | 16,48:1 | 3:1 UI | Conservar squircle web |
| `dark-surface-3` sobre `iwana-primary` | 1,21:1 | 3:1 UI | **Retirar** del squircle sobre navy |
| `bg-white/10` como placa de marca | 1,32:1 | 3:1 UI | Insuficiente como placa; reservado al tinte del ítem |
| `dark-surface-2` (offset foco `.dark`) sobre `iwana-primary` | 1,09:1 | 3:1 indicador | Falla — ver §6 |
| Color de `.portal-eyebrow-muted` (`text-gray-500`) sobre navy | 3,58:1 | 4,5:1 | Falla — ver §7 |
| Color de `.portal-eyebrow` (`text-iwana-secondary-700`) sobre navy | 3,64:1 | 4,5:1 | Falla — ver §7 |

**Decisión de opacidad del inactivo:** `/70` supera 4,5:1 (8,92:1). No se sube a `/80`.

**Lima DEFAULT como icono sobre navy:** la regla «texto lima siempre `-700+`» aplica a **superficies claras**. Sobre `iwana-primary` el DEFAULT es el acento correcto (`firma-elements.md` §1).

---

## 6. Foco

Contrato vigente: consumir `interactiveFocusClassName` **sin** sombra ni ring extra.

```typescript
// packages/ui/src/focus.ts — no modificar en este G2
export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2';
```

Sobre `bg-iwana-primary` el anillo `ring-iwana-primary` coincide con el fondo: el indicador visible es el **offset**.

| Modo | Offset de la constante | Ratio vs navy | Acción |
| --- | --- | --- | --- |
| Claro (sin `.dark`) | `ring-offset-white` | 17,32:1 | Suficiente |
| `.dark` | `ring-offset-dark-surface-2` | **1,09:1** | Insuficiente (1.4.11 / 2.4.13) |

**Adaptación AA (identidad vs accesibilidad → prevalece accesibilidad):** en **todos** los interactivos del aside (links de nav, links de marca, botón cerrar), FE añade **solo**:

```
dark:focus-visible:ring-offset-white
```

No se modifica `focus.ts`. No se inventa anillo lima ni `ring-white`. El lima no es foco.

Nodos obligados (paridad carril rápido CA-SB-01 + portal):

| Nodo | Apps |
| --- | --- |
| Cada `<Link>` / control de ítem de nav | web + portal |
| `<Link>` de marca expandida | web + portal |
| `<Link>` de marca colapsada | web + portal |
| `<button>` cerrar menú mobile | web + portal |

Ítems `disabled` del portal no son tabulables.

---

## 7. Chrome textual sobre navy

No se cambian copy, jerarquía ni destinos. Solo el color para llegar a AA.

| Pieza | Receta sobre navy | Prohibido |
| --- | --- | --- |
| Wordmark (nombre de producto / tenant) | `text-white` + peso/tamaño **existentes** | `text-iwana-primary` (invisible sobre navy) |
| Eyebrow de marca (web: workspace) | Física del eyebrow del sistema + **`text-white/70`** | Color nativo de `.portal-eyebrow` o `.portal-eyebrow-muted` |
| Group labels | Misma física (10–12 px, uppercase, semibold, tracking) + **`text-white/70`**; ocultos si colapsado | `text-gray-600` / `text-gray-500` / lima `-700` |
| Close mobile | `text-white/70 hover:text-white` + `h-11 w-11` + foco §6; icono `X` `w-5 h-5` intacto | `text-gray-500` / hover a `iwana-primary` |

Implementación del eyebrow: o bien `portal-eyebrow-muted text-white/70` con la utilidad de color **después** y ganando la cascada, o bien las clases tipográficas explícitas + `text-white/70`. QA verifica el color computado, no el nombre de la clase sola.

---

## 8. Isotipo / sello

### 8.1 Web — `PlatformBrandMark` (carril rápido P3)

Contraste de `bg-iwana-surface-soft` sobre `iwana-primary` = **16,48:1** → **se conserva el squircle**. No se rediseña el PNG. No se usa `bg-white/10` como placa.

Contenedor autorizado sobre navy (ambas variantes, expandido y colapsado):

```
flex h-10 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft
```

Imagen: `h-7 w-7 object-contain`.

**Se retira** `dark:bg-dark-surface-3` del squircle **cuando el aside es navy** (1,21:1, no separa). No se reintroduce ring.

Si FE extrae el cambio al mark compartido con TopHeader: el header **no** es navy; no ampliar alcance a TopHeader en este G2. Preferir override local en el Sidebar (className del contenedor) o una prop de contexto `onNavy` **solo si** no toca TopHeader. Ante duda: override local en el aside, mark intacto para el header.

### 8.2 Portal — `TenantSeal`

No se unifica con `PlatformBrandMark` (fuera de alcance; sello de tenant ≠ isotipo de plataforma).

- Fallback de iniciales (`bg-iwana-secondary` + `text-iwana-primary`): contraste de placa lima sobre navy = 8,62:1 — **se deja**.
- PNG del sello: no rediseñar. Si el asset transparente queda ilegible sobre navy, receta **mínima** en el wrapper: `bg-white/10` + `rounded-xl`. No forzar squircle 40×44 de plataforma sobre el sello.

---

## 9. Estados requeridos

| Estado | Receta | Notas |
| --- | --- | --- |
| **Default** (inactivo) | §4.5 | Label `/70`, icono `/50` |
| **Hover** | `hover:bg-white/5 hover:text-white`; icono `group-hover:text-iwana-secondary` | 150 ms, solo color |
| **Active** (ruta actual) | §4.4 | Tinte + barra + icono lima + `font-medium` — no solo color (1.4.1) |
| **Focus-visible** | §6 | Offset blanco también en `.dark` |
| **Disabled** | §4.6 | Solo portal; no hover de acento |
| **Collapsed** (`lg:w-[90px]`) | Ocultar wordmark, eyebrow, group labels y labels de ítem; iconos + squircle/sello + barra lima del activo | Targets `min-h-11` intactos; squircle no desborda (CA-SB-05 vigente) |
| **Mobile drawer** | Misma receta navy; close §7; anchos/inert/foco inicial del portal **sin cambio de flujo** | Viewport ~375 px |
| **Dark** | Aside sigue `bg-iwana-primary`; mismas clases de ítem; squircle web sin `dark-surface-3` | No `dark-surface-2` en el aside |
| **Loading / skeleton** | N/A | Nav estática de configuración |
| **Empty / error / success / readonly** | N/A | Fuera del chrome de nav |

---

## 10. Criterios de aceptación (serie CA-AN)

Verificables por grep, cómputo de clases o captura. Owner de verificación: AI-SR-QA.

| ID | Criterio |
| --- | --- |
| **CA-AN-01** | El `<aside>` de web y de portal usa `bg-iwana-primary`. **Grep 0** en esos archivos de `bg-white/95`, `supports-[backdrop-filter]:bg-white/85` y `dark:bg-dark-surface-2` aplicados al aside |
| **CA-AN-02** | Ítem activo: `relative` + `bg-white/10` + `font-medium` + `text-white`. **Grep 0** de `shadow-*`, `ring-1 ring-inset` y `rounded-2xl` en el estado activo |
| **CA-AN-03** | Barra lima del activo: `absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary` + `aria-hidden` |
| **CA-AN-04** | Icono activo: `text-iwana-secondary` (DEFAULT). **Grep 0** de `text-iwana-secondary-700` en iconos del aside |
| **CA-AN-05** | Ítem inactivo: `text-white/70 hover:bg-white/5 hover:text-white`; icono `text-white/50 group-hover:text-iwana-secondary` |
| **CA-AN-06** | Todo interactivo del aside (nav, marca expandida/colapsada, close) incluye `interactiveFocusClassName` **y** `dark:focus-visible:ring-offset-white` |
| **CA-AN-07** | Ítems de nav: `rounded-xl` + `min-h-11`. Close: `h-11 w-11`. Links de marca: `min-h-11` |
| **CA-AN-08** | Wordmark `text-white`. Eyebrow y group labels computan `text-white/70` (no `gray-500`/`gray-600`/`iwana-primary`/`iwana-secondary-700`). Close: `text-white/70 hover:text-white` |
| **CA-AN-09** | Web: squircle `h-10 w-11 rounded-xl` + `bg-iwana-surface-soft` **sin** `dark:bg-dark-surface-3` en el aside; img `h-7 w-7 object-contain`; sin ring. Portal: `TenantSeal` sin rediseño de PNG |
| **CA-AN-10** | Bajo `.dark`, el aside sigue `bg-iwana-primary` (no cambia a `dark-surface-*`) |
| **CA-AN-11** | Receta visual idéntica en web y portal. **Grep 0** de un `Sidebar` nuevo en `packages/ui` |
| **CA-AN-12** | Canvas del layout protegido **sin** `lg:rounded-3xl` (CA-SB-02 vigente; regresión) |
| **CA-AN-13** | Portal disabled: `cursor-not-allowed` + `text-white/40` + `aria-disabled`; no navega |
| **CA-AN-14** | Colapsado: labels/eyebrow/grupos ocultos; activo sigue mostrando barra lima. Mobile ~375: drawer navy + close con foco §6 |
| **CA-AN-15** | **Grep 0** de paleta TailAdmin, `z-99999`, expand-on-hover CSS, y de `bg-iwana-secondary` como fondo del aside |

---

## 11. Checklist DS (cierre AI-DS-OWNER · modo diseño)

- [x] Pantalla clasificada: **shell / navegación** (no dashboard de datos). Tarea: orientar y cambiar de módulo.
- [x] Receta `component-recipes.md` §10 + firma §1 aplicadas (barra lima + sidebar dim sobre navy).
- [x] ≥2 elementos de firma con función: (1) barra lima de nav activa; (2) dúo navy→lima como estado (activo = lima).
- [x] Lima ≠ urgencia, ≠ fondo del aside.
- [x] Tokens verificados en `globals.css`; cero hex de marca en implementación.
- [x] Contraste calculado; `/70` se conserva (8,92:1).
- [x] Estados default / hover / active / focus / disabled / collapsed / mobile cubiertos.
- [x] Foco canónico + adaptación AA del offset en dark documentada.
- [x] Targets ≥ 44 px y activo plano vigentes.
- [x] Isotipo: squircle conservado (placa `iwana-surface-soft` basta); sin rediseño PNG.
- [x] Duplicación: receta compartida, **sin** primitive nueva (core-components: Sidebar no existe en `@iwana/ui`).
- [x] Derogaciones puntuales citadas por ruta + sección; archivos padre no reescritos.
- [ ] Script `audit-ui.mjs` sobre los `Sidebar.tsx` — corre **después** de C-1/C-2 (FE). Hallazgos `dark:bg-gray-*` / hex de marca / `tailwind.config.*` = defecto.

---

## 12. Archivos esperados (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/layout/Sidebar.tsx` | Receta §4–§8 + specs Jest |
| `apps/portal/src/components/layout/Sidebar.tsx` | La misma receta + specs Jest |
| `apps/web/src/components/layout/PlatformBrandMark.tsx` | Solo si hace falta retirar `dark:bg-dark-surface-3` **sin** romper TopHeader; si hay riesgo, override local |
| `apps/portal/src/components/layout/TenantSeal.tsx` | No tocar salvo wrapper mínimo §8.2 |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** |
| Layouts / TopHeader / canvas | **No tocar** (CA-AN-12 es regresión, no cambio) |

---

## 13. Firma

| Rol | Acción | Fecha |
| --- | --- | --- |
| AI-DS-OWNER | Emite y congela contrato v1.0 — veredicto **GO** · sin `[BLOQUEO]` | 2026-08-11 |
| AI-FE-PLATFORM | Implementa solo contra esta ruta + versión | Pendiente (C-1 / C-2 / C-3) |
| AI-SR-QA | Verifica CA-AN-01…15 | Pendiente (D-1…D-3) |
| AI-EM-ARCH | Consolida G2; actualiza informe vivo §10.2 | Pendiente |

**Artefacto congelado:** `docs/specs/2026-08-11-sidebar-azul-noche-ds-contrato.md` v1.0
