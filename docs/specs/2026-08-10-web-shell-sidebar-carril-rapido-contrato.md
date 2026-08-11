# SPEC — Web shell sidebar: adenda carril rápido (foco · canvas · isotipo)

**Fecha de congelación:** 2026-08-10  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**Prompt de ejecución:** `docs/prompts/PROMPT-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md`  
**Contrato padre (no se reescribe):** `docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md` v1.0  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-10)  
**Export de foco:** `packages/ui/src/focus.ts` → `interactiveFocusClassName` (vía `@iwana/ui`)

> **Versión de contrato:** 1.0 — **congelada / firmada por AI-DS-OWNER**.  
> Cualquier modificación post-congelación se versiona como v1.1+ y debe notificarse a AI-FE-PLATFORM y AI-SR-QA vía el orquestador antes de ejecutarse.  
> Esta adenda **complementa** el contrato Fase-1; **no lo invalida**. En conflicto sobre el ítem activo del nav, prevalece Fase-1 §2.

---

## 1. Alcance de esta adenda

### Qué SÍ entra

| ID | Hallazgo | Superficie | Cambio contractual |
| --- | --- | --- | --- |
| P1 | Foco teclado ausente | `apps/web/src/components/layout/Sidebar.tsx` | Obligar `interactiveFocusClassName` en nav links, marca (home) y cierre mobile |
| P2 | “Mordida” visual canvas | `apps/web/src/app/(protected)/layout.tsx` | Quitar `lg:rounded-3xl` (y cualquier radio equivalente) del `<main>` del shell |
| P3 | Isotipo en caja cuadrada + ring | `Sidebar.tsx` (expandido **y** colapsado) | Squircle `h-10 w-11 rounded-xl`; img `h-7 w-7 object-contain`; sin ring claro |

### Qué NO entra (fuera de alcance — bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Rediseñar el ítem **activo** del nav (`rounded-2xl` + ring + sombra + barra lima) | Aprobado y congelado en Fase-1 §2; deuda estratégica diferida (prompt §8.1) |
| 2 | Consolidar `PlatformBrandMark` en esta fase | Deuda estratégica diferida (prompt §8.2); opcional solo si FE lo hace **local a web** sin ampliar alcance ni tocar portal |
| 3 | Cambiar tokens de marca / tipografía / sombras en `globals.css` | Carril rápido §3bis.3 — tokens de marca fuera de autonomía |
| 4 | Inventar focus ring paralelo (clases ad-hoc) | Único contrato: `interactiveFocusClassName` de `@iwana/ui` |
| 5 | Tocar `apps/portal` (salvo lectura de paridad) | Alcance = consola plataforma `apps/web` |
| 6 | Backend, API, migraciones, OpenAPI | Sin contrato de datos |
| 7 | Alinear el logo mobile de `TopHeader.tsx` en esta fase | **Diferido** — ver §6 |

---

## 2. Tokens citados (verificación 2026-08-10)

Todos existen en `packages/ui/src/styles/globals.css`. Se citan **por token**, no por hex en implementación.

| Token / utilidad | Uso en esta adenda | Notas |
| --- | --- | --- |
| `bg-iwana-surface-soft` | Fondo soft del squircle de marca (light); canvas `<main>` | Token semántico de superficie |
| `bg-white` / `bg-white/95` | Sidebar (ya existente; no se cambia) | Separación canvas ↔ sidebar por contraste, no por radio |
| `dark:bg-dark-surface` | Canvas `<main>` (ya existente) | Elevación base dark |
| `dark:bg-dark-surface-2` / `/95` | Sidebar dark (ya existente) | Contraste vs canvas |
| `dark:bg-dark-surface-3` | Fondo squircle marca en dark | Separación isotipo sin ring |
| `text-iwana-primary` | Nombre de producto en marca | Ya existente |
| `ring-iwana-primary` | Solo vía `interactiveFocusClassName` (focus) | No reintroducir ring decorativo en marca |
| `interactiveFocusClassName` | P1 — anillo focus-visible | Valor canónico en `packages/ui/src/focus.ts` (Fase-1 §5) |

**No se añaden tokens nuevos.** No se tocan `--color-iwana-primary*`, `--color-iwana-secondary*`, radios globales ni sombras DS.

### Definición canónica de foco (reafirmada)

```typescript
// packages/ui/src/focus.ts — no modificar en esta fase
export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2';
```

Import autorizado en web: `import { cn, interactiveFocusClassName } from '@iwana/ui'` (o equivalente ya usado en el archivo).

---

## 3. Anatomía canónica — P1 Foco

### Interactivos obligatorios

Aplicar `interactiveFocusClassName` (vía `cn(...)`) a **todos** estos nodos en `Sidebar.tsx`:

| Nodo | Condición | Notas de implementación |
| --- | --- | --- |
| Cada `<Link>` de ítem de nav en `NavItems` | Activo e inactivo | Añadir la constante **sin** alterar las clases de estado activo Fase-1 |
| `<Link>` de marca expandida (home + wordmark) | Visible cuando no colapsado en `lg` | El foco envuelve el link completo |
| `<Link>` de marca colapsada (solo isotipo) | `lg:flex` cuando `desktopCollapsed` | Idem |
| `<button>` cierre mobile (`aria-label` menú cerrar) | `lg:hidden` | Foco visible en drawer ~375px (CA-SB-07) |

### Clases canónicas P1 (fragmento autorizado)

```tsx
className={cn(
  /* …clases existentes del nodo… */,
  interactiveFocusClassName,
)}
```

**Prohibido:** `outline-*` / `ring-*` de foco inventados; `focus:` en lugar de `focus-visible:` salvo que ya existiera por otra razón ajena a esta fase.

### Estados requeridos (foco)

| Estado | Requisito |
| --- | --- |
| Default | Sin anillo |
| `:focus-visible` (teclado) | Anillo 2px `iwana-primary` + offset según constante |
| Hover / active (pointer) | Sin cambio de contrato de foco |
| Disabled | N/A — estos controles no están disabled en el shell actual |
| Dark | Offset `dark-surface-2` (ya en la constante) |

---

## 4. Anatomía canónica — P2 Canvas

### Antes (defectuoso)

```tsx
<main className="flex-1 overflow-y-auto bg-iwana-surface-soft dark:bg-dark-surface lg:rounded-3xl">
```

### Después (autorizado)

```tsx
<main className="flex-1 overflow-y-auto bg-iwana-surface-soft dark:bg-dark-surface">
```

### Regla de separación shell

- Separación sidebar ↔ canvas **solo** por contraste de superficie:
  - Sidebar: `bg-white/95` (light) / `dark:bg-dark-surface-2/95`
  - Canvas: `bg-iwana-surface-soft` / `dark:bg-dark-surface`
- **Prohibido** en el `<main>` del layout protegido: `lg:rounded-3xl`, `rounded-3xl`, `rounded-[*]`, u otro radio que recree la “mordida” junto al sidebar.
- Radios de **contenido interno** (cards, paneles) no se tocan.

### Clases canónicas P2

`flex-1 overflow-y-auto bg-iwana-surface-soft dark:bg-dark-surface`

---

## 5. Anatomía canónica — P3 Marca (isotipo squircle)

Aplica al **contenedor** del isotipo en **ambas** variantes del sidebar (expandida y colapsada). El wordmark / eyebrow no cambian de tipografía ni tokens.

### Antes (defectuoso — ambas variantes)

```tsx
<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-iwana-surface-soft ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:ring-dark-border-2">
  <img … className="h-6 w-6 object-contain" />
</div>
```

*(La variante colapsada omite `shrink-0` hoy; la adenda unifica con `shrink-0` en ambas.)*

### Después (autorizado — ambas variantes)

**Contenedor:**

```
flex h-10 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3
```

**Imagen:**

```
h-7 w-7 object-contain
```

### Clases canónicas P3 (resumen)

| Elemento | Clases autorizadas |
| --- | --- |
| Contenedor squircle | `flex h-10 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3` |
| `<img>` isotipo | `h-7 w-7 object-contain` (+ `alt=""` / `aria-hidden` según patrón actual) |

### Reglas duras P3

1. **No deformar el PNG:** `object-contain` obligatorio; **prohibido** `object-cover`, stretch vía `w-full h-full` sin contain, o forzar aspect distinto al del activo.
2. **Sin ring decorativo** en light: retirar `ring-1 ring-inset ring-iwana-primary-100`. El fondo `bg-iwana-surface-soft` sobre sidebar blanco basta.
3. **Sin ring decorativo en dark:** retirar `dark:ring-dark-border-2`. La legibilidad viene de `dark:bg-dark-surface-3` sobre sidebar `dark-surface-2` (CA-SB-06).
4. Dimensiones del contenedor: **40×44 CSS px** (`h-10` × `w-11`) — squircle horizontal; radio `rounded-xl` (token `--radius-xl`).
5. En sidebar colapsado `lg:w-[90px]`: el squircle **no** debe desbordar ni recortar el isotipo (CA-SB-05); padding del header colapsado (`lg:px-2` / `lg:justify-center`) se mantiene.

### Estados de presentación — marca

| Estado UI | Contenedor / img | Notas |
| --- | --- | --- |
| Expandido desktop | Squircle P3 + wordmark | Link con `interactiveFocusClassName` |
| Colapsado desktop (`lg:w-[90px]`) | Solo squircle P3 | Mismo contenedor/img; link con `aria-label` home |
| Mobile drawer (ancho ~290px) | Squircle P3 + wordmark | Header con botón cerrar + foco P1 |
| Dark | `dark:bg-dark-surface-3` sin ring | Sin dependencia del ring retirado |
| Hover marca | Sin clase nueva obligatoria | No inventar hover ring |
| Loading / skeleton / error | Fuera de alcance | Assets ya resueltos por `usePlatformBrandingAssets` |

---

## 6. Decisión TopHeader (logo mobile)

**Veredicto DS-OWNER: NO entra en esta adenda — diferido.**

| Criterio | Evaluación |
| --- | --- |
| Alcance del prompt P3 | Explícito: sidebar expandido/colapsado |
| Anatomía actual `TopHeader.tsx` | Contenedor `h-8 w-8 rounded-xl` + img `h-6 w-6` + **aún con ring** — densidad distinta (header compacto mobile) |
| Consolidación `PlatformBrandMark` | Deuda estratégica §8.2 del prompt; no gate de esta fase |
| Riesgo de ampliar alcance | Alinear TopHeader forzaría decisión de densidad (40×44 vs 32×32) y posible reflow del cluster hamburger+logo |

**Instrucción a FE-PLATFORM:** no modificar el logo de `TopHeader.tsx` en esta fase.  
**Deuda registrada:** alinear TopHeader al squircle canónico (o a un `PlatformBrandMark` con variante `density: compact | default`) en fase posterior; EM-ARCH la registra en informe de fase si se emite.

---

## 7. Ítem activo del nav — intacto (Fase-1)

**Cualquier diff que altere estas clases del estado `isActive` es defecto bloqueante (CA-SB-08):**

```
relative bg-iwana-surface-soft text-iwana-primary shadow-[var(--shadow-iwana-card)] ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:text-white dark:ring-dark-border-2
```

Barra lima (Fase-1 §2):

```
absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400
```

Única adición permitida en el `<Link>` activo: **`interactiveFocusClassName`** (P1). Nada más.

---

## 8. Criterios de aceptación (alineados al prompt)

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-SB-01 | Todo `<Link>` de nav del sidebar, los dos links de marca (expandido/colapsado) y el botón cerrar mobile incluyen `interactiveFocusClassName` | SR-QA |
| CA-SB-02 | El `<main>` del layout protegido **no** incluye `lg:rounded-3xl` ni clase de radio equivalente en el canvas del shell | SR-QA |
| CA-SB-03 | Contenedor isotipo sidebar: `h-10 w-11 rounded-xl`; img `h-7 w-7 object-contain`; sin ring claro en light (ni ring dark decorativo) | SR-QA |
| CA-SB-04 | Proporciones del PNG intactas (`object-contain`); sin `object-cover` ni stretch | SR-QA |
| CA-SB-05 | Sidebar colapsado (`lg:w-[90px]`): squircle 44×40 no desborda ni corta el isotipo | SR-QA |
| CA-SB-06 | Dark: separación isotipo legible vía `dark:bg-dark-surface-3` sin depender del ring retirado | SR-QA |
| CA-SB-07 | Viewport ~375px: drawer mobile cierra con botón que tiene foco visible; sin regresión de overflow del header de marca | SR-QA |
| CA-SB-08 | Ítem activo del nav **sin cambios** de sombra/ring/`rounded-2xl`/barra lima respecto al contrato Fase-1 (salvo adición de `interactiveFocusClassName`) | SR-QA / DS-OWNER |

---

## 9. Archivos esperados (FE-PLATFORM)

| Archivo | Acción |
| --- | --- |
| `apps/web/src/components/layout/Sidebar.tsx` | P1 + P3 |
| `apps/web/src/app/(protected)/layout.tsx` | P2 |
| `apps/web/src/components/layout/TopHeader.tsx` | **No tocar** (logo diferido) |
| `packages/ui/src/styles/globals.css` | **No tocar** |
| `packages/ui/src/focus.ts` | **No tocar** (solo consumir) |

Extracción local opcional `PlatformBrandMark` **solo en web**: permitida si reduce duplicación sidebar expandido/colapsado **sin** tocar TopHeader ni portal y **sin** cambiar las clases canónicas de esta adenda.

---

## 10. Veredicto carril rápido (§3bis.3)

### Resultado: **GO**

| Dimensión §3bis.3 | ¿Se altera? | Evidencia |
| --- | --- | --- |
| Alcance funcional / producto | No | Remediación visual + a11y de foco en shell web; sin features nuevas |
| Contrato de datos / API | No | Sin backend |
| Boundary Modulith | No | Solo `apps/web` layout shell; sin portal ni packages de dominio |
| Tokens de marca en `globals.css` | No | Solo composición Tailwind existente + consumo de export ya congelado |

**Justificación:** los tres hallazgos (P1–P3) son cambios de **presentación y cumplimiento WCAG de foco** sobre contrato ya existente (`interactiveFocusClassName`, superficies `iwana-surface-soft` / `dark-surface-*`, radios utilitarios). No requieren ADR ni gate CTO. EM-ARCH no necesita reabrir el workflow de 8 gates para autorizar la implementación; sí consolida G5/G6 tras FE + QA.

**No es GO con ajustes:** las decisiones ambiguas (TopHeader, ring dark, unificación `shrink-0`) quedan resueltas en esta adenda v1.0.  
**No es NO-GO:** no hay propuesta de token de marca nuevo ni de aplanar el activo del nav.

### Condiciones de stop (heredadas del prompt)

- Intento de aplanar el activo del nav “de paso” → STOP + escalar EM-ARCH.
- Necesidad de editar `globals.css` o portal → STOP + escalar EM-ARCH.
- `interactiveFocusClassName` insuficiente / ausente del export → `[BLOQUEO]` a DS-OWNER (hoy: export verificado en `packages/ui/src/focus.ts`).

---

## 11. Firma

| Rol | Acción | Fecha |
| --- | --- | --- |
| AI-DS-OWNER | Emite y congela adenda v1.0 — veredicto **GO** | 2026-08-10 |
| AI-FE-PLATFORM | Implementa solo contra esta ruta + versión | Pendiente |
| AI-SR-QA | Verifica CA-SB-01…08 | Pendiente |
| AI-EM-ARCH | Consolida fase; registra deudas §6 y prompt §8 | Pendiente |

**Artefacto congelado:** `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md` v1.0
