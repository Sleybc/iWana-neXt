# Contrato DS — recomposición del `/dashboard` del portal

**Versión:** 1.2
**Estado:** **Congelado** (v1.0 el 2026-08-04; **re-sync v1.1** el 2026-08-10; **re-sync v1.2** el 2026-08-10 — protocolo §3bis: cambio post-congelación versionado y notificado a AI-FE-PLATFORM y AI-SR-QA vía AI-EM-ARCH)
**Fecha:** 2026-08-10
**Autor:** AI-DS-OWNER
**Ejecuta:** AI-FE-PLATFORM · **Verifica:** AI-SR-QA · **Orquesta:** AI-EM-ARCH

### Changelog v1.2 (único delta vs v1.1)

| Qué cambia | Qué no cambia |
| --- | --- |
| **§1.7** — misma física de escalón que el eyebrow: ranura `description` (y todo texto muted de cuerpo sobre shell tintado) con `accent` ∈ {`danger`,`warning`} pasa de `text-gray-500 dark:text-gray-400` a `text-gray-700 dark:text-gray-200`; `neutral`/`primary` conservan gray-500/400 | Anatomía, API, estados, lima-como-predicado, sombras, lienzo, capas z, matriz eyebrow de v1.1 |
| Rationale: G6-4 axe light NO-GO — `description` muted sobre shell `danger` ≈ **4,45:1** (misma física que el gap eyebrow) + atenuados §3.3 | Cero tokens nuevos; cero hex; **prohibido** lima / `opacity-*` |

> **Carril rápido (EM-ARCH):** remedia contraste no-marca sin ADR/CTO. FE aplica la receta de §1.7 (eyebrow + description) contra este artefacto; QA re-mide.

### Changelog v1.1 (delta vs v1.0 — histórico)

| Qué cambia | Qué no cambia |
| --- | --- |
| **§1.7** — matriz eyebrow × `accent`: en shells tintados `danger` y `warning`, el color del eyebrow pasa de `text-gray-500 dark:text-gray-400` a `text-gray-700 dark:text-gray-200` (misma tipografía de `.portal-eyebrow-muted`) | Anatomía, API, estados, lima-como-predicado, sombras, lienzo, capas z, checklist salvo ítem A de contraste eyebrow |
| Rationale: hallazgo QA post-Task 6 (~**4,45:1** eyebrow muted sobre acento `danger`) + contrato de atenuados §3.3 (escalón de token, cero opacidad) | Cero tokens nuevos; cero hex; **prohibido** lima (`.portal-eyebrow` / `secondary-*`) sobre rose/amber |

**Entradas leídas antes de redactar (protocolo §7.4 — todas abiertas, ninguna citada de memoria):**

- [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) — **En revisión**. Alcance §2, matriz §5.2, criterios §6, RNF §7, riesgos §8. Sucede a [`HLD-MOD02-DASHBOARD-EMPRESA-v1.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) **(superado)**.
- [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) — Vigente. Hallazgos H-01…H-18, desempates §5, lluvia §7.2.
- [`ADR-075`](../adrs/ADR-075-Contrato-Capas-Z-Portal.md) — §1 delega a este contrato los valores numéricos de los escalones.
- [`ADR-056`](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) (Aprobado) §2 — norma dark y emparejamiento obligatorio.
- [`ADR-023`](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) (Aprobado) — sistema CSS-first, **prohibido `tailwind.config.js`**.
- [`spec Firma iWana`](2026-07-12-firma-iwana-diseno-visual-design.md) §3 (nueve elementos y reglas semánticas del lima), §4 (ítems 1.2bis, 1.3, 2.1), §5.
- [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0 — precedente estructural; §2 barra lima, §3 sombras, §7 BLOQUEO-1/2 (**alcance `apps/web`**).
- [`2026-07-26-estados-atenuados-contraste-ds-contrato.md`](2026-07-26-estados-atenuados-contraste-ds-contrato.md) §3.3 (piso atenuado), §4.2 (`loading` no exento), §4.4 (matriz).
- `packages/ui/src/styles/globals.css` — **única fuente autorizada de tokens**, recorrida entera el 2026-08-04.
- `apps/portal/src/components/shared/portal-ui.tsx` — inventario de primitives, líneas verificadas una a una.
- Skills aplicadas: `iwana-identity-ui-review` (`tokens.md`, `firma-elements.md`, `component-recipes.md`), `core-components`, `tailwind-patterns`.

> **Versión de contrato:** 1.2 — congelada (re-sync). Cualquier modificación posterior se versiona como v1.3+ y **se notifica a AI-FE-PLATFORM y AI-SR-QA a través del orquestador antes de ejecutarse**.

> **Deslinde de dominio:** este documento fija **tokens, API de componente y estados requeridos**. No fija flujo, jerarquía de información, política de refresco ni qué bloque va dónde: eso es de AI-PROD-UX, que trabaja en paralelo sobre el mismo HLD. Donde este contrato roza el producto, lo hace como restricción ("si se renderiza X, cumple Y"), nunca como prescripción de contenido.

---

## 0. Método de medición y verificación de tokens

### 0.1 Método

Ratios calculados por AI-DS-OWNER con la fórmula de luminancia relativa de WCAG 2.2 sobre los valores vigentes en `globals.css` y la paleta `gray-*` de Tailwind v4 (**verificado: el repo no la sobrescribe**; `--color-iwana-neutral-*` es una rampa aparte). Las superficies con opacidad se **componen** contra su fondo real antes de medir, según la fórmula del contrato de estados atenuados §0.

**Calibración del método**, contra tres valores publicados con anterioridad y medidos de nuevo aquí: `gray-500` sobre blanco → 4,84 (coincide); `gray-700` sobre blanco → 10,31 (coincide con 10,30); `iwana-primary` sobre blanco → 17,32 (coincide). Las tres coincidencias hacen fiable la cuarta medición de §0.3, que **no** coincide con lo documentado.

### 0.2 Tokens citados en este contrato — todos existentes, ninguno nuevo salvo §7

| Token | Línea en `globals.css` | Uso en este contrato |
| --- | --- | --- |
| `--color-iwana-primary` | 32 | Texto de marca; sustituye los dos hex crudos de H-15 |
| `--color-iwana-primary-50` | 33 | Superficie de acento `primary` de la tarjeta de indicador |
| `--color-iwana-secondary` | 47 | Barra lima del ítem activo (**uso decorativo**) |
| `--color-iwana-secondary-100` / `-900` | 49 / 58 | Par tonal lima de completitud (`Badge variant="lime"`) |
| `--color-iwana-secondary-400` | 52 | Lima mínimo en oscuro (ADR-056 §2) |
| `--color-iwana-secondary-700` | 56 | Texto/ícono lima sobre claro — **ver corrección de §0.3** |
| `--color-iwana-neutral-50` | 64 | **Lienzo de página del portal** (§6) |
| `--color-iwana-surface-soft` | 79 | Superficie de apoyo: acento neutro, vacíos, cabecera de tabla |
| `--color-dark-surface` / `-2` / `-3` / `-4` | 122-125 | Superficies oscuras |
| `--color-dark-border` / `-2` | 127-128 | Bordes oscuros |
| `--shadow-iwana-soft` | 135 | **Reposo** — nivel 1 de la sombra dual (tarjetas y paneles) |
| `--shadow-iwana-active` | 136 | **Elemento en curso** — nivel 2 de la sombra dual (hover, foco) |
| `--shadow-iwana-lg` | 133 | Flotantes: menús, diálogos, cajones |
| `--shadow-iwana` / `--shadow-iwana-card` | 132 / 137 | Citados solo para dejar constancia de que **su valor es idéntico** y de que ninguno es un nivel de la sombra dual — ver §5.2 |
| `.portal-eyebrow` | 218 | Eyebrow normado (sustituye los tres tracking a mano) |

**Cero tokens de color nuevos.** Los únicos tokens nuevos que este contrato introduce son los siete de capa de §7, y seis de ellos están mandatados por ADR-075.

### 0.3 Corrección de medición · `iwana-secondary-700` no da 6,2:1 sobre blanco

El comentario de `globals.css:55` y la tabla del contrato del 2026-07-20 §2 afirman *contraste 6.2:1* para `--color-iwana-secondary-700` (`#6A7A1C`) sobre blanco. **Medido de nuevo con el método calibrado de §0.1: 4,76:1.**

| Par medido | Ratio | Umbral aplicable | Veredicto |
| --- | --- | --- | --- |
| `iwana-secondary-700` sobre blanco | **4,76:1** | 4,5 (SC 1.4.3) | Cumple — margen 0,26, no 1,7 |
| `iwana-secondary-700` sobre `iwana-surface-soft` | **4,53:1** | 4,5 | Cumple — margen 0,03 |
| `iwana-secondary-700` sobre `iwana-primary-50` | **4,49:1** | 4,5 | **Falla por 0,01** |
| `iwana-secondary-700` como **ícono** sobre `iwana-primary-50` | 4,49:1 | 3,0 (SC 1.4.11, no textual) | Cumple |
| `iwana-secondary-400` sobre `dark-surface-2` | 9,76:1 | 4,5 | Cumple |
| `iwana-secondary-400` sobre `dark-surface-3` | 8,80:1 | 4,5 | Cumple |
| Blanco sobre `iwana-secondary-700` (`Button variant="lime"`) | 4,76:1 | 4,5 | Cumple |
| Par tonal lima `secondary-900` sobre `secondary-100` (`Badge variant="lime"`) | 7,47:1 | 4,5 | Cumple |

**Consecuencias vinculantes de este contrato:**

1. `text-iwana-secondary-700` sigue siendo el token correcto para **texto lima sobre blanco y sobre `iwana-surface-soft`**, y ahí no se toca.
2. **Prohibido `text-iwana-secondary-700` como texto sobre `iwana-primary-50`** o cualquier superficie tintada de azul claro. Como **ícono** (`aria-hidden`) sí está permitido: el umbral aplicable es 3:1.
3. El margen real sobre `iwana-surface-soft` es **0,03**. Ningún estado puede atenuar ese texto ni un escalón, y **nada que lo contenga puede llevar `opacity`** (contrato de atenuados §3.1).
4. **La cifra está propagada en siete sitios**, todos verificados abriéndolos: `globals.css:22-23` y `:55` · `.agents/skills/iwana-identity-ui-review/SKILL.md:247` · `references/tokens.md:36` · `references/firma-elements.md:37` · `references/evaluation-criteria.md:38` · `docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md` §2. **Ninguna decisión depende de la cifra** —todas concluyen «usa `secondary-700` para texto lima», que sigue siendo correcto—, pero es un caso vivo del defecto que ADR-056 §5 persigue: una afirmación con forma de evidencia, replicada, alojada además en la fuente de verdad de tokens y en la disciplina que audita. `[CONSULTA]` C-DS-02 en §10. Corregir el número **no cambia ningún valor de token**.

---

## 1. `PortalDashboardMetric` — contrato de indicador del home

Extiende `PortalMetricCard` (`apps/portal/src/components/shared/portal-ui.tsx:371`, props en `:356-368`, cáscara en `:305-326`). **Cero tokens nuevos.** Sustituye por completo a `apps/portal/src/components/dashboard/MetricCard.tsx`, que se elimina.

### 1.1 Anatomía

```
┌ shell: portalMetricCardShellClassName + acento + sombra ─────────┐
│  [eyebrow]                                    [ícono, opcional]  │  ← tipografía `.portal-eyebrow-muted` + color por §1.7
│  1.284 / 1.500                                                   │  ← ranura de cifra (mono, tabular)
│  Visitas de hoy                                     [delta]      │  ← rótulo + badge tonal
│  Programadas para la jornada en curso                            │  ← descripción: tipografía cuerpo + color por §1.7
└──────────────────────────────────────────────────────────────────┘
```

Cinco ranuras, en este orden y sin excepción: **eyebrow → cifra → rótulo → delta → descripción**. El ícono es un adorno de esquina opcional y **no** portador de estado (§1.5). El color del eyebrow **y** de la descripción (texto muted de cuerpo) **dependen de `accent`** (§1.7); no son siempre el gris-500/400 a secas.

### 1.2 API pública

```ts
/** Reusa el eje semántico del sistema. No existe casilla lima — ver §4. */
type PortalDashboardMetricAccent = PortalMetricCardAccent; // 'neutral' | 'primary' | 'warning' | 'danger'

type PortalDashboardMetricState = 'idle' | 'loading' | 'error';

/** Tono del delta. 'progress' es la ÚNICA puerta al lima en este componente. */
type PortalDashboardMetricDeltaTone = 'progress' | 'neutral' | 'warning' | 'danger';

interface PortalDashboardMetricDelta {
  /** Texto ya legible. Nunca un enum ni un signo suelto. */
  label: string;
  tone: PortalDashboardMetricDeltaTone;
}

interface PortalDashboardMetricProps {
  /** Ranura 1 — categoría del indicador. Tipografía `.portal-eyebrow-muted`; color por matriz §1.7. */
  eyebrow: string;

  /** Ranura 3 — rótulo legible del indicador. Obligatorio: es el nombre accesible. */
  label: string;

  /**
   * Ranura 2. `null` = no hay fuente para este número.
   * NUNCA se sustituye por 0, por un guion ni por un valor derivado (riesgo HLD-DE-04).
   */
  value: number | null;

  /** Denominador opcional. Si `value` es null, `total` no se renderiza. */
  total?: number | null;

  /** Texto que ocupa la ranura de cifra cuando `value === null`. Default: 'Sin dato disponible'. */
  emptyLabel?: string;

  /** Override de formato. Default: agrupación de miles del portal, sin decimales. */
  formatValue?: (value: number) => string;

  /** Ranura 5 — tipografía `text-sm leading-6`; color por matriz §1.7 (description × accent). */
  description?: ReactNode;

  /** Superficie del acento. Default 'neutral'. Sin casilla lima, por contrato (§4). */
  accent?: PortalDashboardMetricAccent;

  /** Ranura 4 — badge tonal. */
  delta?: PortalDashboardMetricDelta;

  /**
   * Destino del indicador accionable. Mutuamente excluyente con `onClick`.
   * Declarar ambos es error de tipo, no una precedencia silenciosa.
   */
  href?: string;
  onClick?: () => void;

  /** Ciclo de vida del bloque que alimenta la tarjeta. Default 'idle'. */
  state?: PortalDashboardMetricState;

  /** Texto visible en la ranura de cifra cuando `state === 'error'`. Default: 'No disponible'. */
  errorLabel?: string;

  /** Acción de recuperación del bloque. Solo se renderiza con `state === 'error'`. */
  onRetry?: () => void;

  /** Ícono decorativo de esquina. Su tono lo deriva `accent`; NO es una prop de color. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

  className?: string;
}
```

**Tipado excluyente exigido** — `href` y `onClick` no conviven:

```ts
type PortalDashboardMetricProps = PortalDashboardMetricBase &
  ({ href: string; onClick?: never } | { onClick: () => void; href?: never } | { href?: never; onClick?: never });
```

**Props deliberadamente ausentes, y por qué:**

| Prop que no existe | Razón |
| --- | --- |
| `tone` | Es el vocabulario paralelo que `MetricCard.tsx:12` inventó y por el que el lima entró como adorno (H-13). Muere con el componente |
| `iconTone` / `iconClassName` | Un color de ícono libre reabre exactamente la misma puerta. El tono lo deriva `accent` |
| `valueClassName` | La cifra es tipografía de sistema, no de consumidor |
| `emphasized` / `isActive` | Existen en `PortalMetricCard` para grillas de filtro. En el home no hay tarjeta seleccionable: se omiten para no ofrecer un estado sin semántica |
| `trend` numérico | Sin endpoint de series (HLD §2.2). Un delta que el backend no entrega es un número inventado |

### 1.3 Ranura de cifra — las tres ocupaciones posibles

La ranura es una y solo una a la vez. **Nunca se desmonta**: cambia su contenido, no su caja (evita CLS y respeta el contrato de atenuados §4.2 punto 5).

| Ocupación | Condición | Receta de clase | Ratio medido |
| --- | --- | --- | --- |
| **Cifra** | `state='idle'` y `value !== null` | `font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white` (heredada de `portal-ui.tsx:395`) | ≥ 15,6:1 en claro; ≥ 14,3:1 en oscuro |
| **Sin dato** | `state='idle'` y `value === null` | `text-sm font-semibold text-gray-700 dark:text-gray-200` — **sin `font-mono`, sin `uppercase`, sin `tracking`** | **9,72:1** claro (peor acento) · **11,59:1** oscuro |
| **No disponible** | `state='error'` | igual que «sin dato», más el botón de reintento | idénticos |

**`tabular-nums` es obligatorio** y ya viene en el primitive: es el elemento de firma 6 (mono técnico) y evita el salto de layout al refrescar. Es una de las dos cosas que la reimplementación a mano perdió (H-12, elemento 6: `MetricCard.tsx:49` usa `font-bold` sin cifras tabulares).

**Por qué `gray-700 / gray-200` y no el par de hoy** — es la mitigación del riesgo **Crítico HLD-DE-04** y el bloqueante **B-1** del gate G6:

| Par | Superficie | Ratio | Umbral | Veredicto |
| --- | --- | --- | --- | --- |
| `gray-400` (hoy, `MetricCard.tsx:53`) | blanco | 2,60:1 | 4,5 | **Falla** — es el defecto que bloquea |
| `gray-500` (hoy, oscuro) | `dark-surface-2` | 3,29:1 | 4,5 | **Falla** |
| **`gray-700`** (contrato) | `iwana-surface-soft` (acento neutro) | **9,81:1** | 4,5 | Cumple |
| **`gray-700`** (contrato) | `iwana-primary-50/70` compuesto (acento primary) | **9,72:1** | 4,5 | Cumple — peor caso claro |
| **`gray-700`** (contrato) | `amber-50/80` compuesto (acento warning) | **9,91:1** | 4,5 | Cumple |
| **`gray-200`** (contrato) | `dark-surface-3` (acento neutro) | **11,59:1** | 4,5 | Cumple |

El escalón elegido es el de §3.3 del contrato de atenuados aplicado al eje de la cifra: **un solo escalón** desde el token pleno (`gray-900`/`white` → `gray-700`/`gray-200`), **cero opacidad**. Se rechaza expresamente el piso `gray-500`/`gray-400` que el informe recomendaba como mínimo: ese piso es para texto **secundario**, y aquí el texto **ocupa el lugar del dato primario**. Un margen de 0,34 sobre AA no es aceptable en el texto que existe para no mentir.

**Distinción no cromática obligatoria** (SC 1.4.1): «sin dato» se distingue de una cifra por **tres** rasgos simultáneos —ausencia de `font-mono`, peso y tamaño distintos, y texto en lenguaje natural—, no por color. Es lo que permite bajar solo un escalón sin recurrir a la atenuación.

### 1.4 Indicador accionable

Con `href`, la tarjeta entera es el destino:

- Renderiza `next/link`, no un `<button>` con navegación imperativa.
- Aplica `interactiveFocusClassName` (exportado por `@iwana/ui`, re-exportado en `portal-ui.tsx:29`). **Prohibido** un anillo de foco a mano.
- Nombre accesible = `label`; si `label` no basta por sí solo, `aria-label` explícito. **Nunca** el número como único nombre.
- El enlace **permanece navegable durante `state='loading'`**: el destino es válido con independencia de que la cifra haya llegado, y deshabilitarlo movería el foco al cambiar de estado. La tarjeta no es el control que dispara la carga, así que el punto 1 de §4.2 del contrato de atenuados no le aplica.
- Objetivo táctil ≥ 44 px: garantizado por `min-h-[148px]` de la cáscara heredada (RNF-V2-03).

Que el destino conserve el filtro en la URL (CA-V2-05) es **de AI-PROD-UX**: este contrato solo exige que `href` sea una cadena completa y que la tarjeta no la manipule.

### 1.5 Ícono — cierre de la puerta de H-13

El ícono es opcional, decorativo y `aria-hidden="true"`. Su tono **se deriva de `accent`** mediante una función interna sin prop asociada:

| `accent` | Chip del ícono, claro | Chip del ícono, oscuro |
| --- | --- | --- |
| `neutral` | `bg-white text-gray-500` | `dark:bg-dark-surface-4 dark:text-gray-300` |
| `primary` | `bg-iwana-primary-50 text-iwana-primary` | `dark:bg-iwana-primary-800/40 dark:text-iwana-primary-200` |
| `warning` | `bg-amber-100 text-amber-700` | `dark:bg-amber-500/15 dark:text-amber-400` |
| `danger` | `bg-rose-100 text-rose-700` | `dark:bg-rose-500/15 dark:text-rose-400` |

**No hay fila lima.** El ícono es un elemento no textual: umbral 3:1 (SC 1.4.11), cumplido por los cuatro pares. Si el consumidor quiere un ícono lima, la respuesta del contrato es que **el indicador no es de completitud**, y si lo fuera lo diría el `delta` con `tone='progress'`.

### 1.6 Delta

`delta` es la **única** ranura de la tarjeta que puede pintar lima, y solo con `tone='progress'`. Mapeo cerrado a `Badge` de `@iwana/ui` (`packages/ui/src/components/Badge.tsx:14-23`):

| `tone` | `Badge variant` | Significado admitido | Ratio |
| --- | --- | --- | --- |
| `progress` | `lime` | Avance, completitud, meta alcanzada | 7,47:1 |
| `neutral` | `neutral` | Contexto sin juicio de valor | — |
| `warning` | `warning` | Requiere atención | — |
| `danger` | `error` | Incumplimiento | — |

`delta.label` es texto ya legible en español, sentence case. **Prohibido** exponer enums, y prohibido que el delta sea el único portador de la señal (SC 1.4.1): el badge lleva siempre texto, no solo color.

### 1.7 Texto atenuado × `accent` — contraste sobre shells tintados (v1.2)

**Problema cerrado (v1.1 — eyebrow):** AI-SR-QA midió el eyebrow con `.portal-eyebrow-muted` (`text-gray-500 dark:text-gray-400`) sobre el shell `accent='danger'` (superficie rose tintada) en **~4,45:1** — bajo el piso AA 4,5:1 (SC 1.4.3).

**Problema cerrado (v1.2 — description):** G6-4 axe light midió la ranura `description` con `text-gray-500` sobre el mismo shell `danger` en **≈4,45:1** — **misma física** que el gap del eyebrow. El residual vive en el informe vivo §6 / dictamen G6-4.

**Remedio (carril rápido, EM-ARCH):** un único escalón de token para **todo** texto muted secundario de la métrica sobre shells tintados `danger`/`warning`: `text-gray-700 dark:text-gray-200` (≥ **9,7:1** en el peor caso claro documentado en §1.3). Sobre `neutral`/`primary` se conserva `text-gray-500 dark:text-gray-400`. **No** lima; **no** hex; **no** `opacity-*`.

Alcance de ranuras: **eyebrow** (tipografía `.portal-eyebrow-muted` intacta) · **`description`** (tipografía de cuerpo `text-sm leading-6` intacta) · **cualquier otro muted de cuerpo** en la misma cáscara de métrica (p. ej. sufijos `text-sm font-normal text-gray-500` adyacentes al valor). El **rótulo** (`title`) no es muted: no entra en esta matriz.

#### Matriz vinculante — eyebrow

| `accent` | Tipografía | Color (claro / oscuro) | Notas |
| --- | --- | --- | --- |
| `neutral` | `.portal-eyebrow-muted` | `text-gray-500` / `dark:text-gray-400` (clase íntegra) | Sin cambio vs v1.0 |
| `primary` | `.portal-eyebrow-muted` | `text-gray-500` / `dark:text-gray-400` (clase íntegra) | Sin cambio vs v1.0 |
| `warning` | Tipografía de `.portal-eyebrow-muted` | **`text-gray-700 dark:text-gray-200`** | Override de color; **prohibido** lima |
| `danger` | Tipografía de `.portal-eyebrow-muted` | **`text-gray-700 dark:text-gray-200`** | Cerrado en v1.1; **prohibido** lima |

#### Matriz vinculante — `description` (y muted de cuerpo en shell)

| `accent` | Tipografía | Color (claro / oscuro) | Notas |
| --- | --- | --- | --- |
| `neutral` | `text-sm leading-6` (cuerpo) | `text-gray-500` / `dark:text-gray-400` | Sin cambio vs v1.0/v1.1 |
| `primary` | `text-sm leading-6` (cuerpo) | `text-gray-500` / `dark:text-gray-400` | Sin cambio vs v1.0/v1.1 |
| `warning` | `text-sm leading-6` (cuerpo) | **`text-gray-700 dark:text-gray-200`** | Mismo escalón que eyebrow; **prohibido** lima |
| `danger` | `text-sm leading-6` (cuerpo) | **`text-gray-700 dark:text-gray-200`** | Cierra gap G6-4 ≈4,45:1; **prohibido** lima |

#### Receta CSS/token para AI-FE-PLATFORM

```tsx
// Pseudocódigo de contrato — color muted por accent (eyebrow + description + muted de cuerpo)
const mutedOnTintClass =
  accent === 'danger' || accent === 'warning'
    ? 'text-gray-700 dark:text-gray-200'
    : null; // null → muted por defecto gray-500 / dark:gray-400

// Eyebrow
className={cn('portal-eyebrow-muted', mutedOnTintClass)}

// Description (y cualquier muted de cuerpo en la cáscara)
className={cn(
  'mt-1 text-sm leading-6',
  mutedOnTintClass ?? 'text-gray-500 dark:text-gray-400',
)}
```

Helper recomendado (paridad con `portalMetricEyebrowClassName`): `portalMetricMutedTextClassName(accent)` que devuelve `text-gray-700 dark:text-gray-200` si `accent` ∈ {`warning`,`danger`}, else `text-gray-500 dark:text-gray-400`. Aplicarlo a `description` y a muted de cuerpo en `PortalMetricCard` / `PortalDashboardMetric`.

**Alternativa equivalente (si FE prefiere modificador nombrado en `globals.css`):** declarar `.portal-eyebrow-muted-on-tint` / clase de cuerpo on-tint con el mismo par de color, y usarla **solo** cuando `accent` ∈ {`warning`,`danger`}. No es token de marca nuevo; es atajo de composición. Las matrices de arriba mandan en cualquier caso.

**Prohibiciones explícitas en estas ranuras:**

1. `.portal-eyebrow` / `text-iwana-secondary-*` sobre shell `danger` o `warning` (lima sobre rose/amber = adorno + riesgo de contraste).
2. `opacity-*` o grises más claros que el escalón contratado (`gray-400`/`gray-500` sobre tint danger/warning) en eyebrow, `description` o muted de cuerpo.
3. Hex crudos o rampas ajenas (`slate-*`, etc.).

**Verificación QA:** re-medir **eyebrow y `description`** en los cuatro acentos × dos temas; umbral ≥ 4,5:1. Peor caso esperado en `danger`/`warning` con el escalón: ≥ 9,7:1 (misma familia de medición §1.3). G6-4 axe light sin filtros debe pasar CA-V2-07 tras aplicar FE.

---

## 2. Matriz de estados requeridos

Materializa la idea 8 de §7.2 del informe: **la matriz forma parte del contrato, no de la prosa**. Cada casilla es «receta» o «no aplica **con razón**». Una casilla vacía es un contrato incompleto y, por esta spec, un hallazgo de review.

Leyenda: **R** = receta obligatoria · **N/A** = no aplica, con justificación en la tabla de notas.

### 2.1 `PortalDashboardMetric`

| Estado | Veredicto | Receta / razón |
| --- | --- | --- |
| **hover** | R (solo con `href`/`onClick`) | `hover:shadow-iwana-active transition-shadow` sobre la cáscara. Sin cambio de color de fondo: el acento codifica semántica, no interacción. **N/A sin destino** — una tarjeta de lectura no simula ser pulsable |
| **foco** | R (solo con `href`/`onClick`) | `interactiveFocusClassName`, sin excepción ni override. **N/A sin destino**: un elemento no focalizable no puede tener estado de foco, y no se le añade `tabIndex` para fabricarlo |
| **activo** | **N/A justificado** | El home no tiene selección: sus indicadores navegan, no filtran en sitio. `PortalMetricCard` sí ofrece `isActive`, y este contrato **omite deliberadamente** esa prop (§1.2). Si una fase futura introduce filtro en sitio, la casilla se abre con `ring-2 ring-iwana-primary/40`, ya existente en `portal-ui.tsx:323` |
| **deshabilitado** | **N/A justificado** | Un indicador sin permiso **no se renderiza deshabilitado: no se renderiza** (HLD §5.1). Una tarjeta atenuada informa de la existencia de un dato al que el usuario no tiene acceso — es fuga de información y ruido. Corolario: la tarjeta nunca lleva `disabled` ni `aria-disabled`, luego nunca está exenta de contraste (contrato de atenuados §2) |
| **cargando** | R | `state='loading'` → `aria-busy="true"` en la tarjeta; la ranura de cifra se sustituye **en sitio** por `SkeletonBlock` con la altura exacta de la línea de cifra; eyebrow y rótulo permanecen en su token pleno. **`opacity-*` prohibido en cualquier valor** (contrato de atenuados §4.2). Sin spinner |
| **vacío** | R | `value === null` → «sin dato» de §1.3. Es un estado **de dato**, no de error: la tarjeta no cambia de acento ni de superficie |
| **error** | R | `state='error'` → `errorLabel` en la ranura de cifra + botón de reintento si hay `onRetry`. **La tarjeta no se desmonta, no cambia de acento a `danger` y no borra su rótulo.** Sin región viva propia — ver nota (a) |
| **éxito** | **N/A justificado** | Un indicador no tiene resultado de operación: refleja el estado del mundo, no la consecuencia de una acción del usuario. Si un valor «bueno» debe destacarse, es `delta` con `tone='progress'`, no un estado de la tarjeta |
| **solo lectura** | **N/A justificado** | La tarjeta **siempre** es de solo lectura; no edita nada. Un estado que coincide con el estado permanente del componente no es un estado (contrato de atenuados §4.4, fila `readonly`) |

**Nota (a) — por qué el error de la tarjeta no lleva `aria-live`.** El home hace fan-out a hasta seis contratos (HLD §4.4) y puede degradar varios bloques a la vez. Seis regiones vivas simultáneas producen un anuncio ininteligible. **La responsabilidad del anuncio es del bloque, no de la tarjeta:** un `PortalAlert` por bloque (`live='polite'`, `portal-ui.tsx:1441`) anuncia una vez. La tarjeta aporta la señal **visual** de su propia degradación. Este reparto es contrato, no preferencia de implementación.

### 2.2 `PortalPanel` como contenedor de bloque (`portal-ui.tsx:1334`)

| Estado | Veredicto | Receta / razón |
| --- | --- | --- |
| hover | **N/A justificado** | Contenedor no interactivo. Los interactivos son sus hijos |
| foco | **N/A justificado** | No focalizable. Si necesitara serlo por navegación por regiones, el mecanismo es `<section aria-label>`, ya presente en `DashboardClient.tsx:173-217` |
| activo | **N/A justificado** | Sin selección de panel en el home |
| deshabilitado | **N/A justificado** | Un bloque sin permiso no se renderiza (HLD §5.1) |
| cargando | R | `aria-busy="true"` en el `<section>` + contenido sustituido por `SkeletonBlock`. Cabecera (`eyebrow`, `title`, `actions`) **permanece**: es lo que da contexto al esqueleto |
| vacío | R | `PortalEmptyState` (`portal-ui.tsx:1524`) dentro del panel, **nunca en lugar del panel**. Distinguir primera vez de «sin resultados» es de AI-PROD-UX; el contrato solo exige que la ranura `action` se use, no que quede vacía |
| error | R | `PortalAlert variant='error' live='polite'` dentro del panel. El panel sobrevive al fallo de su fuente (H-14, CA-V2-06) |
| éxito | **N/A justificado** | Un panel de lectura no confirma operaciones. `PortalSuccessAlert` (`portal-ui.tsx:1497`) existe para flujos con escritura, que el home no tiene (HLD §2.2) |
| solo lectura | **N/A justificado** | Estado permanente del componente |

### 2.3 `PortalNavListRow` como acceso rápido (`portal-ui.tsx:434`)

| Estado | Veredicto | Receta / razón |
| --- | --- | --- |
| hover | R | `hover:border-iwana-primary hover:bg-iwana-primary-50 dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10`. Se conserva el gesto ya presente en `QuickActionsPanel.tsx:63`, **menos** `hover:-translate-y-0.5`: un desplazamiento sin `prefers-reduced-motion` es deuda conocida (§4.4 del informe) y no se propaga en código nuevo |
| foco | R | `interactiveFocusClassName`, ya cableado en `portal-ui.tsx:468`. Es lo que la reimplementación perdió |
| activo | **N/A justificado** | Un acceso rápido navega y abandona la pantalla; no hay estado persistente que representar. El «dónde estoy» lo porta el ítem activo de la barra lateral (§5) |
| deshabilitado | R | `disabled` **nativo** en el `<button>` + `portalDisabledControlClassName` (`opacity-50`, `portal-ui.tsx:69`). Exento de contraste solo porque la inoperancia está declarada en el DOM (contrato de atenuados §2). **Prohibido** el patrón actual de `QuickActionsPanel.tsx:89`: un `<div aria-disabled="true">` con rol genérico es ARIA inerte que aparenta cobertura. **Nota de alcance:** si un destino no está autorizado para el rol, **no se muestra deshabilitado, se omite** (CA-V2-02). El estado `disabled` queda reservado a destinos existentes y temporalmente inoperantes |
| cargando | **N/A justificado** | La lista de accesos rápidos se deriva de permisos ya resueltos por el layout; no tiene carga propia. Si la envolviera un panel en carga, el estado lo porta el panel (§2.2) |
| vacío | R | Si el rol no tiene ningún destino autorizado, el panel entero rinde `PortalEmptyState`, no una lista de cero filas |
| error | **N/A justificado** | Una fila de navegación no tiene fuente que pueda fallar. El fallo de permisos efectivos es del panel |
| éxito | **N/A justificado** | Navegar no produce confirmación: el resultado es la pantalla de destino |
| solo lectura | **N/A justificado** | No hay edición |

### 2.4 Ítem de navegación de la barra lateral (§5)

| Estado | Veredicto | Receta / razón |
| --- | --- | --- |
| hover | R | Inactivo: `hover:bg-gray-100 dark:hover:bg-white/5` (ya existente, `Sidebar.tsx:198`). Activo: sin cambio — ya está en su estado terminal |
| foco | R | `interactiveFocusClassName`. **Hoy ausente en `Sidebar.tsx:191-201`**: el `<Link>` no lo lleva |
| activo | R | **§5.1 — barra lima.** Es el estado que hoy solo existe por color (H-12, fallo SC 1.4.1) |
| deshabilitado | R | Ya implementado en `Sidebar.tsx:159-186` con `aria-disabled="true"`. **Corrección heredada:** el contrato de atenuados §5 ordena quitar el `opacity-60` de `Sidebar.tsx:165` (apilado sobre `text-gray-400` → 1,70:1). Se ejecuta en el mismo acto |
| cargando | **N/A justificado** | La navegación es estática y se resuelve en el cliente con los permisos ya cargados |
| vacío | **N/A justificado** | Un grupo sin ítems autorizados no se renderiza; no existe «barra lateral vacía» |
| error | **N/A justificado** | Sin fuente de datos propia |
| éxito | **N/A justificado** | Navegar no confirma |
| solo lectura | **N/A justificado** | No hay edición |

---

## 3. Sustitución de las cinco primitives reimplementadas (H-05)

`apps/portal/src/components/dashboard/` no importa **nada** de `portal-ui.tsx`: solo `Card`, `CardContent`, `Badge` y `cn` de `@iwana/ui`. Verificado abriendo los seis archivos del directorio.

**Autorización explícita.** `[DESEMPATE] D-1` está resuelto: el contrato del 2026-07-20 §7 (BLOQUEO-1 «no fusionar `MetricCard`», BLOQUEO-2 «no unificar `PanelCard`/`PortalPanel`») **gobierna `apps/web`, no `apps/portal`**. AI-FE-PLATFORM hizo bien en no extenderlo por analogía; con esta congelación queda satisfecha la condición que pedía. **Los BLOQUEO-1 y 2 siguen íntegramente vigentes para `apps/web`** — nada de este documento los relaja.

### 3.1 Tabla de sustitución — origen y destino verificados línea a línea

| # | Código a mano (ruta:línea verificada) | Primitive que lo sustituye (ruta:línea verificada) | Qué se recupera |
| --- | --- | --- | --- |
| 1 | `dashboard/MetricCard.tsx` completo (73 líneas) | **`PortalDashboardMetric`** (§1), sobre `PortalMetricCard` — `portal-ui.tsx:371` | Cifra `font-mono`+`tabular-nums`, eyebrow normado, `interactiveFocusClassName`, acentos tokenizados, y **el par de contraste que cierra B-1** |
| 2 | `dashboard/DashboardPanel.tsx` completo (55 líneas) | **`PortalPanel`** — `portal-ui.tsx:1334`, **53 consumidores, contados el 2026-08-04** | Divisor de cabecera (`border-b border-gray-100`, `:1352`), `.portal-eyebrow` en vez de tracking a mano, **`<h2>`** en vez del `<h3>` local de `DashboardPanel.tsx:38`, y la ranura `actions` (`:1375`) que el componente local no tiene |
| 3 | Tarjeta de error, `DashboardClient.tsx:135-152` | **`PortalAlert`** `variant='error'` — `portal-ui.tsx:1434` | `role`+`aria-live`+`aria-atomic` (`:1445-1458`), superficie oscura correcta, y la **eliminación del gradiente arbitrario que no se neutraliza en oscuro (H-01, bloqueante B-4)** |
| 4 | Vacíos: `RecentActivityPanel.tsx:101`, `OnboardingAlerts.tsx:46-59` | **`PortalEmptyState`** — `portal-ui.tsx:1524` | Superficie `iwana-surface-soft` ya normada (`:1534`), ranura `action`, y el segundo gradiente arbitrario eliminado |
| 5 | Esqueletos: `DashboardClient.tsx:42`, `:117`, `:121`, `:122` y `RecentActivityPanel.tsx:87` | **`SkeletonBlock`** de `@iwana/ui`, vía `PortalSkeletonBlock` — `portal-ui.tsx:1550` | Cinco copias de la misma cadena literal reducidas a una, con `aria-hidden` por construcción |
| 6 | Fila de navegación, `QuickActionsPanel.tsx:60-80` y `:85-106` | **`PortalNavListRow`** — `portal-ui.tsx:434` | Foco normado (`:468`), `disabled` nativo (`:464`) en vez del `aria-disabled` sobre `<div>` de `:89`, gramática común |

**Adicionalmente, y en el mismo acto:**

| Deuda | Ubicación verificada | Sustitución |
| --- | --- | --- |
| Hex de marca crudo (H-15, ítem 1.3 de spec Firma §4) | `MetricCard.tsx:49` (`text-[#17163A]`) y `TopHeader.tsx:68` (`text-[#17163a]`) | `text-iwana-primary`. El primero desaparece al morir el componente; el segundo se corrige en sitio |
| Eyebrows a mano con tres `tracking` distintos | `DashboardPanel.tsx:34` (`tracking-[0.22em]`), `DashboardClient.tsx:57` (`0.22em`), `QuickActionsPanel.tsx:102` (`0.16em`) | `.portal-eyebrow` / `.portal-eyebrow-muted` (`globals.css:218`, `:224`) |
| `rounded-[24px]` | `RecentActivityPanel.tsx:94`, `:101` | Desaparece con la sustitución 3 y 4 (`rounded-2xl` del primitive vale lo mismo) |
| Mapa de severidad local de 12 combinaciones sin medir | `OnboardingAlerts.tsx:11-36` | **Se elimina entero** en favor de `PortalAlert`. Es la vía por la que el informe §4.5 dejó doce pares sin medir: al eliminarse, no hay que medirlos |

### 3.2 Extensión requerida de `PortalNavListRow` — única API nueva fuera de §1

`PortalNavListRow` solo produce un `<button>` cuando recibe `onClick` (`portal-ui.tsx:459-477`); los accesos rápidos son navegación y deben rendir `next/link` para conservar prefetch y el comportamiento de clic con modificador.

```ts
interface PortalNavListRowProps {
  // ...propiedades vigentes en portal-ui.tsx:421-429, sin cambios...
  /** Destino de navegación. Mutuamente excluyente con `onClick`. */
  href?: string;
}
```

- Con `href` → `next/link` con `portalNavListRowClassName` + `interactiveFocusClassName` + `className`.
- `href` y `onClick` juntos → error de tipo (mismo patrón excluyente de §1.2).
- `disabled` con `href` → **no se renderiza el enlace**: se renderiza el `<div>` inerte de `:479` con el marcador textual correspondiente. Un `<a>` deshabilitado no existe en HTML y fabricarlo con `aria-disabled` es el defecto que §2.3 prohíbe.

Cambio **aditivo y no rompedor** para los consumidores actuales. Aprobado en carril rápido (§8).

---

## 4. El lima como predicado, no como color

### 4.1 La regla

> **El lima (`iwana-secondary*`) no es un valor de color elegible: es la marca de un predicado.** Un elemento pinta lima **si y solo si** afirma una de estas tres cosas: **completitud**, **avance**, o **señal de interacción del sistema** (navegación activa, foco, acento de estado interactivo).
>
> **Prohibido** como valor de cualquier prop de acento genérico (`accent`, `tone`, `variant` de propósito general), como color de énfasis, y como fondo base de paneles, barras de herramientas o estados vacíos.

Es la regla que evitó que `tone="secondary"` —lima— se asignara a **«Eventos de auditoría»** (`DashboardClient.tsx:189`), una cuenta neutra que no es avance, ni éxito, ni completitud (H-13). La divergencia no fue un descuido de quien escribió esa línea: fue posible porque `MetricCard.tsx:12` declaró un vocabulario propio (`'primary' | 'secondary' | 'warning'`) con una casilla lima que el sistema **deliberadamente no ofrece**. La regla se aplica, por tanto, **al tipo**, no a la revisión.

**Prueba operativa, una línea, para review y para el implementador:**

> Sustituye mentalmente el lima por gris. ¿Se pierde información que el usuario necesita?
> **Sí →** el lima es correcto: codifica un predicado.
> **No →** era adorno. Va a `neutral`.

Corolario duro: **añadir una casilla lima a cualquier unión de acento existente o futura es una violación de este contrato**, no una decisión de implementación.

### 4.2 Vocabularios de acento que hoy conviven — mapeo permitido

Cuatro vocabularios verificados en el código, más el `tone` local que muere. Este contrato **no los unifica** —la unificación es la idea 2 de §7.2 del informe y está marcada como **gate**, no como carril rápido—, pero **sí fija el mapeo autorizado entre ellos**, que es lo que impide que el lima migre de uno a otro por traducción descuidada.

| Eje semántico | `PortalMetricCardAccent` (`portal-ui.tsx:303`) | `PortalAlertVariant` (`portal-ui.tsx:1224`) | `Badge variant` (`Badge.tsx:14-23`) | `Button variant` (`Button.tsx:21-56`) |
| --- | --- | --- | --- | --- |
| Neutro / sin juicio | `neutral` | `info` | `neutral` | `ghost` / `outline` |
| Marca / informativo | `primary` | `info` | `primary` o `info` | `primary` |
| Atención | `warning` | `warning` | `warning` | — |
| Fallo | `danger` | `error` | `error` | `destructive` |
| Resultado positivo de una operación | **sin casilla, a propósito** | `success` | `success` | — |
| **Completitud / avance (lima)** | **sin casilla, a propósito** | **sin casilla, a propósito** | `lime` | `lime` (marca/auth/avance explícito, **nunca** el CTA por defecto del portal) |

Lecturas vinculantes de la tabla:

1. **`PortalMetricCardAccent` no tiene casilla `success`.** No es un olvido: un indicador refleja el mundo, no el resultado de una acción. Traducir `success` a `primary` en una tarjeta es correcto; abrir una casilla `success` no.
2. **Ni `PortalMetricCardAccent` ni `PortalAlertVariant` tienen casilla lima, y no se les añade.** Las dos únicas puertas al lima con vocabulario son `Badge variant="lime"` y `Button variant="lime"`.
3. **`Badge variant="lime"` solo se emite cuando el predicado es completitud o avance.** Un badge lime sobre una cuenta neutra es la reencarnación de H-13 en otro componente.
4. **El lima nunca sustituye a `warning`/`error`.** Urgencia y prioridad alta usan esas escalas (spec Firma §3, regla no negociable).
5. **Jerarquía de botones sin cambio:** la acción principal de página es **azul noche** (`Button variant="primary"`), por la enmienda del CTO del 2026-07-23. Si el home llega a tener una franja de acciones, es azul. `variant="lime"` no es su default.

### 4.3 Superficies donde el lima sí es obligatorio en esta recomposición

| Superficie | Predicado que afirma | Receta con token |
| --- | --- | --- |
| Barra del ítem activo de navegación | Señal de interacción — «estás aquí» | `bg-iwana-secondary dark:bg-iwana-secondary-400` (§5.1) |
| `.portal-eyebrow` de los paneles | Acento de sistema | `text-iwana-secondary-700 dark:text-iwana-secondary-400` (`globals.css:219`) — **sobre blanco o `iwana-surface-soft`, nunca sobre `iwana-primary-50`** (§0.3) |
| `delta` con `tone='progress'` | Avance | `Badge variant="lime"` — 7,47:1 |
| Barra de avance de configuración, si PROD-UX la especifica | Avance | `ProgressMeter` (`packages/ui/src/components/ProgressMeter.tsx`) — degradado `from-iwana-primary to-iwana-secondary`, porcentaje en `text-iwana-secondary-700 dark:text-iwana-secondary`. **Es el elemento de firma 3 y hoy está ausente en toda la pantalla** |
| Ranura `trailing` de `PortalNavListRow` | Señal de interacción | `text-iwana-secondary-700 dark:text-iwana-primary-300` (`portal-ui.tsx:452`), ya en el primitive |

> **Que la barra de avance exista o no es decisión de AI-PROD-UX** (depende de si `completedSteps`/`totalSteps` llegan del contrato, que hoy no llegan — §7.1 idea 8 del informe). Este contrato solo fija **cómo** se pinta si se pinta.

---

## 5. Fase-1 de firma del shell del portal

**Herencia versionada, declarada explícitamente:** este apartado es el espejo para `apps/portal` del contrato [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) **v1.0**, congelado para `apps/web`. Se hereda su §2 (barra lima), §3 (norma de sombras) y §5 (foco normado). **No se hereda su §7**: los BLOQUEO-1 y 2 son de alcance `apps/web` y siguen vigentes allí (§3 de este documento). La herencia se registra como **v1.1 del linaje de firma**, alcance `apps/portal`, y ese contrato **no se modifica**: esta spec es la que gobierna el portal.

### 5.1 Barra lima del ítem activo — cierra SC 1.4.1 (H-12, elemento 1)

Estado verificado hoy en `apps/portal/src/components/layout/Sidebar.tsx:196-198`: el ítem activo se resuelve **solo** con tinte de fondo y color de texto. La única señal visual es el color → **fallo de SC 1.4.1**.

**En el `<Link>` activo** — añadir `relative` al `cn(...)` del estado activo:

```tsx
'relative bg-iwana-primary-50 font-medium text-iwana-primary-700 dark:bg-iwana-primary-800/30 dark:text-iwana-primary-200'
```

**Elemento hijo nuevo** — primer hijo del `<Link>` cuando `isActive`:

```tsx
{isActive && (
  <span
    aria-hidden="true"
    className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400"
  />
)}
```

**Justificación por token, con ratios medidos:**

| Token | Papel | Medición |
| --- | --- | --- |
| `bg-iwana-secondary` | Barra, **uso decorativo** sin texto encima | Sin requisito de 1.4.3. Como elemento gráfico que distingue el estado, cumple 1.4.11 (3:1) contra `iwana-primary-50` |
| `dark:bg-iwana-secondary-400` | Lima mínimo en oscuro | ADR-056 §2: «en dark el mínimo es `iwana-secondary-400`» |
| `text-iwana-primary-700` sobre `bg-iwana-primary-50` | Rótulo activo | **10,64:1** — cumple con holgura |

**Por qué esto cierra 1.4.1 y el tinte solo no lo hacía:** la barra introduce una diferencia de **forma y posición**, no de color; y el DOM ya emite `aria-current="page"` (`Sidebar.tsx:201`). Las dos señales juntas satisfacen el criterio; ninguna de las dos por separado lo hacía.

**Divergencia declarada respecto de `apps/web`:** el contrato del 2026-07-20 usa `bg-iwana-surface-soft` como fondo del activo; el portal usa `bg-iwana-primary-50`. **No se armoniza en esta fase** — sería tocar el estado activo de las 25 páginas del portal por una razón estética, no por un defecto. Queda registrado como deuda de convergencia para el ítem 2.2 de spec Firma §4 («sidebar firma unificada»), que es donde corresponde.

**Ícono del ítem activo:** permanece `text-iwana-primary-600 dark:text-iwana-primary-300` (`Sidebar.tsx:207`). **No se cambia a lima**, contra lo que hace `apps/web`: sobre `iwana-primary-50` el `iwana-secondary-700` mide **4,49:1** (§0.3) y, aunque como ícono le baste 3:1, poner lima ahí duplicaría la señal que ya porta la barra sin añadir información. Un solo portador por predicado.

**Advertencia sobre la receta de shell de la disciplina de identidad.** `iwana-identity-ui-review` → `references/component-recipes.md` §10 dice *«Sidebar azul noche (`bg-iwana-primary`) colapsable»*. **Eso no se implementa.** El fondo de la barra lateral del portal permanece `bg-white dark:bg-dark-surface-2` (`Sidebar.tsx:265`), por tres razones concurrentes: BLOQUEO-3 del contrato del 2026-07-20 lo prohíbe expresamente para el linaje de firma; spec Firma §3 elemento 1 pide la barra lateral **atenuada** para que los datos dominen; y convertir el fondo de la navegación de las 25 páginas del portal es lenguaje visual global, que no aprueba este contrato. La receta §10 de la skill queda registrada como divergencia de la disciplina respecto de la spec que ella misma declara fuente de verdad — se reporta a su dueño, no se ejecuta.

### 5.2 Norma de sombras por componente en el portal

Estado verificado: `shadow-iwana-soft` aparece **solo** en los tres bloques de error/vacío (`DashboardClient.tsx:135`, `RecentActivityPanel.tsx:94`, `:101`) y **no** en `DashboardPanel.tsx:28` ni en `PageHeader.tsx:16`. Es exactamente el inverso de su semántica de reposo (H-12, elemento 2).

#### Conflicto de norma detectado y resuelto — no se sintetiza, se declara

La herencia del contrato del 2026-07-20 §3 asigna **`shadow-iwana-card`** como token por defecto de tarjetas y paneles. Al abrir la disciplina de identidad para redactar este apartado aparece que **eso contradice a la fuente normativa superior**:

| Fuente | Qué dice |
| --- | --- |
| `spec Firma iWana` §3, elemento 2 (**dirección visual aprobada**) | «Sombra dual azulada: **dos** niveles con intención — `soft` (reposo) y `active` (foco/edición/elemento en curso). Es la única técnica de profundidad del sistema» |
| `iwana-identity-ui-review` → `references/firma-elements.md` §2 y `references/component-recipes.md` §3 | «reposo: `shadow-iwana-soft` (cards, paneles)» · «Card base blanca con `shadow-iwana-soft`» |
| Informe de auditoría, H-12 elemento 2 | Califica de defecto que `shadow-iwana-soft` **no** esté en los paneles en reposo: «exactamente al revés de su semántica de reposo» |
| Contrato del 2026-07-20 §3 (mío, congelado, alcance `apps/web`) | `shadow-iwana-card` como token por defecto |

**Resolución para `apps/portal`: manda la spec Firma.** La sombra dual son dos niveles —`soft` y `active`—, y `shadow-iwana-card` no es uno de ellos: su valor es **byte a byte idéntico** a `--shadow-iwana` (`globals.css:132` y `:137`), es decir, es la sombra base, no un nivel de la dual. Usarla como default de panel deja el sistema con tres niveles y sin el que la dirección visual declara para el reposo.

**El contrato del 2026-07-20 no se reabre por esta vía.** Su alcance es `apps/web`, su asignación no produce ningún defecto de accesibilidad y reabrirlo desde un contrato de otra aplicación sería precisamente el salto por analogía que `[DESEMPATE] D-1` reprocha. **Se registra como divergencia declarada** y se resuelve en el ítem 2.2 de spec Firma §4 («sidebar firma unificada» / consolidación de shell), que es donde las dos aplicaciones convergen. Ver §8.2.

#### Asignación canónica del portal

| Componente | Clase actual verificada | Token requerido | Justificación |
| --- | --- | --- | --- |
| `PortalPanel` — `panelBaseClassName`, `portal-ui.tsx:1221-1222` | *(sin sombra)* | **`shadow-iwana-soft`** | Panel en reposo sobre el lienzo — nivel 1 de la sombra dual |
| `PortalMetricCard` — `portalMetricCardShellClassName`, `portal-ui.tsx:305-306` | `shadow-sm` | **`shadow-iwana-soft`** | Card en reposo. Sustituye una sombra neutra de Tailwind por la azulada derivada de `iwana-primary` |
| `PortalDashboardMetric` con `href`/`onClick`, en hover o foco | — | **`shadow-iwana-active`** | Nivel 2 de la dual: elemento en curso. Es la receta de hover de §2.1 |
| `PageHeader` — `apps/portal/.../PageHeader.tsx:16` | *(sin sombra)* | **`shadow-iwana-soft`** | Misma elevación que los paneles que encabeza |
| Los tres bloques de error/vacío | `shadow-iwana-soft` | **ninguna** | Desaparecen al adoptar `PortalAlert`/`PortalEmptyState`, que no llevan sombra. Un mensaje de error no es un contenedor elevado en reposo — es el uso invertido que H-12 denuncia |
| Menús y paneles flotantes del shell | `shadow-lg` / `shadow-2xl` | **`shadow-iwana-lg`** | Único token para lo que se superpone al layout |

> **Regla de elevación del portal:** `shadow-iwana-soft` = reposo (tarjetas y paneles). `shadow-iwana-active` = elemento en curso, en hover o con foco. `shadow-iwana-lg` = **solo** lo que se superpone al layout (menús, diálogos, cajones). **Nunca `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-2xl` de Tailwind base en código nuevo**, y **nunca `shadow-iwana-card` en el portal**: no es un nivel de la sombra dual.

**Radio de impacto declarado, y por qué se aprueba igual:** añadir la sombra a `panelBaseClassName` alcanza **53 archivos consumidores** (contados el 2026-08-04) en un solo cambio de línea. Se aprueba en carril rápido —no altera alcance, contrato de datos, boundary ni tokens de marca— **con dos condiciones**: (a) AI-SR-QA pasa regresión visual sobre una muestra de pantallas de al menos tres módulos distintos; (b) el cambio va en su propio commit, separable. La alternativa —aplicar la norma solo al home— es la remediación parcial que ADR-056 §Lección de gobernanza identifica como **más peligrosa que el defecto**, porque aparenta estar cerrada.

**Fuera de alcance de esta fase, registrado como inventario:** `portalDataTableShellClassName` (`portal-ui.tsx:42`), `portalModuleTabsShellClassName` (`:286`), `portalResultsStripClassName` (`:354`), `createModeStickyFooterClassName` (`:1556`) y `portalFilterChipGroupClassName` (`:351`) siguen con `shadow-sm`. Se migran cuando se toque cada familia por su propia razón, **por bloque, no una a una**.

### 5.3 Foco normado

`interactiveFocusClassName` ya vive en `@iwana/ui` (promovido por el contrato del 2026-07-20 §5) y `portal-ui.tsx:29` lo re-exporta. **En esta fase no se redefine ni se le añade el anillo lima del ítem 1.6 de spec Firma §4** — eso es un cambio de foco global de las dos aplicaciones y no cabe en un contrato de pantalla.

Lo que sí es vinculante:

1. **Todo elemento focalizable que este contrato toca lo usa**, sin anillos a mano.
2. **`Sidebar.tsx:191-201` lo incorpora**: hoy el `<Link>` de navegación no lo lleva.
3. `globals.css` **no resetea `outline`** en ninguna parte (verificado recorriendo el archivo entero), luego el foco nativo sobrevive donde la clase falte. Eso es una red, no una excusa: la clase es obligatoria igualmente, porque el anillo nativo no garantiza contraste sobre superficies tintadas.

---

## 6. Lienzo del portal

**Decisión del CTO del 2026-08-04 (escalación 1, opción A):** el lienzo de página del portal es **`iwana-neutral-50`** (`globals.css:64`). **No se crea `--color-iwana-canvas`.** Cero tokens nuevos.

### 6.1 Sustitución

| Ubicación verificada | Hoy | Contrato |
| --- | --- | --- |
| `apps/portal/src/app/dashboard/layout.tsx:157` (`<main>`) | `bg-slate-50 dark:bg-dark-surface` | **`bg-iwana-neutral-50 dark:bg-dark-surface`** |
| `apps/portal/src/app/dashboard/layout.tsx:120` (pantalla de validación de sesión) | `bg-slate-50 dark:bg-dark-surface` | **`bg-iwana-neutral-50 dark:bg-dark-surface`** |

`slate-*` es una familia ajena a las rampas iWana; era el único elemento del sistema sin token (D-3 del informe). La mitad oscura **no cambia**: `dark-surface` (`globals.css:122`) ya es el token de fondo base y está correctamente asignado.

**Alcance:** solo `apps/portal`. La migración del lienzo en `apps/web` está **explícitamente fuera** (HLD §2.2) y se audita por separado.

### 6.2 Regla de lo que se posa encima, con contraste verificado

Ratios medidos sobre `iwana-neutral-50` (`#F9F9F9`):

| Qué se posa | Ratio contra el lienzo | Umbral | Consecuencia normativa |
| --- | --- | --- | --- |
| Superficie de tarjeta/panel (`bg-white`) | **1,05:1** | — | **Toda superficie que deba distinguirse del lienzo lleva borde.** El salto de color no la delimita: `border-gray-200 dark:border-dark-border`, que `PortalPanel` (`:1222`) y `PageHeader` (`:16`) ya llevan, es **obligatorio**, no decorativo |
| `bg-iwana-surface-soft` (`#F8FAF5`) | **1,00:1** | — | Indistinguible del lienzo por color. Una superficie de apoyo sobre el lienzo **siempre** lleva borde; sobre blanco puede prescindir de él |
| Texto primario `text-iwana-primary` | **16,45:1** | 4,5 | Cumple |
| Texto de celda `text-gray-700` | **9,79:1** | 4,5 | Cumple |
| Texto secundario `text-gray-500` | **4,59:1** | 4,5 | Cumple — **margen 0,09**. Ningún estado lo atenúa, y nada que lo contenga lleva `opacity` (contrato de atenuados §3.1) |
| `text-gray-400` | 2,47:1 | 4,5 | **Prohibido como texto sobre el lienzo**, en cualquier estado no exento |

**Regla de cierre del lienzo:** el lienzo es **fondo, nunca superficie de contenido**. No se escribe texto directamente sobre él fuera de los títulos que ya viven en `PageHeader`; los datos van dentro de un panel con borde. Un bloque que necesite «flotar» sobre el lienzo sin panel es una señal de que le falta el panel.

**Deuda adyacente detectada de paso, no ordenada aquí:** `border-gray-200` sobre `bg-white` mide **1,24:1**, y sobre el lienzo **1,18:1**. Para contenedores pasivos no hay requisito (SC 1.4.11 aplica a componentes de interfaz), pero `.portal-input-surface` (`globals.css:228-230`) usa ese mismo borde para **identificar un campo de formulario**, y ahí el umbral de 3:1 sí aplica. Es la mitad clara del defecto que spec Firma §4 ítem 1.2bis(a) ya inventarió en su mitad oscura (1,06:1). **Se registra; no se remedia en este contrato** — es un primitive compartido con 701 ocurrencias del token oscuro y su corrección es una ola propia.

---

## 7. Los seis escalones `--z-*`

Cumple el punto 2 del plan de ejecución de [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), que delega los valores a este contrato y **no los duplica a propósito**.

> **Autoridad vigente (actualizado 2026-08-04):** ADR-075 fue **aprobado por el CTO**, con el septimo escalon de este apartado incorporado por enmienda previa. Este apartado **es ejecutable**. Los valores quedan fijados y verificados aquí para que la aprobación del ADR no requiera una segunda ronda de diseño; la declaración en `globals.css` (paso 3 del plan) espera a la aprobación del CTO.

### 7.1 Revisión individual previa — qué son los valores de cuatro y cinco cifras

ADR-075 §3 exige revisarlos uno por uno «porque alguno puede existir para superponerse a una biblioteca, y en ese caso la razón se documenta». Revisados. **El resultado no es el esperado**, y es la parte más importante de este apartado.

| Valor | Ubicación verificada | Qué es realmente | Veredicto |
| --- | --- | --- | --- |
| `z-10000` / `z-10001` | `packages/ui/src/components/Dialog.tsx:291` y `:320` | Velo y contenido del diálogo **propio** (no Radix: usa `createPortal` de `react-dom`, `:289`). El `10001` es **redundante**: el contenido es hijo del velo, que ya crea contexto de apilamiento con su propio `z` | Ambos → **`--z-modal`**. El segundo valor se elimina; basta `relative` |
| `z-10000` / `z-10001` | `apps/portal/.../AccessControlSettingsClient.tsx:1526` y `:1533` | **Copia literal** de los valores del `Dialog` en código de aplicación, para que un cajón se comporte como modal | → **`--z-modal`**. Caso de manual de la «negociación en el código» que el ADR describe |
| `z-[1200]` / `z-[1201]` | `AssuranceTicketDrawer.tsx:169`,`:176` · `InventoryCategoryDrawer.tsx:292`,`:307` · `InventoryCatalogDrawer.tsx:198`,`:212` · `SupplierFormDrawer.tsx:458`,`:473` | Cajones de aplicación. **`1200` coincide exactamente con `DropdownMenu.tsx:135` (`zIndex: 1200`) y con `MultiSelect.tsx:163` (`z-[1200]`)**: los cajones se nivelaron con el escalón de los menús | → **`--z-drawer`**; los menús → `--z-popover`. **Ver §7.2: aquí hay un defecto latente vivo** |
| `z-[120]` | `DispatchDrawerPortal.tsx:31` | Cajón de despacho, portalado | → **`--z-drawer`** |
| `z-35` | `apps/portal/src/app/dashboard/layout.tsx:131` | Velo del menú lateral móvil, encajado entre el encabezado (`z-30`) y la barra lateral (`z-40`). Existe solo porque hacía falta un número entre dos ya tomados | → **`--z-overlay`** |
| **`zIndex: 11000`** | `packages/ui/src/components/Select.tsx:292` y `:653` — **estilo en línea, no clase: la auditoría no lo contó** | **El único valor del repo con razón documentada en el propio código:** *«Debe superar overlays/modales que usan z-index alto en apps web/portal»*. El menú del `Select` tiene que pintar por encima de un diálogo que lo contiene | → **`--z-popover`**. **La razón se conserva, es la evidencia de §7.2** |
| `z-10002` | `packages/ui/src/components/Popover.tsx:21` | Contenido de popover de Radix, un escalón por encima del contenido del diálogo (`10001`). Misma razón que el anterior, sin comentario que la explique | → **`--z-popover`** |

**Hallazgo de la revisión, que el conteo de la auditoría no podía ver:** los valores de z **no son once, son doce**, porque `Select.tsx` los emite como **objeto de estilo en línea** (`zIndex: 11000`) y `DropdownMenu.tsx:135` hace lo mismo con `1200`. Consecuencia para el paso 5 del plan de ADR-075: **una regla estructural que solo busque utilidades de Tailwind no detecta estos dos**. La barrera debe cubrir también `zIndex:` en objetos de estilo dentro de `apps/*/src` y `packages/ui/src`.

**Verificación sobre terceros, que es lo que el ADR pide fijar «con los valores reales de Radix a la vista»:** las dependencias Radix del repo son `@radix-ui/react-label`, `@radix-ui/react-popover` y `@radix-ui/react-slot` (`packages/ui/package.json:33-35`). **Radix no emite `z-index` propio**: `Popover.Content` se estiliza íntegramente desde nuestro `className` (`Popover.tsx:20-24`, `MultiSelect.tsx:162-169`). **No existe ningún suelo de terceros que haya que superar.** Los valores de cuatro y cinco cifras del repo son autoinfligidos, no defensa contra una biblioteca. Esto autoriza a bajar la escala entera a números legibles sin riesgo.

### 7.2 El escalón que el ADR no previó — `--z-popover`

Tres primitives del sistema existen **precisamente** para pintar por encima de un diálogo: `Select` (11000, con la razón escrita en el código), `Popover` (10002) y `DropdownMenu` (1200). Un `Select` dentro de un diálogo que no supere al diálogo es un formulario inutilizable.

Las seis capas de ADR-075 §1 **no tienen dónde alojarlos**: `--z-overlay` es el velo, `--z-drawer` el cajón, y por debajo de `--z-modal` el menú queda tapado. Asignarlos a `--z-modal` reproduce el defecto actual: los cajones a `1200` y los menús a `1200` solo funcionan hoy porque el portal de React se inserta **después** en el DOM. **Es un contrato negociado por orden de inserción — exactamente lo que este ADR viene a eliminar, y está vivo en cuatro cajones.**

ADR-075 §2 prevé el caso: *«Un componente que no encaje en ninguna de las seis capas no inventa un número: propone una capa nueva a AI-DS-OWNER, que la incorpora al contrato o le asigna la existente»*. Ejerzo esa delegación e **incorporo un séptimo escalón**, marcado como propuesta porque extiende la tabla del ADR y esa tabla es la decisión del CTO:

> **`--z-popover` — token nuevo propuesto.** Superficies flotantes ancladas a un disparador que deben permanecer visibles aunque su disparador viva dentro de un modal o un cajón: menús desplegables, popovers, menú del `Select`, calendario del `DatePicker`.

**Sin este escalón el contrato no es satisfacible.** Si el CTO lo rechaza, la única alternativa conforme es prohibir `Select`, `MultiSelect` y `DropdownMenu` dentro de diálogos y cajones, lo cual rompe formularios ya en producción. Se registra como `[CONSULTA]` en §10.

### 7.3 Los valores

```css
@theme {
  /* Capas de superposición — ADR-075. Fuente de verdad de los valores.
     Separación de 100 entre escalones: 99 huecos libres para una capa
     intermedia no prevista, sin renumerar las existentes. */
  --z-base:    0;
  --z-sticky:  100;
  --z-overlay: 200;
  --z-drawer:  300;
  --z-modal:   400;
  --z-popover: 500;  /* PROPUESTO — séptimo escalón, ver §7.2 */
  --z-toast:   600;
}
```

| Token | Valor | Qué vive aquí | Origen que sustituye |
| --- | --- | --- | --- |
| `--z-base` | **0** | Contenido en flujo con apilamiento propio dentro de una tarjeta | `z-10` de `Input.tsx:94`, `GlobalSearch.tsx:88`, celdas adheridas de tablas |
| `--z-sticky` | **100** | Cabeceras y barras adheridas al desplazamiento | `TopHeader.tsx:37` (`z-30`), `createModeStickyFooterClassName` (`z-20`), encabezados adheridos de `ScheduleCalendar` y `WeeklyTechnicianMatrix` |
| `--z-overlay` | **200** | Velo que oscurece el contenido bajo un panel | `layout.tsx:131` (`z-35`), velos de `CreateContractDialog.tsx:247` y `ContractDetailDrawer.tsx:375` (`z-40`) |
| `--z-drawer` | **300** | Paneles laterales y cajones deslizantes | `Sidebar.tsx:265` (`z-40`), `portal-ui.tsx:1157` (`z-40`), `OperationalSidePeek.tsx:115` (`z-50`), `DispatchDrawerPortal.tsx:31` (`z-[120]`), los cuatro cajones en `z-[1200]/[1201]` |
| `--z-modal` | **400** | Diálogos que capturan el foco | `Dialog.tsx:291`/`:320` (`z-10000`/`10001`), `AccessControlSettingsClient.tsx:1526`/`:1533`, `ConvertExpedienteToContractDialog.tsx:99` (`z-50`) |
| `--z-popover` | **500** *(propuesto)* | Flotantes anclados que deben superar a modal y cajón | `Select.tsx:292`/`:653` (`zIndex: 11000`), `Popover.tsx:21` (`z-10002`), `DropdownMenu.tsx:135` (`zIndex: 1200`), `MultiSelect.tsx:163` (`z-[1200]`), `GlobalSearchOverlay.tsx:47` (`z-50`) |
| `--z-toast` | **600** | Notificaciones efímeras, por encima de todo | Sin consumidor hoy. Se declara para que el primero no negocie su número |

### 7.4 Reglas de uso

1. **Un componente declara un solo valor de z.** El velo lleva el token; su contenido es hijo suyo y hereda el contexto de apilamiento — le basta `relative`. **Los pares `10000/10001` y `1200/1201` son redundantes por construcción y desaparecen sin sustituto.** Esto reduce los doce sitios a siete.
2. **Forma de consumo autorizada:** utilidad con variable de tema (`z-(--z-modal)`) o utilidad nombrada declarada en `globals.css`. En objetos de estilo de JavaScript: `zIndex: 'var(--z-modal)'`. **Prohibido** el número literal en las dos formas, y **prohibido** `tailwind.config.js` (ADR-023, Aprobado).
3. **El escalón mayor gana siempre; el orden en el DOM nunca es el mecanismo.** Si dos cosas deben apilarse y comparten escalón, o una está mal clasificada, o falta una capa — y entonces se propone, no se inventa un número.
4. **`--z-toast` es el techo.** Un componente que «necesite» estar por encima de un aviso efímero tiene un problema de diseño, no de z.
5. **La regla estructural del paso 5 de ADR-075 cubre las dos formas de emisión** — utilidad de Tailwind **y** `zIndex:` en objeto de estilo. Sin la segunda, `Select.tsx` y `DropdownMenu.tsx` pasan la barrera intactos.

---

## 8. Carril rápido, escalación y bloqueos

### 8.1 Apruebo en carril rápido (protocolo §3bis regla 3)

No alteran alcance, contrato de datos, boundary ni tokens de marca:

| # | Decisión | Nota |
| --- | --- | --- |
| 1 | Contrato completo de `PortalDashboardMetric` (§1) | Cero tokens nuevos; reusa el eje del sistema |
| 2 | Matriz de estados de los cuatro componentes (§2), con sus siete «no aplica» justificados | |
| 3 | Sustitución de las seis primitives reimplementadas (§3.1) | Condición de `[DESEMPATE] D-1`, ya satisfecha por esta congelación |
| 4 | `href` en `PortalNavListRow` (§3.2) | Aditivo, no rompedor |
| 5 | El lima como predicado y el mapeo entre vocabularios (§4) | Fija el mapeo; **no** unifica los vocabularios |
| 6 | Barra lima del ítem activo (§5.1) | Cierra SC 1.4.1; receta idéntica a la ya congelada para `apps/web` |
| 7 | Norma de sombras del portal, con la sombra dual `soft`/`active` de spec Firma §3 como norma vinculante (§5.2) | **Con radio de impacto declarado: 53 consumidores de `PortalPanel`**, condicionado a regresión visual de SR-QA |
| 8 | Lienzo `iwana-neutral-50` y su regla de borde (§6) | Ejecuta una decisión del CTO ya tomada |
| 9 | Corrección del comentario de ratio en `globals.css:22-23` y `:55` (§0.3) | Cambia un comentario, ningún valor. Se notifica por tocar la fuente de tokens |
| 10 | Eliminación del mapa de severidad local de `OnboardingAlerts.tsx:11-36` | Sustitución por primitive con superficie ya normada |
| 11 | **v1.1** — matriz eyebrow × `accent` (§1.7): escalón `gray-700`/`gray-200` en shells `danger`/`warning` | Cierra residual QA ~4,45:1; tipografía muted intacta; **sin** lima ni tokens de marca nuevos. Notificado a FE + QA |
| 12 | **v1.2** — matriz `description` × `accent` (§1.7): mismo escalón en shells `danger`/`warning` (y muted de cuerpo) | Cierra gap G6-4 axe light ≈4,45:1; **sin** lima ni tokens de marca nuevos. Carril rápido; notificado a FE + QA |

### 8.2 Escala a AI-EM-ARCH

| # | Asunto | Por qué no es mío |
| --- | --- | --- |
| 1 | **`--z-popover` como séptimo escalón (§7.2)** | Extiende la tabla §1 de ADR-075, que es la decisión que el CTO tomó. Yo aporto la evidencia y el valor; la extensión del enunciado se ratifica arriba |
| 2 | Ejecutabilidad de §7 completa | **Desbloqueado** — ADR-075 aprobado el 2026-08-04. Los valores fijados aqui son los definitivos y la declaracion en `globals.css` entra en el punto 9 del alcance de la fase |
| 3 | Corrección del comentario de `globals.css` (§0.3) | Aprobado en carril rápido, pero **notificado**: es la fuente de verdad de tokens y contradice un contrato mío anterior |
| 4 | Unificación de los cuatro vocabularios de acento en un enum único | Marcada como **gate** en §7.2 del informe. Este contrato fija el mapeo; la unificación es API pública de `@iwana/ui` y va por su vía |
| 5 | Convergencia del estado activo de la barra lateral entre portal y web (§5.1) | Alcance de las dos aplicaciones; corresponde al ítem 2.2 de spec Firma §4 |
| 6 | **Divergencia de sombras entre los dos contratos de firma (§5.2)** | El del 2026-07-20 §3 asigna `shadow-iwana-card` a los paneles de `apps/web`; spec Firma §3 y la disciplina de identidad piden `shadow-iwana-soft` en reposo. El portal sigue la spec Firma. Reabrir el contrato de `apps/web` desde aquí sería el salto por analogía que D-1 reprocha: se resuelve en el ítem 2.2 de spec Firma §4 |
| 7 | **Dos divergencias de la disciplina `iwana-identity-ui-review` respecto de la spec que declara su fuente de verdad** | `component-recipes.md` §10 pide barra lateral azul noche, contra spec Firma §3 elemento 1 y contra BLOQUEO-3; y cuatro archivos de la skill (`SKILL.md:247`, `tokens.md:36`, `firma-elements.md:37`, `evaluation-criteria.md:38`) propagan el ratio 6,2:1 de §0.3. Ambas van a su dueño, no se ejecutan aquí |

### 8.3 Escala al CTO

| # | Asunto | Estado |
| --- | --- | --- |
| 1 | Aprobación de ADR-075 | **Pendiente** — paso 1 de su plan de ejecución |
| 2 | Séptimo escalón `--z-popover`, si EM-ARCH lo eleva | Deriva de 1 |

**Nada más de este contrato requiere CTO.** El lienzo y las capas ya se decidieron el 2026-08-04; el resto opera dentro de decisiones aprobadas.

---

## 9. Checklist de aceptación DS

AI-FE-PLATFORM completa todos los ítems antes de entregar. AI-SR-QA valida de forma independiente los marcados con 🔍.

### A. `PortalDashboardMetric`

- [ ] Vive en `apps/portal/src/components/shared/portal-ui.tsx`; `apps/portal/src/components/dashboard/MetricCard.tsx` **eliminado**.
- [ ] `href` y `onClick` son mutuamente excluyentes **en el tipo**, no por precedencia en tiempo de ejecución.
- [ ] No existe ninguna prop `tone`, `iconTone`, `iconClassName` ni `valueClassName`.
- [ ] `value === null` rinde `text-gray-700 dark:text-gray-200`, sin `font-mono` y sin `uppercase`.
- [ ] 🔍 Con `value: null`, contraste ≥ 4,5:1 en **los cuatro acentos** y **los dos temas**. Peor caso esperado: 9,72:1.
- [ ] Eyebrow: tipografía `.portal-eyebrow-muted`; con `accent` ∈ {`warning`,`danger`} color `text-gray-700 dark:text-gray-200` (§1.7). **Sin** lima sobre rose/amber.
- [ ] 🔍 Eyebrow contraste ≥ 4,5:1 en **los cuatro acentos** × **dos temas** (cierra residual ~4,45:1 sobre `danger`).
- [ ] `description` (y muted de cuerpo en shell): con `accent` ∈ {`warning`,`danger`} color `text-gray-700 dark:text-gray-200`; con `neutral`/`primary` `text-gray-500 dark:text-gray-400` (§1.7 v1.2). **Sin** lima ni `opacity-*`.
- [ ] 🔍 `description` contraste ≥ 4,5:1 en **los cuatro acentos** × **dos temas** (cierra G6-4 axe light ≈4,45:1 sobre `danger`).
- [ ] La cifra conserva `font-mono` y `tabular-nums`.
- [ ] `state='error'` **no desmonta** la tarjeta: eyebrow y rótulo siguen en pantalla.
- [ ] `state='loading'` sustituye solo la ranura de cifra por `SkeletonBlock`, con `aria-busy="true"` en la tarjeta.
- [ ] 🔍 `grep -n "opacity-" ` sobre el componente → **0 resultados**.
- [ ] La tarjeta no emite `aria-live` propio.

### B. Sustitución de primitives

- [ ] 🔍 `grep -rn "from './DashboardPanel'\|from './MetricCard'" apps/portal/src` → 0 resultados.
- [ ] 🔍 `grep -rn "bg-\[linear-gradient" apps/portal/src` → **0 resultados** (hoy 3, todos en el alcance).
- [ ] 🔍 `grep -rn "animate-pulse" apps/portal/src/components/dashboard` → 0 resultados.
- [ ] 🔍 `grep -rn "text-\[#\|bg-\[#" apps/portal/src/components/dashboard apps/portal/src/components/layout` → 0 resultados.
- [ ] `DashboardPanel.tsx` y `MetricCard.tsx` eliminados del repositorio, no solo dejados sin usar.
- [ ] Ningún eyebrow con `tracking-[...]` a mano: todos por `.portal-eyebrow` / `.portal-eyebrow-muted`.
- [ ] `PortalNavListRow` acepta `href` y rinde `next/link`; con `disabled` **no** rinde enlace.

### C. Lima como predicado

- [ ] 🔍 Ninguna unión de acento del portal contiene una casilla lima: `PortalMetricCardAccent` sigue siendo `'neutral' | 'primary' | 'warning' | 'danger'`.
- [ ] `Badge variant="lime"` aparece **solo** donde el predicado es completitud o avance.
- [ ] 🔍 `grep -n "text-iwana-secondary-700" ` sobre los archivos tocados: ninguna ocurrencia **de texto** sobre `bg-iwana-primary-50`.

### D. Firma del shell

- [ ] `<Link>` activo de `Sidebar.tsx` con `relative` y `<span aria-hidden="true">` de barra lima como primer hijo.
- [ ] `Sidebar.tsx:165`: `opacity-60` **eliminado**, `text-gray-400` conservado.
- [ ] `interactiveFocusClassName` en el `<Link>` de navegación.
- [ ] `PortalPanel`, `PortalMetricCard` y `PageHeader` con `shadow-iwana-soft`; hover/foco de la tarjeta accionable con `shadow-iwana-active`.
- [ ] 🔍 `grep -rn "shadow-sm\|shadow-lg\|shadow-md\|shadow-2xl\|shadow-iwana-card" ` en los archivos tocados → 0 resultados.
- [ ] 🔍 Regresión visual sobre pantallas de al menos tres módulos distintos que consuman `PortalPanel`.

### E. Lienzo

- [ ] 🔍 `grep -rn "slate-" apps/portal/src/app/dashboard/layout.tsx` → 0 resultados.
- [ ] Toda superficie sobre el lienzo lleva `border-gray-200 dark:border-dark-border`.

### F. Capas z — **solo tras aprobación de ADR-075**

- [ ] Los siete tokens declarados en `globals.css`, con los valores de §7.3.
- [ ] Ningún componente declara dos valores de z: los pares `10000/10001` y `1200/1201` eliminados.
- [ ] 🔍 Regla estructural que falle ante utilidades de z literales **y** ante `zIndex:` numérico en objetos de estilo, en `apps/*/src` y `packages/ui/src`.
- [ ] La razón documentada de `Select.tsx:291` («debe superar overlays/modales») **conservada** como comentario junto a `--z-popover`.

### G. Calidad general

- [ ] 🔍 `pnpm --filter @iwana/portal lint` en verde.
- [ ] 🔍 `pnpm --filter @iwana/portal typecheck` en verde.
- [ ] 🔍 `pnpm --filter @iwana/ui build` en verde.
- [ ] **Ningún token nuevo en `globals.css`** salvo los siete de §7.3, y esos solo tras la aprobación de ADR-075.
- [ ] Ningún `tailwind.config.*` creado (ADR-023).
- [ ] 🔍 Evidencia de pruebas con `Cached: 0` o corrida forzada (HLD §10, regla de evidencia).

---

## 10. Consultas y bloqueos

```
[CONSULTA] C-DS-01 → AI-EM-ARCH (posible elevación al CTO)
Asunto: séptimo escalón --z-popover.
Hecho verificado: tres primitives de @iwana/ui existen para pintar por encima de un
  diálogo — Select.tsx:292 (zIndex 11000, con la razón escrita en el código),
  Popover.tsx:21 (z-10002) y DropdownMenu.tsx:135 (zIndex 1200). Las seis capas de
  ADR-075 §1 no tienen dónde alojarlos.
Riesgo de no resolverlo: asignarlos a --z-modal deja el apilamiento dependiendo del
  orden de inserción en el DOM. Ese contrato implícito está vivo hoy en cuatro cajones
  a z-[1200] frente a menús a z-[1200], y es exactamente lo que el ADR elimina.
Propuesta: incorporar --z-popover = 500 al contrato, por la delegación de ADR-075 §2.
Alternativa si se rechaza: prohibir Select/MultiSelect/DropdownMenu dentro de diálogos
  y cajones — rompe formularios en producción. No se recomienda.
```

```
[CONSULTA] C-DS-02 → AI-EM-ARCH
Asunto: el comentario de globals.css:22-23 y :55 afirma 6,2:1 para iwana-secondary-700
  sobre blanco. Medido con método calibrado contra tres valores publicados: 4,76:1.
Consecuencia: el token sigue cumpliendo AA sobre blanco y sobre iwana-surface-soft
  (4,53:1), y NO cumple sobre iwana-primary-50 (4,49:1).
Propagación verificada, siete sitios: globals.css:22-23 y :55 · SKILL.md:247 ·
  references/tokens.md:36 · references/firma-elements.md:37 ·
  references/evaluation-criteria.md:38 · contrato del 2026-07-20 §2.
Acción: corregir el número en la fuente de tokens (carril rápido, cambia un comentario y
  ningún valor, notificado por tocar globals.css) y derivar los cuatro de la skill a su
  dueño. Ninguna decisión cambia: «usa secondary-700 para texto lima» sigue siendo
  correcto en las siete.
No se reabre el contrato del 2026-07-20: su decisión (barra lima decorativa, sin texto
  encima) no depende del ratio, y su tabla queda corregida por referencia desde aquí.
```

```
[CONSULTA] C-DS-03 → AI-SR-QA (informativa, no bloqueante)
Asunto: la regla estructural del paso 5 de ADR-075 no puede limitarse a utilidades de
  Tailwind. Dos de los doce sitios de z del repo son objetos de estilo en JavaScript
  (Select.tsx:292 y :653, DropdownMenu.tsx:135) y una regla basada en clases los deja pasar.
```

**Sin `[BLOQUEO]`.** Nada de este contrato impide a AI-FE-PLATFORM empezar: §1 a §6 son ejecutables desde su congelación. §7 espera la aprobación de ADR-075, y esa espera estaba prevista en el plan del propio ADR.

---

## 11. Referencias verificadas

Todas abiertas y comprobadas el 2026-08-04 antes de citarse (protocolo §7.4, ADR-056 §5).

**Artefactos normativos**

- [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) — En revisión. §2 boundary, §5.2 matriz, §6 CA-V2-01…12, §7 RNF-V2-01…07, §8 HLD-DE-04
- [`HLD-MOD02-DASHBOARD-EMPRESA-v1.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) **(superado)**
- [`ADR-075`](../adrs/ADR-075-Contrato-Capas-Z-Portal.md) — §1 delegación de valores, §2 regla y vía de capa nueva, §3 alcance de remediación, §4 verificación
- [`ADR-056`](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) (Aprobado) — §2 norma dark y emparejamiento, §5 cita verificada
- [`ADR-023`](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) (Aprobado) — CSS-first, sin `tailwind.config`
- [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) (Vigente) — §4 hallazgos, §5 desempates, §6 escalaciones, §7.2 lluvia DS, §8 gate G6
- [`spec Firma iWana`](2026-07-12-firma-iwana-diseno-visual-design.md) — §3 elementos y reglas del lima, §4 ítems 1.2bis/1.3/2.1/2.2, §5 anti-patrones
- [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0 — precedente heredado; §7 **sigue vigente para `apps/web`**
- [`2026-07-26-estados-atenuados-contraste-ds-contrato.md`](2026-07-26-estados-atenuados-contraste-ds-contrato.md) (Vigente) — §2 frontera de exención, §3.1 prohibición de opacidad, §3.3 escalón de token, §4.2 loading, §4.4 matriz

**Código — líneas verificadas**

- `packages/ui/src/styles/globals.css` — archivo recorrido entero; tokens de §0.2, `.portal-eyebrow` en `:218`, sin ningún `--z-*` declarado
- `apps/portal/src/components/shared/portal-ui.tsx` — `:29`, `:42`, `:61`, `:69`, `:79`, `:303`, `:305`, `:308-326`, `:356-419`, `:421-480`, `:1221-1224`, `:1334-1385`, `:1434-1485`, `:1524-1552`, `:1556`
- `apps/portal/src/components/dashboard/` — `MetricCard.tsx` (73 líneas), `DashboardPanel.tsx` (55), `DashboardClient.tsx` (223), `QuickActionsPanel.tsx` (120), `RecentActivityPanel.tsx:80-140`, `OnboardingAlerts.tsx:1-70`
- `apps/portal/src/components/layout/` — `Sidebar.tsx:155-229`, `:259-270`; `TopHeader.tsx:37`, `:55-95`; `PageHeader.tsx` (27 líneas)
- `apps/portal/src/app/dashboard/layout.tsx:110-163`
- `packages/ui/src/components/` — `Dialog.tsx:285-330`, `Popover.tsx` (32 líneas), `MultiSelect.tsx:140-180`, `DropdownMenu.tsx:118-147`, `Select.tsx:287-302` y `:646-660`, `Badge.tsx` (39 líneas), `Button.tsx:12-56`, `ProgressMeter.tsx` (100 líneas), `OperationalSidePeek.tsx:115`, `:131`
- `packages/ui/package.json:33-35` — dependencias Radix del repo

**Skills**

- `.agents/skills/iwana-identity-ui-review/` — `SKILL.md:141`, `:247`; `references/tokens.md:25`, `:36`, `:70`; `references/firma-elements.md` (íntegro: nueve elementos, reglas del lima, jerarquía de botones); `references/component-recipes.md` (íntegro: §1 KPI, §3 panel, §5 vacíos, §6 carga, §7 alertas, §10 shell, §11 eyebrows, regla de promoción); `references/evaluation-criteria.md:38`; `scripts/audit-ui.mjs:65`
