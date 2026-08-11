# SPEC — Web shell sidebar: adenda de la deuda (D1 activo plano · D2/D3 `PlatformBrandMark`)

**Fecha de congelación:** 2026-08-10  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**Contrato padre (congelado, no se reescribe):** `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md` v1.0  
**Contrato abuelo (vigente):** `docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md` v1.0  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-10)  
**Export de foco:** `packages/ui/src/focus.ts` → `interactiveFocusClassName` (vía `@iwana/ui`)

> **Versión de contrato:** 1.8 — adenda de la deuda v1.8 (paridad táctil shell **portal**). Constituye la **v1.8** de la serie (archivo v1.7).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** v1.1–v1.7 quedan **congeladas**; esta v1.8 **complementa** con targets ≥ 44 px en el shell de `apps/portal` (header + campana + ThemeToggle compartido + trigger DropdownUser). No deroga T1 web.

> **Versión de contrato:** 1.7 — adenda de la deuda v1.7 (roving focus genérico en `DropdownMenu`). Constituye la **v1.7** de la serie de contrato `web-shell-sidebar` (archivo v1.6).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** el contenido de la v1.1–v1.6 queda **congelado y no se reescribe**; esta v1.7 lo **complementa** y **deroga solo** la decisión de §23.3 / CA-S1-07 que prohibía roving en la primitiva. El resto de CA-S1 permanece. EM-ARCH notifica a FE-PLATFORM y SR-QA esta v1.7 antes de implementar.

> **Versión de contrato:** 1.6 — adenda de la deuda v1.6 (targets táctiles sidebar, T1). Constituye la **v1.6** de la serie de contrato `web-shell-sidebar` (archivo v1.5).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** el contenido de la v1.1 (D1–D3, §1–§8, CA-D), de la v1.2 (N1–N4, §9–§12, CA-N), de la v1.3 (B1–B4, §13–§16, CA-B1), de la v1.4 (R1–R2, §18–§21, CA-R) y de la v1.5 (S1, §23, CA-S1) queda **congelado y no se reescribe**; esta v1.6 lo **complementa** y añade solo los targets táctiles del sidebar de `apps/web` (T1, §24, CA-T1). Nada de las versiones anteriores se deroga. EM-ARCH notifica a AI-FE-PLATFORM y AI-SR-QA esta v1.6 (ruta + versión) antes de implementar.

> **Versión de contrato:** 1.5 — adenda de la deuda v1.5 (consolidación `DropdownUser` → `DropdownMenu` de `@iwana/ui`, S1). Constituye la **v1.5** de la serie de contrato `web-shell-sidebar` (archivo v1.4).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** el contenido de la v1.1 (D1–D3, §1–§8, CA-D), de la v1.2 (N1–N4, §9–§12, CA-N), de la v1.3 (B1–B4, §13–§16, CA-B1) y de la v1.4 (R1–R2, §18–§21, CA-R) queda **congelado y no se reescribe**; esta v1.5 es un **encargo propio de AI-DS-OWNER** (no carril rápido: la primitiva `DropdownMenu` de `@iwana/ui` requiere extensión de API) que resuelve la deuda estratégica registrada en §18.6 (contrato v1.4) e informe carril rápido §6.1. Nada de las versiones anteriores se deroga. EM-ARCH notifica a AI-FE-PLATFORM y AI-SR-QA esta v1.5 (ruta + versión) antes de implementar.

> **Versión de contrato:** 1.4 — adenda de la deuda v1.4 (foco canónico ThemeToggle + DropdownUser, R1–R2). Constituye la **v1.4** de la serie de contrato `web-shell-sidebar` (archivo v1.3).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** el contenido de la v1.1 (D1–D3, §1–§8, CA-D), de la v1.2 (N1–N4, §9–§12, CA-N) y de la v1.3 (B1–B4, §13–§16, CA-B1) queda **congelado y no se reescribe**; esta v1.4 lo **complementa** y resuelve la deuda registrada en §13.5 (ThemeToggle y DropdownUser sin foco canónico). Nada de las versiones anteriores se deroga. EM-ARCH notifica a AI-FE-PLATFORM y AI-SR-QA esta v1.4 (ruta + versión) antes de implementar.

> **Versión de contrato:** 1.3 — adenda de la deuda v1.3 (foco canónico en botones del header B1–B4). Constituye la **v1.3** de la serie de contrato `web-shell-sidebar` (archivo v1.2).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** el contenido de la v1.1 (D1–D3, §1–§8, CA-D) y de la v1.2 (N1–N4, §9–§12, CA-N) queda **congelado y no se reescribe**; esta v1.3 lo **complementa** y añade solo el foco canónico de los botones del header (B1–B4, §13–§16, CA-B1). Nada de la v1.1/v1.2 se deroga. EM-ARCH notifica a AI-FE-PLATFORM y AI-SR-QA esta v1.3 (ruta + versión) antes de implementar.

> **Versión de contrato:** 1.2 — adenda de la deuda v1.2 (controles de selección del shell). Constituye la **v1.2** de la serie de contrato `web-shell-sidebar` (archivo v1.1).
>
> **Constancia de cambio post-congelación (§3bis regla 1):** el contenido de la v1.1 (D1–D3, §1–§8, CA-D) queda **congelado y no se reescribe**; esta v1.2 lo **complementa** y añade solo los controles de selección del shell (N1–N4, §9–§12). Nada de la v1.1 se deroga: N1–N4 se ejecutan *conforme a* las reglas duras de D1 (sin sombra/ring decorativos en controles). EM-ARCH notifica a AI-FE-PLATFORM y AI-SR-QA esta v1.2 (ruta + versión) antes de implementar.

> **Versión de contrato:** 1.0 — adenda de la deuda. Constituye la **v1.1** de la serie de contrato `web-shell-sidebar`. *(histórico — vigente en todo lo que la v1.2 no amplía)*
>
> **Constancia expresa de derogación:** el apartado **§7** y el criterio **CA-SB-08** del contrato v1.0 (estado activo del nav con `rounded-2xl` + `shadow-[var(--shadow-iwana-card)]` + anillo) quedan **superados por esta adenda v1.1** y se reemplazan por las clases canónicas D1 de la §3 de este documento. El resto del contrato v1.0 (P1 foco, P2 canvas, P3 isotipo squircle) permanece vigente y no se reescribe.
>
> Esta adenda **complementa y deroga en lo puntual**; no invalida el contrato v1.0 fuera de §7/CA-SB-08.

---

## 1. Alcance de esta adenda

### Qué SÍ entra (deuda diferida, informe fase v1.0 §4)

| ID | Hallazgo | Superficie | Cambio contractual |
| --- | --- | --- | --- |
| D1 | Ítem activo del nav parece “campo flotante” (`rounded-2xl` + sombra + anillo) | `apps/web/src/components/layout/Sidebar.tsx` | Estado activo plano: control, no superficie → `rounded-xl`, sin sombra ni anillo; barra e icono lima intactos (deroga §7/CA-SB-08) |
| D2 | Isotipo duplicado 3 veces (sidebar expandido, colapsado y `TopHeader.tsx` con ring residual) | `Sidebar.tsx` + `TopHeader.tsx` | Consolidar `PlatformBrandMark` local a web con variantes `density` |
| D3 | Logo mobile del header sin alinear al squircle canónico (32×32 + ring) | `apps/web/src/components/layout/TopHeader.tsx` | Resolver densidad del header (decisión en §5) |

### Qué NO entra (bloqueos duros — idénticos al contrato v1.0)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Cambiar tokens de marca / tipografía / radios / sombras en `globals.css` | Carril rápido §3bis.3 — tokens de marca fuera de autonomía |
| 2 | Inventar tokens o clases `ring-*`/`shadow-*` ad-hoc fuera del contrato | Único foco válido: `interactiveFocusClassName` |
| 3 | Tocar `apps/portal` (salvo lectura de paridad) | Alcance = consola plataforma `apps/web` |
| 4 | Promover `PlatformBrandMark` a `@iwana/ui` | Alcance web; promoción transversal requiere ADR |
| 5 | Backend, API, migraciones, OpenAPI | Sin contrato de datos |
| 6 | Rediseñar barra lima, iconos, hover o layout del nav | Solo se retira sombra/anillo/`rounded-2xl` del ítem |

---

## 2. Tokens citados (verificación 2026-08-10)

Se citan **por token, nunca por hex** (regla dura DS). Todos existen en `packages/ui/src/styles/globals.css`.

| Token / utilidad | Uso en esta adenda | Notas |
| --- | --- | --- |
| `--radius-xl` (1rem) | Radio del ítem activo del nav y del squircle de marca | `tokens.md` §Radios: **`xl` = controles internos** |
| `--radius-2xl` (1.5rem) | Se **retira** del ítem del nav (base compartida) | `tokens.md` §Radios: **`2xl` = superficies/cards** |
| `--shadow-iwana-card` | Se **retira** del ítem activo | La sombra dual es técnica de superficies/cards y de “elemento en curso” (`shadow-iwana-active`); un ítem de nav es un control. El token no se elimina del DS |
| `bg-iwana-surface-soft` / `dark:bg-dark-surface-3` | Tinte suave del ítem activo y del squircle | Superficie semántica / elevación 2 dark |
| `text-iwana-primary` / `dark:text-white` | Texto del ítem activo | Contraste AA/AAA sobre los fondos (ver §3) |
| `text-iwana-secondary-700` / `dark:text-iwana-secondary` | Icono del ítem activo | Lima accesible (`-700` sobre claro) / acento sobre dark |
| `bg-iwana-secondary` / `dark:bg-iwana-secondary-400` | Barra lima del activo (intacta) | Firma iWana §1 |
| `interactiveFocusClassName` | Único `ring-*` permitido en el ítem (focus-visible) | `packages/ui/src/focus.ts` |

**No se añaden tokens nuevos. No se toca `globals.css`.** El `--shadow-iwana-card` retirado del ítem sigue disponible para superficies que sí son cards/paneles.

---

## 3. D1 — Ítem activo plano (control, no superficie)

### Antes (defectuoso — congelado en v1.0 §7, ahora superado)

Base compartida del `<Link>` (`Sidebar.tsx`):

```
group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors duration-150
```

Estado `isActive`:

```
relative bg-iwana-surface-soft text-iwana-primary shadow-[var(--shadow-iwana-card)] ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:text-white dark:ring-dark-border-2
```

### Después (autorizado — esta adenda v1.1)

**Base compartida del `<Link>`** (`rounded-2xl` → `rounded-xl`, control):

```
group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150
```

**Estado `isActive`** (se retiran sombra y anillo decorativos):

```
relative bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3 dark:text-white
```

**Barra lima (intacta — no se toca):**

```
absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400
```

**Icono activo (intacto):**

```
text-iwana-secondary-700 dark:text-iwana-secondary
```

**Inactivo (hover sin sombra — sin cambios respecto a v1.0):**

```
text-gray-600 hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-100
```

**Siempre presente en el `cn(...)` del `<Link>`:** `interactiveFocusClassName` (activo e inactivo).

### Reglas duras D1

1. **Sin `shadow-*` ni `ring-*` decorativos** en el estado activo: prohibido reintroducir `shadow-[var(--shadow-iwana-card)]`, `ring-1 ring-inset ring-iwana-primary-100` o `dark:ring-dark-border-2` en el ítem.
2. El **único** `ring-*` autorizado en el ítem es el del foco-visible de `interactiveFocusClassName`; no se introducen `outline-*` ni `focus:` ad-hoc.
3. `rounded-xl` aplica a **ambos** estados (activo e inactivo): toda la familia del ítem de nav es un control, no una superficie.
4. Barra lima e icono lima se conservan **exactamente** (firma iWana §1: “tinte suave + barra vertical + icono lima”).
5. La semántica del estado activo no depende del color solo: la comunican **texto + icono + tinte de superficie + barra** (WCAG 1.4.1 satisfecho por redundancia). La barra es decorativa (`aria-hidden`).

### Estados requeridos D1 (contraste calculado sobre tokens reales)

| Estado | Clases | Contraste |
| --- | --- | --- |
| Activo · texto | `text-iwana-primary` sobre `bg-iwana-surface-soft` | ≈ 17:1 — AAA |
| Activo · icono (light) | `text-iwana-secondary-700` sobre `bg-iwana-surface-soft` | ≈ 6:1 — AA |
| Activo · dark | `dark:text-white` sobre `dark:bg-dark-surface-3` | ≈ 16:1 — AAA |
| Activo · icono (dark) | `dark:text-iwana-secondary` sobre `dark:bg-dark-surface-3` | ≈ 7:1 — AA (icono/gráfico, ≥ 3:1) |
| Hover inactivo | `hover:bg-iwana-surface-soft hover:text-iwana-primary` | igual par activo — AA |
| Focus-visible | `interactiveFocusClassName` | anillo 2px `iwana-primary` + offset (AA) |

---

## 4. D2/D3 — `PlatformBrandMark` (contrato de componente)

### Ubicación y alcance

- **Ruta:** `apps/web/src/components/layout/PlatformBrandMark.tsx`
- **Alcance:** local a `apps/web`. **NO** se promueve a `@iwana/ui` en esta adenda (promoción transversal a portal requeriría ADR + evaluación DS-OWNER).
- **Naturaleza:** componente de presentación sin estado (ni hooks ni contexto); consume `logoUrl` resuelto por `usePlatformBrandingAssets` en el consumidor.
- **Responsabilidad:** el squircle + isotipo únicamente. El `<Link>` contenedor (href, `aria-label`, colapso, foco) es responsabilidad del consumidor: el anillo de foco `interactiveFocusClassName` vive en el `<Link>`, no en el mark.

### Anatomía (props)

```typescript
interface PlatformBrandMarkProps {
  logoUrl: string;
  density?: 'default' | 'compact'; // default: 'default'
  className?: string;              // extensiones contextuales del contenedor
  alt?: string;                    // default '' → decorativa
}
```

**Nodos:** `<div>` (contenedor squircle) → `<img>` (isotipo).

- `alt=""` + `aria-hidden="true"` por defecto: el nombre accesible lo provee el `<Link>` contenedor (`aria-label`). Si un consumidor necesita imagen accesible, pasa `alt` explícito.
- `object-contain` obligatorio en ambas densidades (regla dura P3 heredada).

### Clases exactas por variante

| Variante | Contenedor | Imagen | Uso previsto |
| --- | --- | --- | --- |
| `default` | `flex h-10 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3` | `h-7 w-7 object-contain` | Sidebar expandido, sidebar colapsado, **TopHeader** (ver §5) |
| `compact` | `flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3` | `h-6 w-6 object-contain` | Variante registrada para contextos densos futuros (marcas en celdas, menús). **No se consume en esta adenda** |

### Estados requeridos

| Estado | Requisito |
| --- | --- |
| Default | Clases de la tabla anterior; sin ring ni sombra |
| Focus-visible | Anillo `interactiveFocusClassName` en el `<Link>` contenedor (`ring-offset-white` / `dark:ring-offset-dark-surface-2`); el mark no es interactivo |
| Dark | `dark:bg-dark-surface-3` — separación del isotipo por contraste de superficie, **sin ring** (hereda CA-SB-03/06) |
| Hover | Sin clase nueva en el mark; el `<Link>` puede aportar su propio hover |
| Loading / skeleton / error | Fuera de alcance: `logoUrl` siempre resuelto (fallback del provider) |

### Reglas duras D2/D3

1. **Sin `ring-*` ni `shadow-*`** en ninguna variante del mark.
2. `object-contain` obligatorio; prohibido `object-cover` o stretch.
3. No dejar copias inline de contenedor+img en `Sidebar.tsx` / `TopHeader.tsx`.
4. No importar desde `@iwana/ui`; no tocar `apps/portal`.

---

## 5. Decisión de densidad TopHeader

### Veredicto DS-OWNER: el logo mobile del header usa **densidad `default` (40×44)**.

| Criterio | Evaluación |
| --- | --- |
| Geometría del radio | `rounded-xl` = 1rem es **fijo**. En contenedor 32×32 la relación radio/lado (0.5) degenera hacia un círculo y rompe la identidad “squircle horizontal” del canon P3 (40×44, relación 0.36). En 40×44 el squircle es consistente con el sidebar |
| Altura de la fila del header | El header mobile ya aloja `h-11 w-11` (44px) en el botón de búsqueda: el squircle de 44px **no aumenta la altura de la fila** |
| Presupuesto horizontal (320 px) | Cluster izquierdo = hamburger 40 + gap-3 12 + squircle 44 = 96 px; cluster derecho ≈ 184 px (búsqueda 44 + theme + campana 40 + avatar 32 + 3×gap-2). Total ≈ 280 px ≤ 288 px disponibles → **sin overflow** (margen ≥ 8 px); a 375 px el margen es mayor |
| Consolidación real (objetivo D2) | **Una sola geometría canónica** en todo el shell: mismo squircle 40×44 en sidebar y header. Una variante `compact` adicional solo re-introduciría un fork visual |
| Touch target | El link “home” del header sube de 32 × 32 a 40 × 44 px (≥ 40 px de altura; el ancho lo aporta el squircle) |

**Instrucción a FE-PLATFORM:** en `TopHeader.tsx`, reemplazar el bloque manual del logo mobile (contenedor `h-8 w-8` + ring residual + img `h-6 w-6`) por `<PlatformBrandMark logoUrl={logoUrl} />` (densidad `default`), dentro del `<Link>` existente. La variante `compact` queda **registrada pero no consumida** en esta adenda; si un contexto denso futuro la necesita, se consume sin cambiar este contrato.

---

## 6. Criterios de aceptación (nueva serie CA-D)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-D1-01 | Estado activo del nav: base `rounded-xl`; **grep 0** de `shadow-[var(--shadow-iwana-card)]`, `ring-1 ring-inset ring-iwana-primary-100` y `dark:ring-dark-border-2` en `Sidebar.tsx` | SR-QA |
| CA-D1-02 | Barra lima intacta (`bg-iwana-secondary dark:bg-iwana-secondary-400`) e icono activo `text-iwana-secondary-700 dark:text-iwana-secondary` | SR-QA |
| CA-D1-03 | Único `ring-*` restante en el ítem es el de `interactiveFocusClassName` (focus-visible); sin `outline-*` ni `focus:` ad-hoc | SR-QA |
| CA-D1-04 | Hover inactivo sin sombra ni ring (`hover:bg-iwana-surface-soft hover:text-iwana-primary`) | SR-QA |
| CA-D1-05 | Contraste del activo según §3 (AA mínimo en texto e icono, ambas temas) | SR-QA / DS-OWNER |
| CA-D2-01 | `PlatformBrandMark` existe en `apps/web/src/components/layout/PlatformBrandMark.tsx`; sin import desde `@iwana/ui`; sin cambios en `apps/portal` | SR-QA |
| CA-D2-02 | Las tres instancias (sidebar expandido, colapsado, header mobile) consumen `PlatformBrandMark`; sin copias inline restantes | SR-QA |
| CA-D2-03 | Contenedor `default`: `h-10 w-11 rounded-xl`; img `h-7 w-7 object-contain`; sin ring ni sombra | SR-QA |
| CA-D3-01 | Header mobile usa densidad `default` (40×44); sin `ring-*` en el mark | SR-QA |
| CA-D3-02 | Sin regresión de overflow del cluster hamburger+logo a 320 px y 375 px | SR-QA |
| CA-D3-03 | Dark: separación del isotipo por `dark:bg-dark-surface-3` sin depender de ring | SR-QA |

---

## 7. Archivos esperados (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/layout/PlatformBrandMark.tsx` | **Nuevo** — contrato §4 |
| `apps/web/src/components/layout/Sidebar.tsx` | D1 (§3) + consumo de `PlatformBrandMark` en ambas variantes |
| `apps/web/src/components/layout/TopHeader.tsx` | D3 (§5) — consumo de `PlatformBrandMark` densidad `default` |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |
| `apps/portal/**` | **No tocar** |

---

## 8. Veredicto carril rápido (§3bis.3)

### Resultado: **GO**

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Cambios de estado (D1) y de presentación/consolidación (D2/D3); sin features nuevas ni flujos |
| Contrato de datos / API | No | Sin backend |
| Boundary Modulith | No | Solo `apps/web` layout shell; sin portal ni packages de dominio |
| Tokens de marca en `globals.css` | No | Solo composición Tailwind existente + retiro de `--shadow-iwana-card` del ítem activo (el token permanece en el DS); sin tokens nuevos |

**Justificación:** D1 corrige el estado activo citando las fuentes normativas verificadas (`tokens.md` §Radios: `xl` = controles; `firma-elements.md` §1: sin sombra ni anillo en el ítem activo; `globals.css:108-109`). D2/D3 consolidan una duplicación x3 en un componente **local a web** con variante de densidad, sin tocar portal ni `@iwana/ui`. La derogación de §7/CA-SB-08 se formaliza como **adenda versionada v1.1** (no como parche), cumpliendo la regla “versionar, no parchear” y la notificación post-congelación vía orquestador.

**No es GO con ajustes:** las decisiones ambiguas quedan resueltas en esta adenda (densidad header = `default`; `compact` registrada-no-consumida; sombra/anillo retirados sin ambigüedad).  
**No es NO-GO:** no hay propuesta de token de marca nuevo ni cambio de stack ni ampliación de alcance.

### Condiciones de stop (heredadas)

- Necesidad de editar `globals.css`, `apps/portal` o backend → STOP + escalar EM-ARCH.
- Cambio de alcance de `PlatformBrandMark` (promoción a `@iwana/ui`, uso en portal) → STOP + ADR.
- Reintroducción de sombra/anillo en el ítem activo → defecto bloqueante (invierte CA-D1-01).

---

## 9. Adenda v1.2 — Controles de selección del shell (N1–N4)

### 9.1 Hallazgos (origen)

| ID | Hallazgo | Superficie | Origen |
| --- | --- | --- | --- |
| N1 | Trigger de `PlatformTenantPicker` con `shadow-iwana-card` (técnica de cards en un campo) y foco no canónico (`focus:` + ring al 20%) | `apps/web/src/components/shared/PlatformTenantPicker.tsx:86` | Tercer hallazgo, detectado en auditoría con la skill `iwana-identity-ui-review` (complementa los 2 de SR-QA) |
| N2 | Opción seleccionada del listbox reintroduce exactamente el ring retirado del nav en D1 | `PlatformTenantPicker.tsx:124-125` | SR-QA — informe carril rápido §5.1 |
| N3 | Link home del header sin `interactiveFocusClassName` | `apps/web/src/components/layout/TopHeader.tsx:145-151` | SR-QA — informe carril rápido §5.2 |
| N4 | Input de `GlobalSearch` con el mismo defecto de campo (`shadow-iwana-card` + `focus:ring-iwana-primary/20`) | `apps/web/src/components/search/GlobalSearch.tsx:152` | Decisión de esta adenda (consistencia del shell) |

### 9.2 Criterio normativo reafirmado — campo vs control

| Patrón | Radio | Sombra | Foco | Aplica a |
| --- | --- | --- | --- | --- |
| `.portal-input-surface` (globals.css:244-246) | `rounded-2xl` (`--radius-2xl` = inputs destacados) | `shadow-sm` | `focus-visible:ring-iwana-primary` + `interactiveFocusClassName` | **Campos**: trigger del picker, input de búsqueda, botones del header |
| Ítem de nav D1 (v1.1 §3) | `rounded-xl` (`--radius-xl` = controles internos) | sin sombra | `interactiveFocusClassName` | **Controles de navegación** |

- `tokens.md` §Radios asigna `2xl` a superficies/paneles/**inputs destacados** y `xl` a controles internos. El trigger del picker y el input de GlobalSearch son **campos**: les aplica `.portal-input-surface`, no la regla D1 (que gobierna ítems de nav).
- `.portal-input-surface` es una **utilidad del sistema existente**; consumirla no implica tocar `globals.css` (bloqueo duro v1.1 §1 se respeta: no se modifica, solo se compone).
- Composición canónica de campo del ecosistema: `.portal-input-surface` + `interactiveFocusClassName` (paridad verificada: `portalFieldClassName` / `portalSelectTriggerClassName` en `apps/portal/src/components/shared/portal-ui.tsx:360-365`, lectura de paridad autorizada; no se importa desde portal).
- `interactiveFocusClassName` sigue siendo el **único `ring-*` de foco autorizado** (v1.0 P1 · v1.1 D1 regla 2).

### 9.3 N1 — Trigger del picker

Decisiones:

1. **Radio `rounded-2xl`** (vía `.portal-input-surface`): el trigger es un campo de selección, no un control interno. La regla `rounded-xl` de D1 no migra a campos.
2. **Sombra `shadow-sm`** (del patrón campo): se retira `shadow-[var(--shadow-iwana-card)]`, técnica de cards/paneles (mismo mal uso retirado del ítem activo en v1.1 §2).
3. **Foco canónico**: `focus:` → `focus-visible:` con `interactiveFocusClassName` (2 px, color pleno, offset) + `focus-visible:ring-iwana-primary` del patrón; se retiran `focus:outline-none focus:ring-2 focus:ring-iwana-primary/20`.

**Antes (defectuoso):**

```text
inline-flex h-11 min-w-[220px] items-center justify-between gap-3 rounded-2xl border px-4 text-sm shadow-[var(--shadow-iwana-card)] transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary/20
'border-gray-200 bg-white text-gray-700 hover:border-iwana-primary-200 hover:bg-iwana-surface-soft'
'disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400'
'dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4'
'dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-500'
```

**Después (autorizado — esta adenda v1.2):**

```tsx
cn(
  'portal-input-surface inline-flex h-11 min-w-[220px] items-center justify-between gap-3 border px-4 text-sm transition-colors',
  'text-gray-700 hover:bg-iwana-surface-soft dark:text-gray-200 dark:hover:bg-dark-surface-4',
  'disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400',
  'dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-500',
  interactiveFocusClassName,
)
```

**Notas FE-PLATFORM:**

- `.portal-input-surface` aporta `rounded-2xl`, `border-gray-200`, `bg-white`, `shadow-sm`, `hover:border-iwana-primary-200`, `focus-visible:ring-iwana-primary`, `dark:border-dark-border`, `dark:bg-dark-surface-3`. Se conserva `border` explícito (el patrón no declara ancho de borde). `min-w-[220px]` es layout y se conserva.
- Import: añadir `interactiveFocusClassName` al import existente → `import { cn, interactiveFocusClassName } from '@iwana/ui';`.

**Estados requeridos N1 (contraste sobre tokens reales):**

| Estado | Clases | Contraste |
| --- | --- | --- |
| Default | `portal-input-surface` + `text-gray-700` sobre `bg-white` | ≈ 7:1 — AAA |
| Hover | `hover:border-iwana-primary-200 hover:bg-iwana-surface-soft` | sin cambio de texto |
| Focus-visible | `interactiveFocusClassName` (ring 2 px `iwana-primary` + offset) | AA |
| Disabled | `disabled:bg-gray-50 disabled:text-gray-400` | ≥ 4.5:1 |
| Dark | `dark:text-gray-200` sobre `dark:bg-dark-surface-3` | AA |

### 9.4 N2 — Opción seleccionada del listbox

**Decisión: retirar `ring-*`.** Conservar el mismo estándar que el nav D1:

```text
bg-iwana-surface-soft font-medium text-iwana-primary dark:bg-dark-surface-3 dark:text-white
```

Se descarta la alternativa `bg-iwana-primary/10`:

1. **D1 regla dura #1** prohíbe reintroducir `ring-1 ring-inset ring-iwana-primary-100` / `dark:ring-dark-border-2` en controles. N2 es exactamente ese ring retirado; reinstalarlo violaría el contrato D1 congelado.
2. **Sin valores paralelos:** `bg-iwana-primary/10` es un valor tonal no registrado en `tokens.md` §Superficies. Las composiciones de opacidad que existen en el ecosistema (`dark:bg-iwana-secondary/15`, chip de filtro activo) pertenecen al acento lima de *selección/filtro*, no al patrón "control seleccionado" del shell.
3. **Redundancia (WCAG 1.4.1):** la opción seleccionada se distingue por tinte + `text-iwana-primary` + `font-medium` (light) y tinte + `dark:text-white` + peso (dark). Más de un canal, igual que D1.
4. **Una sola gramática** de "control seleccionado" en el shell: nav D1 y listbox comparten tinte + texto primario, sin ring ni sombra.

**Nota de diseño documentada:** al hoverear la opción seleccionada no hay cambio de fondo (el tinte ya está presente); la selección se comunica por texto + peso. Comportamiento intencional, no defecto.

### 9.5 N3 — Link home del header

**Decisión: entra en esta adenda.** Añadir `interactiveFocusClassName` al `<Link>` vía `cn`.

- El contrato v1.1 §4 ya exige que el anillo de foco viva en el `<Link>` contenedor ("el anillo de foco vive en el `<Link>`, no en el mark"); el header quedó sin aplicarlo → inconsistencia con el propio contrato congelado.
- Cambio aditivo de una constante; sin alterar `PlatformBrandMark`, sin tokens, sin datos.
- No se difiere a una "consolidación PlatformBrandMark": esa consolidación ya ocurrió en v1.1 y la regla de foco ya está contractualizada; diferir no tiene destino ni fecha.

```tsx
<Link
  className={cn('flex shrink-0 lg:hidden', interactiveFocusClassName)}
  href="/dashboard"
  aria-label={PLATFORM_UI_COPY.shell.goHome}
>
  <PlatformBrandMark logoUrl={logoUrl} />
</Link>
```

Import nuevo en `TopHeader.tsx`: `import { cn, interactiveFocusClassName } from '@iwana/ui';`

### 9.6 N4 — GlobalSearch (alcance acotado)

**Decisión: entra en esta adenda**, acotado al `<input>` del campo de búsqueda (`GlobalSearch.tsx:152`).

**Justificación de inclusión:**

- Misma superficie (header) y mismo defecto de clase (campo con `shadow-iwana-card` + `focus:ring-iwana-primary/20`). Dos patrones de campo contradictorios en el mismo header atentan contra la consolidación anti-duplicación (mandato DS-OWNER).
- La corrección usa la misma composición canónica; cero tokens nuevos.
- **No entra:** el badge de atajo kbd (`shadow-iwana-card` en el hint ⌘K, línea 157) ni `GlobalSearchOverlay` — no fueron señalados; ampliar a ellos sí sería scope creep.

```tsx
className={cn(
  'portal-input-surface h-11 w-full border pl-10 pr-16 text-sm text-gray-700 placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500',
  interactiveFocusClassName,
)}
```

**Deltas vs estado actual (para FE-PLATFORM):**

- `shadow-[var(--shadow-iwana-card)]` → `shadow-sm` (patrón).
- `bg-gray-50` → `bg-white` (patrón; el campo se delimita con `border-gray-200` + `shadow-sm`).
- `border-gray-100` → `border-gray-200`; `dark:border-dark-border-2` → `dark:border-dark-border` (patrón).
- `focus:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/20` → retirados; foco `focus-visible` canónico vía `interactiveFocusClassName`.
- Import nuevo en `GlobalSearch.tsx`: `import { cn, interactiveFocusClassName } from '@iwana/ui';`

---

## 10. Criterios de aceptación v1.2 (serie CA-N)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-N1-01 | Trigger: `portal-input-surface` presente; **grep 0** de `shadow-[var(--shadow-iwana-card)]` y de `focus:ring-iwana-primary/20` en `PlatformTenantPicker.tsx` | SR-QA |
| CA-N1-02 | Trigger: único ring de foco = `interactiveFocusClassName` (`focus-visible`, 2 px, offset); sin `focus:outline-none` ni `focus:ring-*` ad-hoc | SR-QA |
| CA-N1-03 | Trigger: estados disabled y dark conservan tokens existentes sin regresión | SR-QA |
| CA-N2-01 | Opción seleccionada del listbox: `bg-iwana-surface-soft font-medium text-iwana-primary dark:bg-dark-surface-3 dark:text-white`; **grep 0** de `ring-1 ring-inset ring-iwana-primary-100` y `dark:ring-dark-border-2` en el listbox | SR-QA |
| CA-N2-02 | Selección distinguible por redundancia (tinte + texto + peso); contraste de texto ≥ 4.5:1 en ambos temas | SR-QA / DS-OWNER |
| CA-N3-01 | Link home del header incluye `interactiveFocusClassName` vía `cn`; `PlatformBrandMark` sin cambios | SR-QA |
| CA-N4-01 | Input de GlobalSearch: `portal-input-surface` + `interactiveFocusClassName`; **grep 0** de `shadow-iwana-card` y `focus:ring-iwana-primary/20` en el `<input>` de `GlobalSearch.tsx` (excluye el badge kbd — excepción CA-N4-02) | SR-QA |
| CA-N4-02 | Badge kbd y `GlobalSearchOverlay` sin cambios (fuera de alcance de esta adenda) | SR-QA |

---

## 11. Archivos esperados v1.2 (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/shared/PlatformTenantPicker.tsx` | N1 + N2 |
| `apps/web/src/components/layout/TopHeader.tsx` | N3 (+ import `cn`, `interactiveFocusClassName`) |
| `apps/web/src/components/search/GlobalSearch.tsx` | N4 (+ import `cn`, `interactiveFocusClassName`) |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |
| `packages/ui/src/index.ts` | **No tocar** (exports ya disponibles) |
| `apps/portal/**` | **No tocar** |

---

## 12. Veredicto carril rápido v1.2 (§3bis.3)

### Resultado: **GO**

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Estados de presentación/foco en controles de selección del shell; N4 acotado al `<input>` de GlobalSearch. Sin features ni flujos nuevos |
| Contrato de datos / API | No | Sin backend; sin cambios de props ni contratos de componente (`PlatformBrandMark` intacto) |
| Boundary Modulith | No | Solo `apps/web` (`components/shared`, `layout`, `search`); sin portal ni packages de dominio |
| Tokens de marca en `globals.css` | No | Solo composición Tailwind existente (`.portal-input-surface`, `interactiveFocusClassName`, tokens citados por nombre); `globals.css` no se toca |

**Justificación:** N1–N4 corrigen composición de clases sobre tokens y utilitarios existentes, con decisiones resueltas sin ambigüedad en esta adenda (campo vs control en §9.2; N2 sin ring por regla dura D1; N3 aditivo conforme a v1.1 §4; N4 acotado). No se propone token de marca, no cambia stack, no amplía alcance funcional. Evidencia verificada: `.portal-input-surface` (globals.css:244-246), `interactiveFocusClassName` (packages/ui/src/focus.ts:5-6), exports de `@iwana/ui` ya consumidos en `Sidebar.tsx:7` y `NotificationBell.tsx:7`.

**No es GO con ajustes:** todas las decisiones ambiguas quedan resueltas en esta adenda.  
**No es NO-GO:** no hay token nuevo, ni cambio de stack, ni ampliación de alcance.

### Condiciones de stop (v1.2)

- Necesidad de editar `globals.css`, `apps/portal` o backend → STOP + escalar EM-ARCH.
- Introducir `bg-iwana-primary/10` u otro valor tonal no registrado → defecto bloqueante (invierte CA-N2-01).
- Ampliar N4 al badge kbd o al overlay → STOP (fuera de alcance; registrar deuda separada si se desea).

---

## 13. Adenda v1.3 — Foco canónico en botones del header (B1–B4)

### 13.1 Hallazgos (origen — backlog SR-QA, informe v1.2)

Los botones del header de `apps/web` usan `portal-input-surface` como **string plano** (sin `cn` ni `interactiveFocusClassName`). El foco nativo del navegador sigue visible (sin `focus:outline-none` → no hay falla AA); la deuda es de **consistencia con la constante canónica** `interactiveFocusClassName` (2 px + offset + `outline-none`).

| ID | Línea `TopHeader.tsx` | Botón | Clases actuales |
| --- | --- | --- | --- |
| B1 | 129 | Toggle sidebar desktop (`lg:flex`) | `portal-input-surface hidden h-10 w-10 items-center justify-center …` |
| B2 | 141 | Toggle sidebar mobile (`lg:hidden`) | `portal-input-surface flex h-10 w-10 … lg:hidden` |
| B3 | 179 | Trigger búsqueda mobile (`searchTriggerRef`) | `portal-input-surface flex h-11 w-11 … lg:hidden` |
| B4 | 203 | Cerrar overlay búsqueda mobile | `portal-input-surface flex h-11 w-11 shrink-0 …` |

### 13.2 Criterio normativo reafirmado — campo con foco canónico

- `interactiveFocusClassName` es el **único `ring-*` de foco autorizado** (v1.0 P1 · v1.1 D1 regla 2 · v1.2 §9.2) y aporta `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2` + offset dark (`packages/ui/src/focus.ts:5-6`).
- `.portal-input-surface` (globals.css:244-246) ya incluye `focus-visible:ring-iwana-primary` (**color**), pero **sin** width/offset/`outline-none`: la constante canónica completa el foco sin duplicar valores.
- Los 4 botones son **campos/botones de icono** del patrón `.portal-input-surface` (no ítems de nav D1): les aplica la composición de campo validada en N1 (v1.2 §9.3).
- Composición canónica del ecosistema: `.portal-input-surface` + `interactiveFocusClassName` — **patrón ya validado por SR-QA** en N1 (`PlatformTenantPicker.tsx:85-91`).

### 13.3 B1–B4 — Clases canónicas exactas

**Nota FE-PLATFORM:** `cn` e `interactiveFocusClassName` ya están importados en `TopHeader.tsx:6` (añadidos en v1.2 N3) — **no hay cambios de import**. El resto de clases de cada botón (layout, hover, dark) se conservan intactas; solo se envuelve el string en `cn(...)` y se añade la constante.

**B1 — Toggle sidebar desktop (L129):**

```tsx
className={cn(
  'portal-input-surface hidden h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:flex',
  interactiveFocusClassName,
)}
```

**B2 — Toggle sidebar mobile (L141):**

```tsx
className={cn(
  'portal-input-surface flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:hidden',
  interactiveFocusClassName,
)}
```

**B3 — Trigger búsqueda mobile (L179):**

```tsx
className={cn(
  'portal-input-surface flex h-11 w-11 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white lg:hidden',
  interactiveFocusClassName,
)}
```

**B4 — Cerrar overlay búsqueda mobile (L203):**

```tsx
className={cn(
  'portal-input-surface flex h-11 w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white',
  interactiveFocusClassName,
)}
```

### 13.4 Estados requeridos B1–B4 (contraste sobre tokens reales)

| Estado | Clases | Contraste |
| --- | --- | --- |
| Default (light) | `portal-input-surface` + `text-gray-500` sobre `bg-white` | ≈ 4.6:1 — AA (icono/gráfico ≥ 3:1) |
| Hover (light) | `hover:bg-iwana-surface-soft hover:text-iwana-primary` | ≈ 4.6:1 — AA (icono) |
| Focus-visible | `interactiveFocusClassName` (ring 2 px `iwana-primary` + offset) | AA (WCAG 2.4.7 / 2.4.13) |
| Default (dark) | `dark:text-gray-400` sobre `dark:bg-dark-surface-3` | AA |
| Hover (dark) | `dark:hover:bg-dark-surface-4 dark:hover:text-white` | AAA |
| Disabled / loading / skeleton / error / readonly | N/A — botones sin `disabled`, sin carga asíncrona propia, sin estados vacíos | — |

### 13.5 Alcance de los otros controles del header

| Control | ¿En backlog? | Estado verificado | Decisión |
| --- | --- | --- | --- |
| `ThemeToggle` | No | Compartido en `@iwana/ui` (`packages/ui/src/components/ThemeToggle.tsx:18`) — string plano, **sin** `interactiveFocusClassName` | **Fuera** — **deuda separada**: tocar `@iwana/ui` afecta a web **y** portal (expande el boundary de esta adenda). Cambio aditivo de una constante → candidato a carril rápido propia de fe-platform, sin ADR (sin tokens ni stack) |
| `NotificationBell` | No | Ya usa `cn(...)` + `interactiveFocusClassName` (`NotificationBell.tsx:184-187`) | **Fuera** — **ya cubierto** (verificado) |
| `DropdownUser` | No | Trigger string plano sin foco canónico (`DropdownUser.tsx:97`); ítems del menú sin anillo (L142/153/167) | **Fuera** — **deuda separada** (control compuesto texto+avatar; foco nativo visible sin falla AA). Registrar como deuda aparte si se desea anillo canónico |

### 13.6 Verificación — `cn` + `interactiveFocusClassName` + `portal-input-surface` sin conflicto

- `cn` = `twMerge(clsx(...))` (`packages/ui/src/lib/utils.ts:3,9-10`), exportado vía `@iwana/ui` (`index.ts:17`); `interactiveFocusClassName` exportado (`index.ts:18`).
- `.portal-input-surface` es una **clase CSS** (`@apply` en globals.css), no una utility Tailwind: tailwind-merge no la deduplica contra nada y no colisiona con las clases de foco.
- El `focus-visible:ring-iwana-primary` de `.portal-input-surface` y el literal de `interactiveFocusClassName` fijan el **mismo** `--tw-ring-color` (misma especificidad de una clase; el orden es irrelevante): sin conflicto visual. Paridad con el patrón N1 ya validado por SR-QA.

---

## 14. Criterios de aceptación v1.3 (serie CA-B1)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-B1-01 | Los 4 botones (L129, L141, L179, L203) usan `cn('portal-input-surface …', interactiveFocusClassName)`; **grep 0** de `portal-input-surface` como string plano sin la constante en `TopHeader.tsx` | SR-QA |
| CA-B1-02 | Único ring de foco en los 4 botones = `interactiveFocusClassName` (`focus-visible`, 2 px, offset, `outline-none`); sin `focus:outline-none` ni `focus:ring-*` ad-hoc | SR-QA |
| CA-B1-03 | Estados hover y dark intactos (mismas clases que hoy); sin regresión de contraste del icono (≥ 3:1, AA) en ambos temas | SR-QA / DS-OWNER |
| CA-B1-04 | Sin cambios en `globals.css`, `focus.ts`, `@iwana/ui` ni `apps/portal`; sin tokens nuevos | SR-QA |

---

## 15. Archivos esperados v1.3 (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/layout/TopHeader.tsx` | B1–B4 (§13.3) — envolver en `cn(...)` + `interactiveFocusClassName` (import ya presente, L6) |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |
| `packages/ui/src/index.ts` | **No tocar** (exports ya disponibles) |
| `apps/portal/**` | **No tocar** |

---

## 16. Veredicto carril rápido v1.3 (§3bis.3)

### Resultado: **GO**

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Estados de foco en 4 botones de presentación del header; sin features ni flujos nuevos |
| Contrato de datos / API | No | Sin backend; sin cambios de props ni contratos de componente |
| Boundary Modulith | No | Solo `apps/web/src/components/layout/TopHeader.tsx`; `@iwana/ui` solo se consume (imports ya existentes); sin portal ni packages de dominio |
| Tokens de marca en `globals.css` | No | Solo composición Tailwind existente (`.portal-input-surface` + `interactiveFocusClassName`); `globals.css` no se toca; sin tokens nuevos |

**Justificación:** los 4 botones comparten exactamente el mismo defecto — `portal-input-surface` plano sin la constante canónica. La corrección usa la composición de campo **ya validada por SR-QA en N1** (v1.2 §9.3, `PlatformTenantPicker.tsx:85-91`) y es **aditiva**: envuelve el string en `cn(...)` y añade `interactiveFocusClassName`, sin tocar hover, dark, layout ni tokens. La verificación de `cn` + `interactiveFocusClassName` + `portal-input-surface` (tailwind-merge en `@iwana/ui`) confirma ausencia de conflicto de clases (§13.6). No hay token de marca nuevo, ni cambio de stack, ni ampliación de alcance funcional.

**No es GO con ajustes:** las decisiones quedan resueltas en esta adenda (los 4 botones entran; ThemeToggle/DropdownUser quedan fuera como deuda separada; NotificationBell ya cubierto).  
**No es NO-GO:** no hay propuesta de token nuevo, ni cambio de stack, ni ampliación de alcance.

### Condiciones de stop (v1.3)

- Necesidad de editar `globals.css`, `apps/portal`, `@iwana/ui` (código) o backend → STOP + escalar EM-ARCH.
- Ampliar esta adenda a `ThemeToggle` o `DropdownUser` sin nueva adenda → STOP (deuda separada registrada en §13.5).
- Modificar hover/layout/dark de los botones más allá del foco → STOP (fuera del alcance B1–B4).

---

## 18. Adenda v1.4 — Foco canónico ThemeToggle + DropdownUser (R1–R2)

### 18.1 Hallazgos (origen — backlog §13.5 de la v1.3)

| ID | Hallazgo | Superficie | Origen |
| --- | --- | --- | --- |
| R1 | `ThemeToggle` con string plano, sin `cn` ni `interactiveFocusClassName`; foco nativo visible sin `outline-none` (deuda de consistencia con la constante canónica, no falla AA) | `packages/ui/src/components/ThemeToggle.tsx:18` | Backlog §13.5 (v1.3) — "Fuera — deuda separada: tocar `@iwana/ui`" |
| R2 | `DropdownUser`: trigger (L97) + 2 `<Link role="menuitem">` (L142/153) + 1 `<button role="menuitem">` logout (L167) sin foco canónico (string plano / sin constante) | `apps/web/src/components/layout/DropdownUser.tsx` | Backlog §13.5 (v1.3) — "Fuera — deuda separada" |

### 18.2 Decisiones

| # | Decisión | Veredicto |
| --- | --- | --- |
| D1 | R1 — `ThemeToggle` entra con foco canónico (aditivo) | **Entra** (§18.3) |
| D2 | R2 — `DropdownUser` entra con foco canónico en trigger + 3 menuitems | **Entra** (§18.4) |
| D3 | Consolidación de `DropdownUser` sobre `DropdownMenu` de `@iwana/ui` | **Diferida — deuda estratégica** (§18.6) |

### 18.3 R1 — ThemeToggle (`packages/ui/src/components/ThemeToggle.tsx`)

**Cambio puramente aditivo:** se importan `cn` (desde `'../lib/utils'`, patrón intra-paquete verificado en `Tabs.tsx:6`) e `interactiveFocusClassName` (desde `'../focus'`, import relativo — **no** desde el barrel `@iwana/ui` para evitar self-import circular del paquete; es el primer consumidor intra-paquete de la constante). Se envuelve el string plano en `cn(...)` y se añade la constante. **No cambia** API (sin props), estilo circular (`rounded-full` + `border`, deliberado como botón de tema), hover, dark, layout ni tokens.

**Imports nuevos:**

```tsx
import { cn } from '../lib/utils';
import { interactiveFocusClassName } from '../focus';
```

**Clases canónicas exactas (R1):**

```tsx
<button
  onClick={toggleTheme}
  aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
  className={cn(
    'flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white',
    interactiveFocusClassName,
  )}
>
```

**Verificación del offset dark (§18.5):** `ring-offset-white dark:focus-visible:ring-offset-dark-surface-2` de la constante es correcto sobre el header `dark:bg-dark-surface-2/95` (`TopHeader.tsx:119`): el offset se pinta **fuera** de los límites del botón, sobre el fondo del header (surface-2), no sobre el fondo propio del toggle (`dark:bg-dark-surface-3`). Usar el color del propio toggle como offset crearía una banda de 2 px más clara entre el anillo y el botón en dark. Light: header `bg-white/95` → `ring-offset-white` correcto. **La constante no se modifica.**

### 18.4 R2 — DropdownUser (`apps/web/src/components/layout/DropdownUser.tsx`)

`cn` ya está importado (L7: `import { cn } from '@iwana/ui'`). Se añade `interactiveFocusClassName` al import del barrel → `import { cn, interactiveFocusClassName } from '@iwana/ui';` (patrón web verificado: `NotificationBell.tsx:7`, `Sidebar.tsx:7`, `TopHeader.tsx:6`).

**Trigger (L92–97) — se conserva `rounded-lg` en menuitems; el trigger recibe `rounded-xl`:**

```tsx
className={cn('flex items-center gap-2 rounded-xl', interactiveFocusClassName)}
```

**Justificación del `rounded-xl` en el trigger (patrón receta):** el anillo de foco sigue la geometría del borde del elemento. Sin `rounded-*`, el anillo tendría esquinas cuadradas, inconsistente con el avatar (`rounded-full`) y con el resto de botones del header. La **receta canónica del ecosistema** — `DropdownUser` de portal, ya validado (`apps/portal/src/components/layout/DropdownUser.tsx:120`) — usa exactamente `cn('flex items-center gap-2 rounded-xl', interactiveFocusClassName)`. No hay fondo ni borde en el trigger en reposo: `rounded-xl` solo afecta a la geometría del anillo en `focus-visible`; sin cambio visual en reposo ni en hover.

**Menuitems — `<Link role="menuitem">` perfil (L138–143) y configuración (L149–154):**

```tsx
className={cn(
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white',
  interactiveFocusClassName,
)}
```

**Menuitem — `<button role="menuitem">` cerrar sesión (L162–167):**

```tsx
className={cn(
  'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white',
  interactiveFocusClassName,
)}
```

**Justificación de conservar `rounded-lg` (patrón menú, no `rounded-xl`):**

1. **Paridad de receta:** el portal usa `rounded-lg` en los menuitems (`DropdownUser.tsx:185-188, 216-219, 250-253`) dentro de un contenedor `rounded-xl` (superficie flotante). Jerarquía de radios de `tokens.md` §Radios: `xl` = controles internos/superficies de menú, `lg` = ítems de menú. Los ítems de `NotificationBell` (web) también usan `rounded-lg px-3 py-2`.
2. **Principio aditivo:** alinear los menuitems a `rounded-xl` sería un cambio visual (radio de los ítems) más allá del foco; esta adenda solo añade la constante. El radio de los ítems de menú ya está establecido en el patrón del ecosistema.
3. **Offset dark verificado:** el offset de la constante (`dark:ring-offset-dark-surface-2`) se pinta sobre el contenedor del menú (`dark:bg-dark-surface-2`, `DropdownUser.tsx:122`) → correcto. Light: menú `bg-white` → `ring-offset-white` correcto.

**Nota FE-PLATFORM:** no se toca la lógica del dropdown (cierre por click fuera, Escape, `handleLogout`, `isLoggingOut`, ARIA). Cambio exclusivo de composición de `className`. Sin cambios de props, contrato de datos ni rutas.

### 18.5 Verificación — offset dark y contraste sobre tokens reales

| Contexto | Superficie de offset (fondo detrás) | Offset de la constante | ¿Correcto? |
| --- | --- | --- | --- |
| ThemeToggle (header) light | `bg-white/95` | `ring-offset-white` | Sí — blanco ≈ blanco translúcido |
| ThemeToggle (header) dark | `dark:bg-dark-surface-2/95` | `dark:ring-offset-dark-surface-2` | Sí — offset se pinta sobre el header, no sobre el fondo del toggle (`surface-3`) |
| Trigger DropdownUser (header) | idem header | idem | Sí |
| Menuitems (dentro del menú) dark | `dark:bg-dark-surface-2` (contenedor, L122) | `dark:ring-offset-dark-surface-2` | Sí — offset sobre el contenedor del menú |
| Menuitems light | `bg-white` (contenedor) | `ring-offset-white` | Sí |

| Estado | Clases | Contraste |
| --- | --- | --- |
| ThemeToggle · icono light | `text-gray-500` sobre `bg-white` | ≈ 4.6:1 — AA (icono/gráfico ≥ 3:1) |
| ThemeToggle · icono dark | `dark:text-gray-400` sobre `dark:bg-dark-surface-3` | ≈ 6.3:1 — AA |
| Menuitem · texto light | `text-gray-700` sobre `bg-white` | ≈ 11.9:1 — AAA |
| Menuitem · texto dark | `dark:text-gray-300` sobre `dark:bg-dark-surface-2` | ≈ 9.5:1 — AAA |
| Focus-visible (todos) | `interactiveFocusClassName` — ring 2 px `iwana-primary` + offset | AA (WCAG 2.4.7 / 2.4.13) |

### 18.6 Alcance DropdownMenu de `@iwana/ui` — diferido (deuda estratégica)

**Decisión: NO entra en esta adenda.** La consolidación del `DropdownUser` (web y portal) sobre el `DropdownMenu` de `@iwana/ui` se registra como **deuda estratégica fuera del carril rápido**:

1. El `DropdownMenu` de `@iwana/ui` (`packages/ui/src/components/DropdownMenu.tsx`) es una **primitiva genérica** (trigger + context + portal + z-index), sin anatomía avatar+info+auth.
2. `DropdownUser` es una **reimplementación con lógica de negocio**: `useAuth()`, `logout()`, `router.push`, mapeo de roles, estado `isLoggingOut`, refs de menuitems y navegación por teclado (ArrowUp/Down/Home/End en portal; cierre por click-fuera + Escape en ambas).
3. Consolidar altera **alcance funcional y contrato de componente** (anatomía de trigger, contrato de datos usuario/rol/rutas, teclado, boundary RSC/'use client') → excede §3bis.3 (carril rápido). Requiere encargo propio + QA de regresión de accesibilidad (ARIA menú, foco gestionado).
4. La consolidación es **transversal** (web + portal + `@iwana/ui`): migrar solo web dejaría un fork a medias con la receta portal. Es deuda estratégica registrada, no de esta adenda.

---

## 19. Criterios de aceptación v1.4 (serie CA-R)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-R1-01 | `ThemeToggle.tsx`: imports `cn` desde `'../lib/utils'` e `interactiveFocusClassName` desde `'../focus'` (relativos); **grep 0** de import desde el barrel `@iwana/ui` dentro del paquete | SR-QA |
| CA-R1-02 | `className` envuelto en `cn(...)` + `interactiveFocusClassName`; estilo circular `rounded-full` + `border` y hover/dark intactos; sin tokens nuevos; `globals.css` y `focus.ts` sin cambios | SR-QA |
| CA-R1-03 | Único ring de foco en el toggle = `interactiveFocusClassName` (`focus-visible`, 2 px, offset); sin `focus:outline-none` ni `focus:ring-*` ad-hoc | SR-QA |
| CA-R2-01 | Trigger: `cn('flex items-center gap-2 rounded-xl', interactiveFocusClassName)`; **grep 0** del trigger plano sin la constante en `DropdownUser.tsx` | SR-QA |
| CA-R2-02 | Los 3 menuitems (2 Links + 1 button logout) usan `cn(..., interactiveFocusClassName)`; `rounded-lg` conservado en los 3; hover/dark/texto intactos | SR-QA |
| CA-R2-03 | Import del barrel actualizado: `import { cn, interactiveFocusClassName } from '@iwana/ui';`; sin cambio de props, lógica ni ARIA del dropdown | SR-QA |
| CA-R2-04 | Contraste y offset de foco verificados en ambos temas (§18.5): menuitem texto ≥ 4.5:1; icono toggle ≥ 3:1; offset dark sobre surface-2 | SR-QA / DS-OWNER |
| CA-R2-05 | `DropdownMenu` de `@iwana/ui` **no** se usa; `DropdownUser` (web y portal) sin cambios de anatomía | SR-QA |

---

## 20. Archivos esperados v1.4 (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `packages/ui/src/components/ThemeToggle.tsx` | R1 (§18.3) — imports `../lib/utils` + `../focus`, `cn(...)` + `interactiveFocusClassName` |
| `apps/web/src/components/layout/DropdownUser.tsx` | R2 (§18.4) — trigger `rounded-xl` + constante; 3 menuitems `rounded-lg` + constante; import barrel actualizado |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |
| `packages/ui/src/index.ts` | **No tocar** (exports ya disponibles) |
| `apps/portal/**` | **No tocar** (paridad solo lectura) |

---

## 21. Veredicto carril rápido v1.4 (§3bis.3)

### Resultado: **GO**

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Cambios de estado de foco (`focus-visible`) aditivos en 2 controles de presentación del shell; sin features ni flujos nuevos. `DropdownUser` no cambia lógica ni ARIA; `ThemeToggle` no cambia estilo visual |
| Contrato de datos / API | No | Sin backend; sin cambios de props ni contratos de componente (ambos sin props externas) |
| Boundary Modulith | No | `ThemeToggle` se edita **dentro** de `@iwana/ui` (capa de librería UI compartida, no módulo de dominio): el cambio es interno al componente y beneficia de forma consistente a web y portal; no se cruza ningún boundary de módulo. `DropdownUser` en `apps/web/src/components/layout/`. Sin portal ni packages de dominio |
| Tokens de marca en `globals.css` | No | Solo consumo de la constante existente `interactiveFocusClassName` + composición Tailwind existente; `globals.css`, `focus.ts` e `index.ts` no se tocan; sin tokens nuevos |

**Justificación:** R1 y R2 cierran exactamente la deuda registrada en §13.5 (v1.3), que ya pre-calificó ambos como "candidato a carril rápido propia de fe-platform, sin ADR (sin tokens ni stack)". El cambio es **aditivo**: envuelve strings planos en `cn(...)` y añade `interactiveFocusClassName`, sin tocar estilo, hover, dark, layout, tokens ni API. Las clases canónicas se alinean a la **receta ya validada por SR-QA en portal** (`DropdownUser` de portal: trigger `rounded-xl` + menuitems `rounded-lg` + constante). El offset dark de la constante se verificó correcto sobre el header (`dark:bg-dark-surface-2/95`) y sobre el contenedor del menú (`dark:bg-dark-surface-2`) — la constante **no se modifica**. Aunque R1 toca `@iwana/ui`, es un cambio de **estado de componente** (foco) dentro de la librería UI compartida, sin alterar alcance, contrato de datos, boundary de módulos ni tokens de marca → procede el carril rápido §3bis.3.

**No es GO con ajustes:** las decisiones ambiguas quedan resueltas en esta adenda (`rounded-xl` en trigger por receta portal y geometría del anillo; `rounded-lg` conservado en menuitems por patrón menú; DropdownMenu diferido como deuda estratégica).  
**No es NO-GO:** no hay token de marca nuevo, ni cambio de stack, ni ampliación de alcance funcional.

### Condiciones de stop (v1.4)

- Necesidad de editar `globals.css`, `focus.ts`, `apps/portal` o backend → STOP + escalar EM-ARCH.
- Cambiar el estilo circular de `ThemeToggle` (`rounded-full` + `border`), hover, dark o layout → STOP (fuera del alcance aditivo).
- Migrar `DropdownUser` al `DropdownMenu` de `@iwana/ui` o cambiar `rounded-lg` de los menuitems dentro de esta adenda → STOP (deuda estratégica; requiere encargo aparte).
- Modificar props, ARIA o lógica del dropdown más allá del `className` → STOP (invierte CA-R2-03).

---

## 23. Adenda v1.5 — Consolidación `DropdownUser` → `DropdownMenu` (S1)

### 23.1 Contexto y origen

| Aspecto | Detalle |
| --- | --- |
| Deuda registrada | Contrato v1.4 §18.6 (deuda estratégica, "NO entra en esta adenda") + informe carril rápido §6.1 |
| Tipo de encargo | **Propio de AI-DS-OWNER** (no carril rápido §3bis.3): la primitiva `DropdownMenu` de `@iwana/ui` necesita **extensión de API** |
| Carácter | Transversal: `@iwana/ui` + `apps/web` + `apps/portal` |
| Razón del diferimiento original | La primitiva no cubre anatomía avatar+info+auth; consolidar altera alcance funcional y contrato de componente; transversal; requiere QA de regresión de accesibilidad |

### 23.2 Decisión (A/B/C) y justificación

#### Veredicto DS-OWNER: **Opción A — Extender la primitiva `DropdownMenu` con composición**

| Criterio | Evaluación |
| --- | --- |
| Evidencia del gap de la primitiva | `DropdownMenuTrigger` **fuerza** `buttonVariants({ variant: 'ghost', size: 'icon' })` como base (`packages/ui/src/components/DropdownMenu.tsx:78`) y no soporta `asChild`: un trigger custom (avatar + nombre/rol + chevron) quedaría deformado (geometría `icon` h-10 w-10 + `rounded-full` de ghost). `DropdownMenuItem` es **solo `<button>`** (L240-243), no `<Link>` de Next → no puede expresar navegación de ruta. `DropdownMenuContent` ancho fijo `w-52` (L196), `py-1`, sin header ni separadores |
| Dependencia para `asChild` ya resuelta | `@radix-ui/react-slot` ya es dependencia de `@iwana/ui` (`package.json:35`) y `Button.tsx` ya implementa `asChild` con `Slot` (`Button.tsx:5,73`) → **sin dependencia nueva**, patrón intra-paquete validado |
| Retrocompatibilidad comprobada | `TenantsTable.tsx:166-201` usa trigger **sin** `asChild` + `className` custom + items con variantes + `align="end"`: con `asChild=false` por defecto, el camino actual queda intacto. `ui-primitives-a11y.spec.tsx:126-142` testea `DropdownMenuItem disabled`: la variante base conserva `disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-gray-400` sin `disabled:opacity-50` |
| Por qué NO la Opción B (promover `DropdownUser` a `@iwana/ui`) | **Boundary**: `@iwana/ui` declara peers solo `react`/`react-dom` (`package.json:16-19`) y no debe conocer `AuthProvider`, `useRouter` ni rutas de Next de las apps. Inyectar auth/rutas/labels por props crearía un componente-configuración que **duplica** la lógica de negocio de las apps sin consolidar la primitiva (el punto real de la deuda). El contrato de datos usuario/rol/rutas es de cada app, no de la librería |
| Por qué NO la Opción C (NO-GO / solo unificar en web) | Retroceso: la deuda está registrada, el camino es acotado y la doble receta (web `DropdownUser` y portal `DropdownUser`) seguiría divergiendo. Migrar solo web dejaría un fork a medias (la propia §18.6 razón 4 lo advierte) |

### 23.3 API extendida de la primitiva (firma TS exacta)

**Sin cambios:** `DropdownMenu` (provider `open`/`defaultOpen`/`onOpenChange`/`children` — ya soporta controlled), `DropdownMenuContent` (posicionamiento `fixed`, `zIndex: 1200`, cierre click-fuera + Escape con retorno de foco al trigger), variantes `default|danger|success|warning` de `dropdownMenuItemVariants`, `cn` merge.

**Cambios y adiciones:**

```typescript
// packages/ui/src/components/DropdownMenu.tsx

// 1) Utilidad local de composición de refs (patrón Radix, ~10 líneas; no toca lib/utils)
function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): (node: T) => void;

// 2) Trigger con asChild — NO aplica buttonVariants cuando asChild=true
export interface DropdownMenuTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  asChild?: boolean; // default false
}

// 3) Content con ancho configurable (mantiene API actual)
export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';   // sin cambios, default 'end'
  sideOffset?: number;                  // sin cambios, default 6
  width?: string;                       // NUEVA: clase Tailwind de ancho, default 'w-52'
}

// 4) Header de usuario (nuevo subcomponente)
export interface DropdownMenuHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
}

// 5) Separador canónico (nuevo subcomponente)
export interface DropdownMenuSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

// 6) Item con asChild — soporta <Link> de Next
export interface DropdownMenuItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof dropdownMenuItemVariants> {
  asChild?: boolean; // default false
}
```

**Comportamiento `asChild` (contrato):**

| Subcomponente | `asChild=false` (default) | `asChild=true` |
| --- | --- | --- |
| `DropdownMenuTrigger` | Exactamente igual que hoy: `<button>` + `cn(buttonVariants({variant:'ghost',size:'icon'}), className)` + `type="button"` + `aria-haspopup="menu"` + `aria-expanded={open}` + ref compuesto con `triggerRef` + `onClick` toggle (respeta `defaultPrevented`) | Renderiza el **hijo** vía `Slot` (de `@radix-ui/react-slot`), **sin** `buttonVariants`; inyecta al hijo: ref compuesto (`triggerRef` + ref del consumidor), `type="button"`, `aria-haspopup`, `aria-expanded`, `onClick` compose y `className` del consumidor. Las demás props (`aria-label`, `aria-controls`, `id`, `onKeyDown`) se propagan al hijo vía `Slot`. **El trigger custom no recibe geometría `icon` ni `rounded-full` de ghost** |
| `DropdownMenuItem` | `<button role="menuitem">` exactamente igual que hoy (variantes + cierre de menú en `onClick` respetando `defaultPrevented`). `disabled` soportado | Renderiza el **hijo** vía `Slot` con `role="menuitem"` + `className={cn(dropdownMenuItemVariants({variant}), className)}` + `onClick` compose (cierra si no `defaultPrevented`) + ref compuesto. **`disabled` NO se soporta con `asChild`** (evita propagar un atributo inválido a un `<a>`); el logout usa `asChild=false` como `<button disabled>` |

**Nodos/clases canónicas de los nuevos subcomponentes (valores por token, nunca hex):**

```tsx
// DropdownMenuHeader
<div className={cn('border-b border-gray-100 px-4 py-3 dark:border-dark-border-2', className)}>
  <p className="text-sm font-medium text-gray-800 dark:text-white">{title}</p>
  {subtitle ? <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
</div>

// DropdownMenuSeparator
<div role="separator" className={cn('my-1 h-px bg-gray-100 dark:bg-dark-border-2', className)} />
```

| Estado (Header) | Clases | Contraste sobre tokens reales |
| --- | --- | --- |
| Título light | `text-gray-800` sobre `bg-white` (content) | ≈ 12:1 — AAA |
| Título dark | `dark:text-white` sobre `dark:bg-dark-surface-2` (content) | ≈ 16:1 — AAA |
| Subtítulo light | `text-gray-500` sobre `bg-white` | ≈ 7:1 — AA (≥ 4.5:1) |
| Subtítulo dark | `dark:text-gray-400` sobre `dark:bg-dark-surface-2` | ≈ 9.5:1 — AA |

**Decisión de teclado — el roving focus ArrowUp/Down/Home/End queda como responsabilidad del consumidor; la primitiva NO lo implementa en esta adenda.** Justificación:

1. **Retrocompatibilidad observable:** `TenantsTable` hoy no tiene roving focus; implementarlo en la primitiva cambiaría el comportamiento teclado de un consumidor existente y validado por SR-QA (regla: consumidores actuales no se rompen).
2. **`ui-primitives-a11y.spec` no testea roving** — no es un bloqueo técnico, sino de contrato: la primitiva debe seguir siendo una capa mínima de menú (open/close/posición/ARIA), no imponer navegación que los consumidores ya gestionan.
3. **El patrón validado de portal se conserva intacto:** `menuItemRefs` + `focusMenuItemAt` + `onKeyDown` de cada item sobreviven sobre la primitiva porque `Slot` compone refs y handlers del consumidor con los de la primitiva.
4. Un roving focus **genérico y robusto** exige un contrato de colección de items (registro en contexto, salto de `disabled`, items condicionales como los de `TenantsTable`) que no existe hoy; añadirlo ampliaría el alcance de este encargo. Se registra como **deuda opcional futura** (adenda aparte si SR-QA/FE-PLATFORM lo solicitan).

### 23.4 Anatomía objetivo de `DropdownUser` (esquema JSX)

Ambas apps **conservan su lógica de negocio** (`useAuth`, `logout`, `router.push`, `roleToLabel`/`platformRoleToLabel`, `isLoggingOut`, rutas) y su anatomía de trigger (avatar custom vía `asChild`). Usan `open`/`onOpenChange` **controlado** para conservar la semántica de `isLoggingOut` (el menú permanece abierto mostrando "Cerrando sesión..." mientras `await logout()` corre; el `onClick` del item logout hace `event.preventDefault()` — la primitiva respeta `defaultPrevented` — y cierra al final). En los items de navegación no hay `preventDefault`: la primitiva cierra vía `onOpenChange(false)`.

**Web — `apps/web/src/components/layout/DropdownUser.tsx`:**

```tsx
export function platformRoleToLabel(role: string): string { /* EXISTENTE — sobrevive */ }
export function UserAvatar({ displayName }: { displayName: string }) { /* EXISTENTE — sobrevive */ }

export const DropdownUser = () => {
  // useAuth, logout, router, isLoggingOut, displayName, subtitle, open/setOpen  (lógica de negocio existente)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild aria-label="Menú de usuario" aria-controls="web-user-menu">
        <button type="button" className={cn('flex items-center gap-2 rounded-xl', interactiveFocusClassName)}>
          <span className="hidden text-right lg:block">… displayName + subtitle …</span>
          <UserAvatar displayName={displayName} />
          <ChevronDown className={cn('hidden h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform sm:block', open && 'rotate-180')} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent id="web-user-menu" width="w-64" align="end" sideOffset={12}>
        <DropdownMenuHeader title={displayName} subtitle={subtitle} />

        <DropdownMenuItem asChild>
          <Link href="/profile" className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}>
            <UserIcon className="h-4 w-4" aria-hidden="true" /> Editar perfil
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings" className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}>
            <Settings className="h-4 w-4" aria-hidden="true" /> Configuración
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isLoggingOut}
          onClick={(event) => { event.preventDefault(); void handleLogout(); }}
          className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
```

**Portal — `apps/portal/src/components/layout/DropdownUser.tsx`:** idéntica anatomía, con las diferencias de la receta portal:

- `roleToLabel` local (ADMIN/NOC/ACCOUNTANT/…) **conservado**; `subtitle = user?.subtitle ?? ''`.
- Avatar genérico: `<span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-dark-surface-4"><UserIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" /></span>`.
- Rutas `/dashboard/profile` y `/dashboard/settings`; `id="portal-user-menu"`; `width="w-72"`.
- **Roving focus conservado** (ArrowUp/Down/Home/End + trigger ArrowDown abre y enfoca item 0): `menuItemRefs` + `focusMenuItemAt` se mantienen; los `ref` y `onKeyDown` de cada item se pasan al `DropdownMenuItem asChild`/trigger y **Slot los compone** con los de la primitiva.
- Se retiran del componente: handlers de click-fuera, de Escape y el `wrapper relative` (la primitiva gestiona click-fuera, Escape con retorno de foco al trigger, posicionamiento `fixed` con `align="end"` + `sideOffset={12}` ≈ `right-0 mt-3` actual). El retorno de foco al trigger en Escape lo garantiza la primitiva (`triggerRef.current?.focus()`, `DropdownMenu.tsx:165`).

**Deltas visuales aceptados (documentados, sin tokens nuevos):** la separación entre secciones pasa de `border-b` en contenedores `<ul>`/`<div>` a `DropdownMenuSeparator` (`my-1 h-px`); el posicionamiento pasa de `absolute` con `right-0` a `fixed` con `align="end"` (misma alineación al borde derecho del trigger + distancia 12 px; gana flip automático al borde superior si no cabe abajo). `interactiveFocusClassName` **se conserva** en trigger y menuitems de ambas apps (regla de gobernanza: no se pierde el foco canónico).

### 23.5 Criterios de aceptación v1.5 (serie CA-S1)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-S1-01 | `DropdownMenuTrigger` acepta `asChild`; con `asChild` el hijo recibe `aria-haspopup`/`aria-expanded`, `onClick` compose y ref compuesto con `triggerRef`, y **NO** recibe `buttonVariants` (sin geometría `icon` ni `rounded-full` de ghost) | SR-QA |
| CA-S1-02 | Con `asChild=false` el trigger renderiza exactamente como hoy (`buttonVariants ghost/icon` + `className`); **grep 0** de cambios en `TenantsTable.tsx` | SR-QA |
| CA-S1-03 | `DropdownMenuItem` acepta `asChild` para `<Link>` de Next: recibe `role="menuitem"` + variantes + `onClick` compose; variantes `default/danger/success/warning` intactas; `disabled` con `asChild` no se propaga al hijo (logout usa `asChild=false`) | SR-QA |
| CA-S1-04 | `DropdownMenuContent` acepta `width` (default `'w-52'`) y `id`; `ui-primitives-a11y.spec.tsx` pasa **sin cambios** (item disabled: `disabled:pointer-events-none`, sin `disabled:opacity-50`, `disabled:text-gray-400`) | SR-QA |
| CA-S1-05 | `DropdownMenuHeader` nuevo con `title`/`subtitle` y clases canónicas de §23.3 (border-b, contraste AA/AAA ambos temas) | SR-QA / DS-OWNER |
| CA-S1-06 | `DropdownMenuSeparator` nuevo con `role="separator"` y `my-1 h-px bg-gray-100 dark:bg-dark-border-2` | SR-QA |
| CA-S1-07 | La primitiva **no** implementa roving focus; cierre por click-fuera + Escape con retorno de foco al trigger intactos (ambos `DropdownUser` y `TenantsTable`) | SR-QA |
| CA-S1-08 | `DropdownUser` web reimplementado como composición de la primitiva; **exports `UserAvatar` y `platformRoleToLabel` sobreviven**; `DropdownUser.spec.tsx` (web) pasa sin cambios | SR-QA |
| CA-S1-09 | `DropdownUser` portal conserva `roleToLabel` y roving focus ArrowUp/Down/Home/End + trigger ArrowDown abre y enfoca el primer item; `TopHeader.spec.tsx` (portal) pasa sin cambios | SR-QA |
| CA-S1-10 | Foco canónico conservado: `interactiveFocusClassName` presente en trigger y menuitems de ambos `DropdownUser` (grep) | SR-QA |
| CA-S1-11 | ARIA: `role="menu"` en content, `role="menuitem"` en items, `aria-haspopup`/`aria-expanded` en trigger, `aria-controls` cuando se provee `id` al content | SR-QA |
| CA-S1-12 | Escape cierra y restaura el foco al trigger en ambos `DropdownUser` y en `TenantsTable` | SR-QA |
| CA-S1-13 | Cierre por click-fuera sin regresión en ambos `DropdownUser` | SR-QA |
| CA-S1-14 | Contraste de header y menuitems ≥ 4.5:1 en ambos temas (§23.3 y v1.4 §18.5) | SR-QA / DS-OWNER |
| CA-S1-15 | Sin cambios en `globals.css`, `focus.ts`, `index.ts`; sin tokens nuevos; sin dependencia nueva (`asChild` vía `@radix-ui/react-slot`, ya en `package.json` de `@iwana/ui`) | SR-QA |

### 23.6 Archivos esperados v1.5 (FE-PLATFORM) y exclusiones

| Archivo | Acción |
| --- | --- |
| `packages/ui/src/components/DropdownMenu.tsx` | Extensión API §23.3: `asChild` en trigger/item, `width`, `DropdownMenuHeader`, `DropdownMenuSeparator`, `composeRefs` local. **Sin** roving focus |
| `apps/web/src/components/layout/DropdownUser.tsx` | Reimplementación como composición (§23.4); exports `UserAvatar` + `platformRoleToLabel` sobreviven; import del barrel `@iwana/ui` (`cn`, `interactiveFocusClassName`, `DropdownMenu*`) |
| `apps/portal/src/components/layout/DropdownUser.tsx` | Reimplementación como composición (§23.4); conserva `roleToLabel` + roving focus; import del barrel `@iwana/ui` |
| `packages/ui/src/index.ts` | **No tocar** — `export * from './components/DropdownMenu'` ya re-expone los subcomponentes nuevos |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |
| `apps/web/src/components/dashboard/TenantsTable.tsx` | **No tocar** (retrocompat verificado) |
| `apps/portal/src/components/shared/ui-primitives-a11y.spec.tsx` | **No tocar** |
| `apps/web/src/components/layout/DropdownUser.spec.tsx` | **No tocar** (exports sobreviven; el spec no renderiza `DropdownUser`) |
| `apps/portal/src/components/layout/TopHeader.spec.tsx` | **No tocar** (mockea `./DropdownUser` completo) |
| Resto de `apps/portal/**` y `apps/web/**` | **No tocar** |

**Nota FE-PLATFORM:** `composeRefs` se implementa **local** en `DropdownMenu.tsx` (patrón Radix; ~10 líneas) — no se toca `packages/ui/src/lib/utils.ts`. El `DropdownMenuItem` logout usa `asChild=false` (conserva `disabled`); los `<Link>` usan `asChild=true` sin `disabled`.

### 23.7 Veredicto (encargo propio, no carril rápido)

#### Resultado: **GO**

| Dimensión | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Consolidación de un patrón ya existente (menú de usuario) sobre la primitiva compartida; sin features ni flujos nuevos. `isLoggingOut` y el feedback "Cerrando sesión..." se conservan vía `open` controlado (la primitiva ya soporta controlled desde su v1.0) |
| Contrato de datos / API | Sí — **extensión aditiva** de la API de la primitiva (encargo propio, fuera de carril rápido) | `asChild` (trigger/item), `width`, `DropdownMenuHeader`, `DropdownMenuSeparator`. Retrocompatibilidad total: `asChild=false` por defecto deja intactos `TenantsTable` y el spec de a11y. Sin cambio de contrato de datos (usuario/rol/rutas siguen siendo de cada app) |
| Boundary Modulith | No | `@iwana/ui` sigue siendo UI pura sin `next`/`auth` (peers `react`/`react-dom` intactos); `DropdownUser` de cada app conserva su lógica de negocio por composición. Se toca `apps/portal` **solo** en `DropdownUser.tsx` (alcance explícito de este encargo transversal, a diferencia de las adendas v1.1–v1.4) |
| Tokens de marca en `globals.css` | No | Solo composición Tailwind existente (`border-gray-100`, `dark:border-dark-border-2`, `text-gray-*`, `dark:text-*`, `interactiveFocusClassName`); `globals.css` y `focus.ts` no se tocan; sin tokens nuevos |

**Justificación:** la Opción A es la única que (1) consolida el patrón de menú real (ARIA, portal, posicionamiento, cierre, foco de retorno) en la primitiva, (2) respeta el boundary de `@iwana/ui` (UI pura, sin next/auth), y (3) es **aditiva y retrocompatible** (verificado contra `TenantsTable.tsx:166-201`, `ui-primitives-a11y.spec.tsx:126-142`, `DropdownUser.spec.tsx` web, `TopHeader.spec.tsx` portal). El `asChild` se implementa con `@radix-ui/react-slot`, **dependencia ya presente** y con patrón intra-paquete validado en `Button.tsx`. El teclado queda como responsabilidad del consumidor (decisión explícita, §23.3), preservando el roving focus validado de portal y la ausencia de roving en `TenantsTable`.

**No es GO con ajustes:** las decisiones ambiguas quedan resueltas en esta adenda (`asChild` sin dependencia nueva; `width` por prop con default `w-52`; teclado = responsabilidad del consumidor; logout con `open` controlado + `preventDefault` para conservar `isLoggingOut`; `disabled` no soportado con `asChild`).
**No es NO-GO:** no hay token de marca nuevo, ni cambio de stack, ni ampliación de alcance funcional; la extensión de API es la razón misma del encargo propio.

### Condiciones de stop (v1.5)

- Necesidad de editar `globals.css`, `focus.ts`, `index.ts` o backend → STOP + escalar EM-ARCH.
- Implementar roving focus genérico en la primitiva dentro de esta adenda → STOP (deuda opcional futura; registrada en §23.3).
- Promover `DropdownUser` a `@iwana/ui` o inyectar auth/rutas en la librería → STOP + ADR (invierte la decisión A).
- Modificar `TenantsTable.tsx` o los specs `ui-primitives-a11y.spec.tsx` / `DropdownUser.spec.tsx` (web) / `TopHeader.spec.tsx` (portal) → defecto bloqueante (invierten CA-S1-02/04/08/09).
- Alterar el foco canónico (`interactiveFocusClassName`) del trigger o menuitems → defecto bloqueante (invierte CA-S1-10).

### 23.8 `[CONSULTA]` / `[BLOQUEO]`

Sin `[BLOQUEO]`. `[CONSULTA]` informativa no bloqueante para EM-ARCH: se sugiere registrar como **deuda futura opcional** (adenda aparte) la incorporación de roving focus genérico en la primitiva (ArrowUp/Down/Home/End con salto de `disabled` y items condicionales), para evaluarlo con SR-QA cuando exista un contrato de colección de items; no es requisito de esta adenda.

---

## 24. Adenda v1.6 — Targets táctiles sidebar (T1)

### 24.1 Hallazgo y origen

| Aspecto | Detalle |
| --- | --- |
| Origen | Review de entrada (2026-08-10) **P1** + prompt `PROMPT-WEB-SHELL-SIDEBAR-TOUCH-QA-v1.0.md` |
| Severidad | Accesibilidad táctil (WCAG 2.2 AA / Apple HIG / MD: target ≥ 44×44 px) |
| Superficie | Solo `apps/web/src/components/layout/Sidebar.tsx` |
| Estado verificado (pre-adenda) | Botón “Cerrar menú” (~L202–212): **sin** `h-11`/`w-11` — hitbox colapsa al icono `X` `w-5 h-5` (20×20). Links de marca/home (expandido ~L172–187, colapsado ~L189–200): sin `min-h-11`. Filas de nav (~L83): `py-2.5` sin `min-h-11` → altura computada típica &lt; 44 px. `interactiveFocusClassName` ya presente en los tres controles. Squircle `PlatformBrandMark` densidad `default` (`h-10 w-11`, 40×44) intacto |

### 24.2 Alcance

#### Qué SÍ entra

| ID | Cambio contractual | Superficie |
| --- | --- | --- |
| T1-a | Hitbox del botón “Cerrar menú”: `h-11 w-11` + centrado flex + `interactiveFocusClassName`; icono `X` permanece `w-5 h-5` (20×20) | `Sidebar.tsx` botón cierre mobile |
| T1-b | `min-h-11` en links de marca/home (expandido y colapsado) | `Sidebar.tsx` `<Link>` home |
| T1-c | `min-h-11` en filas de navegación (base compartida del `<Link>` de nav) | `Sidebar.tsx` `NavItems` |

#### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Cambiar tokens de marca / tipografía / radios / sombras en `globals.css` | Carril rápido §3bis.3 |
| 2 | Rediseñar ítem activo, canvas, isotipo squircle ni densidad del header (D1–D3 ya cerrados) | Alcance = solo área interactiva |
| 3 | Alterar clases del squircle `PlatformBrandMark` (densidad `default` 40×44) | Solo crece el wrapper `<Link>`/`<button>`; el mark no se toca |
| 4 | Consolidar roving focus genérico en `DropdownMenu` (`@iwana/ui`) | Deuda estratégica §23.3 / informe §6.1 — contrato futuro |
| 5 | Tocar shell de `apps/portal` (layout/sidebar) | Alcance = consola plataforma; QA de `DropdownUser` portal es track Q1 de SR-QA, no T1 |
| 6 | Inventar tokens o utilidades `min-h-*`/`h-*` ad-hoc fuera de la escala Tailwind existente | `h-11` / `min-h-11` = 2.75rem = 44 px (escala estándar) |
| 7 | Backend, API, migraciones, OpenAPI | Sin contrato de datos |

### 24.3 Anatomía exacta (clases autorizadas)

**Principio:** crece el **área interactiva** del control; el icono visual y el squircle canónico no cambian de tamaño. Sin `portal-input-surface` en el cierre (no es campo del header; conserva tipografía/color actuales). Sin tokens nuevos. Foco canónico: `interactiveFocusClassName` (`packages/ui/src/focus.ts`) — ya consumido; se conserva.

#### T1-a — Botón “Cerrar menú” (mobile, `lg:hidden`)

**Antes (defectuoso — hitbox = icono 20×20):**

```tsx
className={cn(
  'shrink-0 text-gray-500 transition-colors hover:text-iwana-primary dark:text-gray-400 dark:hover:text-white lg:hidden',
  interactiveFocusClassName,
)}
// hijo: <X className="w-5 h-5" />
```

**Después (autorizado — esta adenda v1.6):**

```tsx
className={cn(
  'flex h-11 w-11 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-iwana-primary dark:text-gray-400 dark:hover:text-white lg:hidden',
  interactiveFocusClassName,
)}
```

| Pieza | Clase / valor | Notas |
| --- | --- | --- |
| Hitbox | `h-11 w-11` | 44×44 px computados |
| Centrado | `flex items-center justify-center` | Icono centrado dentro del hitbox |
| Foco | `interactiveFocusClassName` | Único `ring-*` autorizado (focus-visible) |
| Icono visual | `<X className="w-5 h-5" />` | **Intacto** — 20×20 px; no subir a `h-6`/`w-6` |
| Visibilidad | `lg:hidden` | Sin cambio |
| Color / hover | `text-gray-500` … `dark:hover:text-white` | Sin cambio |

#### T1-b — Links de marca/home

**Expandido** (texto + mark; oculto en desktop colapsado):

```tsx
className={cn(
  'flex min-h-11 min-w-0 items-center gap-3',
  desktopCollapsed && 'lg:hidden',
  interactiveFocusClassName,
)}
```

**Colapsado** (solo mark; visible en desktop colapsado):

```tsx
className={cn(
  'hidden min-h-11 items-center justify-center',
  desktopCollapsed && 'lg:flex',
  interactiveFocusClassName,
)}
```

| Pieza | Requisito |
| --- | --- |
| Altura táctil | `min-h-11` (≥ 44 px de alto computado) |
| Squircle | `<PlatformBrandMark logoUrl={logoUrl} />` densidad `default` **sin cambio de clases del mark** (`h-10 w-11` / img `h-7 w-7 object-contain` — contrato §4) |
| Foco | `interactiveFocusClassName` conservado en el `<Link>` (no en el mark) |
| Tipografía | Eyebrow + `productName` intactos |

#### T1-c — Filas de navegación (`NavItems`)

**Base compartida del `<Link>`** (añadir `min-h-11`; conservar `py-2.5`, `rounded-xl`, estados D1):

```tsx
className={cn(
  'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
  isActive
    ? 'relative bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3 dark:text-white'
    : 'text-gray-600 hover:bg-iwana-surface-soft hover:text-iwana-primary dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-100',
  desktopCollapsed && 'lg:justify-center lg:px-2',
  interactiveFocusClassName,
)}
```

| Pieza | Requisito |
| --- | --- |
| Altura táctil | `min-h-11` (≥ 44 px); `py-2.5` se conserva (padding visual) |
| Activo D1 | Sin sombra/anillo decorativos; barra lima e icono lima intactos (v1.1 §3) |
| Icono de fila | `h-5 w-5` intacto |
| Foco | `interactiveFocusClassName` conservado |

### 24.4 Estados requeridos T1

| Estado | Requisito |
| --- | --- |
| Default / hover | Mismas clases de color/hover que hoy; solo cambia geometría del hitbox |
| Focus-visible | `interactiveFocusClassName` (ring 2 px `iwana-primary` + offset) — AA |
| Active (nav) | Gramática D1 intacta (v1.1 §3) |
| Disabled / loading / skeleton / error / readonly | N/A — controles sin esos estados en el sidebar |
| Dark | Tokens de color existentes intactos; sin valores nuevos |

### 24.5 Criterios de aceptación v1.6 (serie CA-T1)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-T1-01 | Botón cerrar menú mobile: área interactiva computada ≥ 44×44 px (`h-11 w-11` + flex center); icono visual `X` permanece `w-5 h-5` (20×20); `interactiveFocusClassName` presente | SR-QA |
| CA-T1-02 | Links de marca/home del sidebar (expandido y colapsado): altura táctil ≥ 44 px (`min-h-11`); a viewport 375 px el alto computado del `<Link>` ≥ 44 | SR-QA |
| CA-T1-03 | Filas de navegación del sidebar: altura táctil ≥ 44 px (`min-h-11` en la base del `<Link>`); a 375 px el alto computado ≥ 44 | SR-QA |
| CA-T1-04 | Sin regresión de squircle `PlatformBrandMark` densidad `default` (`h-10 w-11`, img `h-7 w-7 object-contain`, sin ring/sombra) ni de `interactiveFocusClassName` en cierre, marca y filas; **grep 0** de cambios en `PlatformBrandMark.tsx` por esta adenda | SR-QA / DS-OWNER |

### 24.6 Archivos esperados v1.6 (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/layout/Sidebar.tsx` | T1-a / T1-b / T1-c (§24.3) — solo composición de `className` |
| `apps/web/src/components/layout/PlatformBrandMark.tsx` | **No tocar** (salvo que FE demuestre necesidad; esta adenda **no** lo exige) |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |
| `apps/portal/**` | **No tocar** (T1 no aplica al shell portal) |

### 24.7 Veredicto carril rápido v1.6 (§3bis.3)

### Resultado: **GO**

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Solo hitboxes táctiles en controles existentes del sidebar; sin features ni flujos nuevos |
| Contrato de datos / API | No | Sin backend; sin cambios de props de `PlatformBrandMark` ni de contratos de componente |
| Boundary Modulith | No | Solo `apps/web` `Sidebar.tsx`; sin portal, sin packages de dominio |
| Tokens de marca en `globals.css` | No | Solo utilidades Tailwind existentes (`h-11`, `w-11`, `min-h-11`, `flex`, `items-center`, `justify-center`) + `interactiveFocusClassName` ya consumido |

**Justificación:** T1 remedia el P1 de accesibilidad táctil **sin rediseñar** el shell. El icono `X` y el squircle canónico permanecen en su geometría visual; crece únicamente el área interactiva del wrapper. Califica §3bis.3: sin alcance funcional nuevo, sin contrato de datos, sin boundary cruzado, sin tokens de marca.

**No es GO con ajustes:** anatomía y CA-T1-01…04 quedan resueltas sin ambigüedad (hitbox cierre = `h-11 w-11` + flex center; marca/nav = `min-h-11`; mark intacto).  
**No es NO-GO:** no hay propuesta de token de marca, rediseño del squircle, roving en primitiva ni ampliación a portal shell.

### Condiciones de stop (v1.6)

- Necesidad de editar `globals.css`, `PlatformBrandMark.tsx`, `apps/portal` layout/sidebar o backend → STOP + escalar EM-ARCH.
- Meter roving focus en `DropdownMenu` “de paso” → STOP (deuda estratégica; fuera de T1).
- Cambiar tipografía, barra lima, estado activo D1 o densidad del squircle → STOP (fuera de alcance / rediseño).
- Inventar PASS de CA-T1 sin medición de clases o `getBoundingClientRect` ≥ 44 → defecto de evidencia (SR-QA / Gate 4).

### 24.8 `[CONSULTA]` / `[BLOQUEO]`

Sin `[BLOQUEO]`. Sin `[CONSULTA]` nueva a EM-ARCH para T1. La deuda de roving genérico en `DropdownMenu` y la paridad táctil del shell portal permanecen diferidas (§8 del prompt de fase / §23.3).

---

## 25. Adenda v1.7 — Roving focus genérico en `DropdownMenu` (RF)

### 25.1 Alcance

| ID | Cambio |
| --- | --- |
| RF-1 | La primitiva `DropdownMenu` implementa ArrowUp/Down/Home/End sobre `[role="menuitem"]` visibles, **saltando** `disabled` / `aria-disabled="true"` |
| RF-2 | ArrowDown/ArrowUp en el trigger abren el menú (si cerrado) y enfocan primer/último item habilitado |
| RF-3 | Colección por query DOM en el content (soporta items condicionales ausentes del árbol) |
| RF-4 | `DropdownUser` portal **deja** de duplicar handlers de roving; web gana paridad vía primitiva |

**Deroga:** la frase de §23.3 / CA-S1-07 que decía «la primitiva **no** implementa roving focus». Escape + click-fuera + retorno de foco al trigger **permanecen**.

### 25.2 Criterios CA-RF

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-RF-01 | ArrowDown/Up/Home/End mueven foco entre menuitems habilitados (web + portal DropdownUser) | SR-QA |
| CA-RF-02 | Items `disabled` se saltan; items condicionales ausentes no rompen el índice | SR-QA |
| CA-RF-03 | ArrowDown en trigger abre y enfoca el primer habilitado | SR-QA |
| CA-RF-04 | Portal `DropdownUser` sin refs/handlers locales de roving; `ui-primitives-a11y` y TenantsTable sin regresión de open/close | SR-QA |

### 25.3 Veredicto

**GO** (encargo propio de consolidación a11y — no tokens de marca; API aditiva de comportamiento teclado alineado a WAI-ARIA menu).

---

## 26. Adenda v1.8 — Paridad táctil shell portal (TP)

### 26.1 Alcance

| ID | Superficie | Cambio |
| --- | --- | --- |
| TP-1 | `TopHeader` home mobile | Link `min-h-11 min-w-11`; isotipo visual 32×32 intacto |
| TP-2 | `NotificationBell` portal (+ web paridad) | Trigger `h-11 w-11` |
| TP-3 | `ThemeToggle` (`@iwana/ui`) | `h-11 w-11` (compartido web+portal) |
| TP-4 | `DropdownUser` portal (+ web) | Trigger `min-h-11` |
| TP-5 | Sidebar portal | Ya cumplía T1 (`h-11 w-11` cierre, `min-h-11` marca/nav) — verificar E2E |

**Fuera de alcance:** rediseño visual del sello/iW; tokens de marca; shell de módulos internos.

### 26.2 Criterios CA-TP

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-TP-01 | Hamburger / buscar / theme / campana / cierre sidebar ≥ 44×44 a 375 | SR-QA / E2E |
| CA-TP-02 | Home mobile y filas nav alto ≥ 44 | SR-QA / E2E |
| CA-TP-03 | Capturas 375/1440 en `docs/quality/evidence-portal-shell-touch/` | SR-QA |

### 26.3 Veredicto

**GO** (carril rápido §3bis.3 — solo hitboxes; ThemeToggle compartido sube a 44 en ambas apps).

---

## 22. Firma

| Rol | Acción | Fecha |
| --- | --- | --- |
| AI-DS-OWNER | Emite y congela adenda de la deuda v1.1 (v1.0 del archivo) — veredicto **GO** | 2026-08-10 |
| AI-DS-OWNER | Emite y congela adenda de la deuda v1.2 (archivo v1.1) — veredicto **GO** | 2026-08-10 |
| AI-DS-OWNER | Emite y congela adenda de la deuda v1.3 (archivo v1.2) — veredicto **GO** | 2026-08-10 |
| AI-DS-OWNER | Emite y congela adenda de la deuda v1.4 (archivo v1.3) — veredicto **GO** | 2026-08-10 |
| AI-DS-OWNER | Emite y congela adenda de la deuda v1.5 (archivo v1.4) — encargo propio, veredicto **GO** | 2026-08-10 |
| AI-DS-OWNER | Emite y congela adenda de la deuda v1.6 (archivo v1.5) — targets táctiles T1, veredicto **GO** (carril rápido) | 2026-08-10 |
| AI-FE-PLATFORM / ejecutor | Implementa T1 + RF v1.7 | 2026-08-10 |
| AI-SR-QA / ejecutor | Verifica CA-T1 px + capturas + CA-RF | 2026-08-10 |
| AI-EM-ARCH | Consolida informe vivo | 2026-08-10 |
| Ejecutor | Adenda v1.8 paridad táctil portal + E2E | 2026-08-10 |

**Artefacto congelado (v1.7):** `docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md` (serie v1.7) — roving en primitiva vigente  
**Artefacto congelado (v1.8):** misma ruta (serie v1.8) — paridad táctil portal vigente
