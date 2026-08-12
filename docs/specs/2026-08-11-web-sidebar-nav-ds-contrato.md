# SPEC — Sidebar nav web: contrato DS (lista plana · aside sólido · z semántico)

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.0 — **Congelado · GO** (carril rápido §3bis.3)  
**Estado:** Congelado  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**Prompt de ejecución:** [`docs/prompts/PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md) v1.0  
**Informe de hallazgos:** [`INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md) — CA-NAV-DS-01…03 (z, 11px, sólido)  
**Contrato UX (Track A, paralelo):** [`2026-08-11-web-sidebar-nav-ux-spec.md`](2026-08-11-web-sidebar-nav-ux-spec.md) — copy y destinos; este archivo **no** congela literales  
**Modo de esta entrega:** `iwana-identity-ui-review` · **modo diseño** (playbook de alineación; no es informe de auditoría)  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)  
**Export de foco:** `packages/ui/src/focus.ts` → `interactiveFocusClassName` (vía `@iwana/ui`)

> Cualquier modificación post-congelación se versiona como v1.1+ y debe notificarse a AI-FE-PLATFORM y AI-SR-QA vía el orquestador **antes** de ejecutarse.  
> **0 primitives nuevas.** **No** navy. **No** extraer Sidebar a `@iwana/ui`.

---

## 0. Veredicto de carril (protocolo §3bis.3)

### Resultado: **GO** — contrato congelado; desbloquea Track C

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Mismos 5 destinos y mismas rutas (CA-NAV-04). Solo composición del chrome de nav. |
| Contrato de datos / API | No | Sin endpoints, OpenAPI ni migraciones. |
| Boundary Modulith | No | Solo `apps/web` `Sidebar.tsx` + velo en `layout.tsx`. Portal **fuera**. |
| Tokens de marca en `globals.css` | No | Solo composición de tokens vivos (`bg-white`, `dark-surface-2`, `--z-drawer`, `--z-overlay`). Cero tokens nuevos. |

**Justificación:** z literales → tokens ADR-075; `text-[11px]` absorbido al retirar eyebrows de grupo; blur residual → sólido (paridad portal). No toca marca, stack ni alcance. Navy **no** reabre (contrato Superado + BLOQUEO-3).

**No es GO con ajustes:** las decisiones ambiguas quedan resueltas aquí (sólido obligatorio; separador mudo **no**; lista plana de un `<ul>`).  
**No es NO-GO.** Sin `[BLOQUEO]`.

### Condiciones de stop

- Reintroducir `bg-iwana-primary` en el aside → STOP + escalar (navy Superado; no es carril rápido).
- Extraer Sidebar a `@iwana/ui` o tocar `apps/portal` → STOP + ADR / nuevo prompt.
- Editar `globals.css` o `focus.ts` → STOP + escalar EM-ARCH.
- Inventar foco, sombra o ring paralelo al ítem activo → defecto bloqueante (invierte D1).
- Añadir eyebrow de grupo u `hr` mudo «de paso» → defecto (invierte §4.4 / CA-NAV-DS-04).

---

## 1. Alcance

### Qué SÍ entra

| ID | Hallazgo | Superficie | Cambio contractual |
| --- | --- | --- | --- |
| DS-01 | Z literales (ADR-075) | `Sidebar.tsx` aside · `layout.tsx` velo | `z-(--z-drawer)` / `z-(--z-overlay)` |
| DS-02 | `text-[11px]` sobre `.portal-eyebrow-muted` | Eyebrows de grupo | **Absorbido:** se retiran los grupos; no queda override |
| DS-03 | Glass/blur residual en chrome estático | Aside | Sólido `bg-white` / `dark:bg-dark-surface-2`. **Entra** (ya no opcional) |
| DS-04 | Lista plana | `<nav>` | Un `<ul>`. Cero eyebrows de grupo. Default **sin** separador mudo |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Navy / `bg-iwana-primary` en el aside | Contrato [`2026-08-11-sidebar-azul-noche-ds-contrato.md`](2026-08-11-sidebar-azul-noche-ds-contrato.md) **Superado**; BLOQUEO-3 vigente |
| 2 | Extraer Sidebar a `@iwana/ui` | `core-components`: Sidebar es roadmap, no implementado. Firma §2.2 exige ADR |
| 3 | Tokens nuevos o hex de marca | Marca = CTO; este G2 solo compone tokens vivos |
| 4 | Inventar `ring-*` / `shadow-*` / foco paralelo | Único anillo: `interactiveFocusClassName`. Activo = D1 plano |
| 5 | Rediseñar barra lima, destinos, anchos 90/290, canvas, TopHeader layout | Intactos (carril táctil GO + deuda D1/T1) |
| 6 | Portal sidebar | Fuera del prompt (solo lectura de paridad: sólido + z) |
| 7 | Auth «Gobierno de plataforma» | Fuera de alcance |
| 8 | Congelar copy literal | Dueño Track A (UX spec). Este contrato consume `PLATFORM_UI_COPY` |
| 9 | `dark:bg-gray-{700-950}` · `tailwind.config.*` | ADR-056 §2 · CSS-first |
| 10 | `text-[11px]` en cualquier nodo del sidebar web | CA-NAV-DS-02; eyebrow de marca usa la primitive **sin** override |

---

## 2. Precedencia y derogaciones puntuales

Este archivo **no reescribe** los contratos anteriores. Deroga solo las filas citadas. El resto permanece.

### 2.1 Se deroga (este G2 manda)

| Artefacto | Sección / fila derogada | Qué deja de aplicar |
| --- | --- | --- |
| [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0 | **BLOQUEO-3** — solo las clases `bg-white/95` y `dark:bg-dark-surface-2/95` (+ blur) | Opacidad y blur del aside. **No** se deroga la prohibición de navy |
| [`2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`](2026-08-10-web-shell-sidebar-carril-rapido-contrato.md) v1.0 | **§2** filas `bg-white` / `bg-white/95` y `dark:bg-dark-surface-2` / `/95` del sidebar | Fondo translúcido del aside |
| Mismo | Cualquier mención de `backdrop-blur` / `supports-[backdrop-filter]:bg-white/85` en el aside | Glass residual del chrome estático |
| Código vivo `Sidebar.tsx` | Eyebrows de grupo + `navGroups` + `text-[11px]` | Arquitectura de 2 `<ul>` con rótulos Operacion/Gobierno |

### 2.2 Vigente — no se deroga

| Pieza | Dónde vive | Qué se conserva |
| --- | --- | --- |
| **Prohibición de navy** | Fase-1 BLOQUEO-3 (intención) · navy Superado | Aside **nunca** `bg-iwana-primary` |
| Barra lima (geometría + token) | Fase-1 §2 · Firma §3.1 · `firma-elements.md` §1 · D1 | `absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400` |
| Activo plano D1 | Deuda §3 | Tinte `bg-iwana-surface-soft` / `dark:bg-dark-surface-3`; **sin** sombra, **sin** ring decorativo, `rounded-xl` |
| Foco canónico | Carril rápido §3 · `focus.ts` | `interactiveFocusClassName` **sin** override de offset (aside claro; el offset de la constante ya es AA) |
| Targets ≥ 44 px | Deuda T1 · CA-T1 | `min-h-11` nav/marca; close `h-11 w-11` |
| Isotipo squircle | Carril rápido §5 · CA-SB-03…05 | `h-10 w-11 rounded-xl`; img `h-7 w-7 object-contain`; sin ring |
| Anchos | Código vivo + informe B PASS | `lg:w-[90px]` colapsado · `lg:w-[290px]` expandido / mobile |
| Canvas `lg:rounded-3xl` | Carril rápido §4 restaurado 2026-08-11 | CA-SB-02 **superado**; no se toca |
| Eyebrow de **marca** | `.portal-eyebrow-muted` en wordmark | Física 10 px del sistema; **no** es eyebrow de grupo |
| Escape mobile · `aria-current="page"` · `title` colapsado | Carril táctil GO | No se reabren CA-SB / CA-T1 |

**Receta `component-recipes.md` §10** (enmendada 2026-08-11): aside blanco / `dark-surface-2` + barra lima. El prototipo navy **no** se puntúa. Este contrato es la receta web vigente.

---

## 3. Tokens citados (verificación 2026-08-11)

Todos existen en `packages/ui/src/styles/globals.css`. Se citan **por token**, nunca por hex de implementación.

| Token / utilidad | Uso en este G2 | Notas |
| --- | --- | --- |
| `bg-white` | Fondo del `<aside>` light | Sólido. **Sin** `/95`, **sin** `backdrop-blur` |
| `dark:bg-dark-surface-2` | Fondo del `<aside>` dark | Elevación 1. **Sin** `/95` |
| `--z-drawer` (300) | Aside | Consumo: `z-(--z-drawer)`. ADR-075 §1 |
| `--z-overlay` (200) | Velo mobile | Consumo: `z-(--z-overlay)`. Orden 300 > 200 se conserva |
| `bg-iwana-surface-soft` | Tinte del ítem activo (light) + placa squircle | Superficie suave; lima ≠ fondo base |
| `dark:bg-dark-surface-3` | Tinte activo dark + placa squircle dark | Elevación 2 |
| `text-iwana-primary` | Label activo (light) · wordmark | AA/AAA sobre `iwana-surface-soft` |
| `text-iwana-secondary-700` | Icono activo light; hover icono inactivo light | Lima AA sobre claro (regla `-700+`) |
| `dark:text-iwana-secondary` | Icono activo dark | DEFAULT lima sobre `dark-surface-3` (AA gráfico) |
| `bg-iwana-secondary` / `dark:bg-iwana-secondary-400` | Barra lima | Decorativo, no texto |
| `rounded-xl` (`--radius-xl`) | Ítem de nav (control interno) | D1 vigente |
| `min-h-11` / `h-11 w-11` | Target táctil ≥ 44 px | T1 vigente |
| `interactiveFocusClassName` | Único anillo focus-visible | `focus.ts` — **no** modificar |
| `.portal-eyebrow-muted` | Solo eyebrow de **marca** (workspace) | 10 px del sistema; **prohibido** `text-[11px]` |

**No se añaden tokens.** No se toca `globals.css`. No se usa `iwana-secondary-50` como fondo del aside. No se usa `from-iwana-primary to-iwana-secondary` en el chrome (no es progreso). No se usa `.iwana-glass`.

### Z — ADR-075

En `apps/*/src` **prohibido z literal** (utilidad Tailwind u objeto `zIndex`). Este chrome migra:

| Nodo | Antes (deuda) | Después (este contrato) |
| --- | --- | --- |
| `<aside>` | `z-40` | `z-(--z-drawer)` |
| Velo mobile | `z-30` | `z-(--z-overlay)` |

El velo permanece `bg-black/50 lg:hidden`. No se cambia la semántica de click-para-cerrar.

---

## 4. Anatomía canónica

### 4.1 Árbol

```text
velo (layout, solo mobileOpen)     z-(--z-overlay) · bg-black/50 · lg:hidden
<aside>                            bg-white · dark:bg-dark-surface-2 · z-(--z-drawer)
  ├── header
  │     ├── Link marca             squircle + eyebrow workspace + wordmark
  │     ├── Link marca colapsado   solo squircle (lg)
  │     └── button close           mobile · h-11 w-11
  └── nav
        └── ul                     UNA lista · 5 ítems · gap-1 · sin eyebrow de grupo
              └── li*
                    └── Link       min-h-11 rounded-xl + interactiveFocusClassName
                          ├── span barra lima     solo isActive · aria-hidden
                          ├── Icon
                          └── label               oculto si colapsado
```

### 4.2 Aside

```
bg-white dark:bg-dark-surface-2
```

+ layout existente: `fixed left-0 top-0 flex h-screen flex-col overflow-y-hidden border-r border-transparent … lg:static lg:translate-x-0` + anchos 90/290 + transición.

**Prohibido en el aside:**

- `bg-white/95`, `bg-white/85`, `backdrop-blur`, `supports-[backdrop-filter]:…`
- `dark:bg-dark-surface-2/95`
- `bg-iwana-primary` (navy)
- `z-40`, `z-30`, `z-[…]` literales
- `.iwana-glass`

### 4.3 Velo mobile (`layout.tsx`)

```
fixed inset-0 z-(--z-overlay) bg-black/50 lg:hidden
```

`aria-hidden="true"`. Click cierra. **Grep 0** de `z-30` en este velo.

### 4.4 Lista plana — decisión DS (separador)

**Default: sin separador mudo.**

| Opción | Veredicto | Motivo |
| --- | --- | --- |
| Un `<ul>` de 5 ítems, mismo orden | **Obligatorio** | CA-NAV-03 · cinco destinos no justifican grupos |
| Eyebrows Operacion / Gobierno | **Prohibido** | P1 vocabulario + P3 `text-[11px]` absorbido |
| `<hr>` / `border-t` / spacer mudo antes de Plataforma | **No** | Recrearía el corte Operación/Gobierno sin label; en colapsado es ruido; 5 ítems no lo necesitan |

Si un G2 futuro crece destinos, se versiona este contrato. **No** copiar grupos del portal (volumen distinto).

Orden visual de ítems (destinos intactos; labels = Track A):

1. Centro de control  
2. Empresas  
3. Usuarios internos  
4. Historial de cambios  
5. Plataforma  

### 4.5 Ítem — base compartida (activo e inactivo)

```
group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150
```

+ `interactiveFocusClassName` (siempre) + `lg:justify-center lg:px-2` si colapsado.

### 4.6 Ítem activo (D1 intacto)

```
relative bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3 dark:text-white
```

Barra (primer hijo, `aria-hidden="true"`):

```
absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400
```

Icono activo:

```
text-iwana-secondary-700 dark:text-iwana-secondary
```

`aria-current="page"`.

**Prohibido en el activo:** `shadow-*`, `ring-*` decorativo, `rounded-2xl`, `bg-white/10` (receta navy Superada).

### 4.7 Ítem inactivo

```
text-gray-600 hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-100
```

Icono inactivo:

```
text-gray-400 group-hover:text-iwana-secondary-700 dark:text-gray-500 dark:group-hover:text-iwana-secondary
```

### 4.8 Marca y cierre (intactos salvo z/fondo del aside)

| Nodo | Receta |
| --- | --- |
| Squircle | Contrato P3 / D2: `h-10 w-11 rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3`; img `h-7 w-7 object-contain`; sin ring |
| Eyebrow workspace | `.portal-eyebrow-muted` **sin** `text-[11px]` |
| Wordmark | `text-sm font-semibold text-iwana-primary dark:text-white` |
| Close mobile | `flex h-11 w-11 …` + `interactiveFocusClassName`; icono `X` `w-5 h-5` intacto |

### 4.9 Clases canónicas (resumen FE)

```tsx
// aside
className={cn(
  'fixed left-0 top-0 z-(--z-drawer) flex h-screen flex-col overflow-y-hidden',
  'border-r border-transparent bg-white dark:border-transparent dark:bg-dark-surface-2',
  /* anchos / drawer / transición existentes */
)}

// velo (layout)
className="fixed inset-0 z-(--z-overlay) bg-black/50 lg:hidden"

// nav
<nav> {/* landmark desde PLATFORM_UI_COPY.shell — Track A */}
  <ul className="flex flex-col gap-1 px-2">
    {/* 5 <li> · cero <p> eyebrow · cero <hr> */}
  </ul>
</nav>

// Link nav
className={cn(
  'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
  isActive
    ? 'relative bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3 dark:text-white'
    : 'text-gray-600 hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-100',
  desktopCollapsed && 'lg:justify-center lg:px-2',
  interactiveFocusClassName,
)}
```

---

## 5. Contraste (cálculo sobre tokens reales)

Método: pares ya verificados en deuda D1 §3 e informe Track B (2026-08-11). **No se duplica hex.**

| Par | Ratio (aprox.) | Umbral | Veredicto |
| --- | --- | --- | --- |
| `text-iwana-primary` sobre `bg-iwana-surface-soft` (activo) | ≈ 17:1 | 4,5:1 | AAA |
| `text-iwana-secondary-700` sobre `bg-iwana-surface-soft` (icono on, light) | ≈ 6,2:1 | 4,5:1 / 3:1 gráfico | **AA** |
| `text-gray-600` sobre `bg-white` (inactivo) | ≥ 4,5:1 | 4,5:1 | AA |
| `text-gray-400` icono off sobre `bg-white` | ≥ 3:1 | 3:1 gráfico | AA (1.4.11) |
| `dark:text-white` sobre `dark-surface-3` | ≈ 16:1 | 4,5:1 | AAA |
| `dark:text-iwana-secondary` sobre `dark-surface-3` | ≈ 6,5:1 | 3:1 gráfico | AA |
| Foco: `ring-iwana-primary` + offset `white` / `dark-surface-2` | — | 1.4.11 / 2.4.13 | AA — constante vigente; **sin** `dark:focus-visible:ring-offset-white` (eso era adaptación navy) |

**Lima en texto sobre blanco:** siempre `-700+`. El DEFAULT lima **solo** en la barra (decorativa) y en icono **dark**.

Estado activo **no** depende solo del color: tinte + barra + icono lima + `font-medium` + `aria-current` (WCAG 1.4.1).

---

## 6. Foco

Contrato vigente: consumir `interactiveFocusClassName` **sin** sombra ni ring extra y **sin** override de offset.

```typescript
// packages/ui/src/focus.ts — no modificar en este G2
export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2';
```

Sobre aside blanco / `dark-surface-2` el offset de la constante coincide con el fondo. La adaptación `dark:focus-visible:ring-offset-white` del contrato navy **no aplica**.

Nodos obligados (paridad CA-SB-01 + CA-T1):

| Nodo |
| --- |
| Cada `<Link>` de ítem de nav |
| `<Link>` de marca expandida |
| `<Link>` de marca colapsada |
| `<button>` cerrar menú mobile |

---

## 7. Estados requeridos

| Estado | Receta | Notas |
| --- | --- | --- |
| **Default** (inactivo) | §4.7 | Label `gray-600`; icono `gray-400` |
| **Hover** | `hover:bg-iwana-surface-soft hover:text-iwana-primary`; icono `group-hover:text-iwana-secondary-700` | 150 ms, solo color |
| **Active** (ruta actual) | §4.6 | Tinte + barra lima + icono `-700` + `aria-current` |
| **Focus-visible** | §6 | Constante canónica; sin override navy |
| **Disabled** | N/A | Nav web no tiene ítems disabled (portal sí; fuera de alcance) |
| **Loading / skeleton** | N/A | Nav estática de configuración; `Suspense fallback={null}` existente no se convierte en skeleton |
| **Empty / error / success / readonly** | N/A | Chrome de nav, no vista de datos |
| **Collapsed** (`lg:w-[90px]`) | Ocultar wordmark, eyebrow de marca y labels de ítem; iconos + squircle + barra lima del activo | `title` en ítems; squircle no desborda (CA-SB-05) |
| **Mobile drawer** | Misma receta sólida; velo §4.3; Escape cierra; close §4.8 | Viewport ~375 px; targets T1 intactos |
| **Dark** | Aside `dark:bg-dark-surface-2` sólido; ítem D1; icono lima DEFAULT; **cero** `dark:bg-gray-*` | Familia ADR-056 |

---

## 8. API de composición (no primitive nueva)

`Sidebar` permanece **local a `apps/web`**. Props existentes (colapso desktop, drawer mobile) **no cambian**.

La lista de destinos es configuración de pantalla, no un componente de `@iwana/ui`. `core-components`: Sidebar **no** está implementado en el barrel; este G2 **no** lo promueve.

Copy visible y landmarks salen de `PLATFORM_UI_COPY` (Track A). Este contrato exige: **cero** strings de grupo en JSX; **cero** eyebrows de grupo en el árbol.

---

## 9. Criterios de aceptación (serie CA-NAV-DS)

Verificables por grep, cómputo de clases o captura. Owner de verificación: AI-SR-QA. CA-NAV-01…06 (copy/IA/táctil) son del Track A; aquí solo DS.

| ID | Criterio |
| --- | --- |
| **CA-NAV-DS-01** | Aside `z-(--z-drawer)`; velo `z-(--z-overlay)`. **Grep 0** de `z-40` / `z-30` / `z-[` en este chrome (`Sidebar.tsx` + velo de `layout.tsx`) |
| **CA-NAV-DS-02** | **Grep 0** de `text-[11px]` en `Sidebar.tsx`. Eyebrow de marca, si existe, es `.portal-eyebrow-muted` sin override de tamaño |
| **CA-NAV-DS-03** | Aside sólido: `bg-white` y `dark:bg-dark-surface-2`. **Grep 0** de `backdrop-blur`, `bg-white/95`, `bg-white/85`, `dark:bg-dark-surface-2/95` en el aside. **Grep 0** de `bg-iwana-primary` en el aside |
| **CA-NAV-DS-04** | Un solo `<ul>` de nav; **cero** eyebrows de grupo; **cero** separador mudo (`hr`, `border-t` entre ítems, spacer de grupo). Cinco `<li>` en el orden §4.4 |
| **CA-NAV-DS-05** | Barra lima §4.6 **intacta**; `min-h-11` en nav/marca; close `h-11 w-11`; `interactiveFocusClassName` en los cuatro nodos §6. **No** reabre CA-SB / CA-T1 |
| **CA-NAV-DS-06** | **Grep 0** de un `Sidebar` nuevo en `packages/ui`. Squircle P3 intacto. Canvas `lg:rounded-3xl` no se toca |
| **CA-NAV-DS-07** | `audit-ui.mjs` sobre `Sidebar.tsx` + `PlatformBrandMark.tsx`: 0 deterministas P0/P1. Cero `dark:bg-gray-{700-950}`, hex de marca, `z-9999` |

---

## 10. Checklist DS (cierre AI-DS-OWNER · modo diseño)

- [x] Pantalla clasificada: **shell / navegación**. Tarea: orientar y cambiar de módulo.
- [x] Receta shell aplicada sobre **blanco** (desempate vigente); barra lima = firma #1 con función.
- [x] ≥2 elementos de firma con función: (1) barra lima de nav activa; (2) tinte `iwana-surface-soft` + icono lima AA (dúo navy→lima como estado, no como fondo del aside).
- [x] Lima ≠ urgencia, ≠ fondo del aside.
- [x] Tokens verificados en `globals.css`; cero hex de marca en implementación; z por token ADR-075.
- [x] Contraste calculado; foco canónico sin override navy.
- [x] Estados default / hover / active / focus / collapsed / mobile / dark cubiertos; disabled/loading/empty N/A documentados.
- [x] Targets ≥ 44 px y activo plano vigentes.
- [x] `text-[11px]` absorbido al flatten; eyebrow de marca conserva primitive 10 px.
- [x] Sólido obligatorio (CA-NAV-DS-03 entra). Separador mudo **no**.
- [x] Duplicación: **0 primitives nuevas**. No extraer a `@iwana/ui`.
- [x] Derogaciones puntuales citadas por ruta + sección; navy permanece Superado.
- [ ] Script `audit-ui.mjs` — corre **después** de Track C. Hallazgos `dark:bg-gray-*` / hex de marca / z literal = defecto.

---

## 11. Archivos esperados (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/layout/Sidebar.tsx` | Lista plana §4 · aside sólido + `z-(--z-drawer)` · quitar grupos/`text-[11px]` |
| `apps/web/src/app/(protected)/layout.tsx` | Velo `z-(--z-overlay)` **solo**. No tocar canvas ni TopHeader layout |
| `apps/web/src/lib/platform-ui-copy.ts` | Copy = Track A; este contrato no dicta literales |
| `apps/web/src/components/layout/PlatformBrandMark.tsx` | **No tocar** |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** |
| `apps/portal/**` | **No tocar** |

---

## 12. Firma

| Rol | Acción | Fecha |
| --- | --- | --- |
| AI-DS-OWNER | Emite y congela contrato v1.0 — veredicto **GO** · sin `[BLOQUEO]` | 2026-08-11 |
| AI-FE-PLATFORM | Implementa solo contra esta ruta + versión | Pendiente (Track C) |
| AI-SR-QA | Verifica CA-NAV-DS-01…07 + no-regresión CA-T1/CA-SB | Pendiente (Track D) |
| AI-EM-ARCH | Consolida G2 A+B; desbloquea C | Pendiente |

**Artefacto congelado:** `docs/specs/2026-08-11-web-sidebar-nav-ds-contrato.md` v1.0

### Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Congelación GO: lista plana, aside sólido, z ADR-075, barra lima/T1/foco intactos, 0 primitives, default sin separador mudo |
