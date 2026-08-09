# Contrato DS — `SearchHighlight` (resaltado de coincidencias sin sink de HTML)

**Versión:** 1.0
**Estado:** **Vigente** — congela API + tokens + estados para la promoción a `@iwana/ui` (cierre de C-10)
**Fecha:** 2026-08-09
**Autor:** AI-DS-OWNER
**Aprobación:** carril rápido DS (primitive + tokens + estados; sin alcance UX nuevo, sin contrato de datos HTTP, sin boundary de módulo, **cero tokens nuevos**) — con **[CONSULTA]** a AI-EM-ARCH en §12 (marca visual del `mark`, alcance del pill y hogar de tests)
**Relaciona:** [INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0](../informes/INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) (§2 decisión de no extraer; C-10 abierto) · [SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) (H-01 cerrado) · [spec Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md) (§3.4 par tonal lima · §9 changelog DS) · [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (emparejamiento dark) y §3 (Estrella Polar) · [Protocolo](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3bis (contract-first) y §6.1
**Precedente de forma:** [contrato SearchablePicker](2026-07-25-searchable-picker-ds-contrato.md) (formato, regla de graduación a `@iwana/ui`, veredicto de carril rápido)

**Skills aplicadas (protocolo §6.1 regla 4):** `.agents/skills/core-components` (reglas de primitive, tokens, criterios de calidad de nueva primitive) · `.agents/skills/wcag-audit-patterns` (a11y WCAG 2.2 AA) · `.agents/skills/tailwind-patterns` (estrategia de tokens, sin valores paralelos) · dirección visual Firma iWana como fuente de *qué construir* (Estrella Polar, ADR-056 §3).

---

## 1. Forma y veredicto de boundary: promover a `@iwana/ui`

`SearchHighlight` se **promueve** a `@iwana/ui` como primitive nueva (archivo `packages/ui/src/components/SearchHighlight.tsx`, exportado desde `packages/ui/src/index.ts`). No es variante de ningún componente existente.

Justificación (regla de graduación del contrato SearchablePicker §2, hoy satisfecha):

| Criterio | Estado |
| --- | --- |
| (a) **≥2 apps consumidoras** | `apps/web` (fragmento del servidor) y `apps/portal` (fragmento construido en cliente) — ambos hoy con la misma necesidad y la misma clase de chip byte-idéntica |
| (b) **API sobrevive un ciclo de módulo** | `{ snippet: string }` + `parseSearchHighlight` probado en web desde la corrección H-01: 11 casos del spec + 16 de la PoC C-7b, sin cambio de API |
| (c) **Desacoplado de class-tokens exclusivos del portal** | Solo usa tokens globales de `globals.css` y la paleta utilitaria; cero dependencia de `portal-ui.tsx` |

**No contradice el boundary del Modulith.** `@iwana/ui` es la capa de UI compartida por diseño (ADR-049); la promoción no mueve datos entre módulos, no toca backend ni tenancy. El feature de búsqueda de cada app sigue viviendo en su app; lo compartido es el primitive de presentación y su parser. **Promover el *parser seguro* no institucionaliza el sink**: el informe v1.0 §2 descartaba extraer el *productor de string HTML* del portal (`highlightMatch`), que obliga a `dangerouslySetInnerHTML`. Aquí se comparte el lado que *consume y parsea* el fragmento como dato, que es exactamente el que elimina la clase de defecto. El productor del portal permanece local (ver §10).

**Lo que NO se promueve en este acto:** el helper productor del portal (`highlightMatch` + `escapeHtml`), el chip que envuelve los fragmentos (ver §6) y el modelo `GlobalSearchItem`.

---

## 2. Anatomía

```
SearchHighlight (inline, sin contenedor propio)
├── fragmento de texto literal     → nodos de texto React (segmentos isMatch=false)
└── <mark>coincidencia</mark>      → elemento <mark> con tokens de marca (segmentos isMatch=true)
```

- Emite solo texto: **no** `dangerouslySetInnerHTML`, **no** `eval`, **no** `innerHTML`, **no** wrapper propio.
- El chip que lo envuelve (pill `rounded-full`) es composición del consumidor — receta canónica en §6, fuera del contrato de este primitive.
- Componente sin estado y sin efectos: renderizable tanto desde Server Components como desde client components, **sin directiva `'use client'` requerida** (no usa hooks ni eventos). Decisión de implementación de FE-PLATFORM al moverlo, sin cambio de comportamiento.

---

## 3. API pública y protocolo de fragmento

```ts
/** Segmento del fragmento parseado. Parte del contrato: es el tipo de retorno de parseSearchHighlight. */
export interface SearchHighlightSegment {
  text: string;
  isMatch: boolean;
}

/** Única prop. REQUERIDA. Fragmento con la coincidencia delimitada. */
export interface SearchHighlightProps {
  snippet: string;
}

/** Emite los segmentos como nodos de texto + <mark>. API congelada. */
export function SearchHighlight(props: SearchHighlightProps): React.JSX.Element;

/** Parser puro, sin estado. Único intérprete del protocolo <mark> en el sistema. */
export function parseSearchHighlight(snippet: string): SearchHighlightSegment[];
```

### 3.1 El fragmento es un **protocolo de datos**, no HTML

El formato `…<mark>coincidencia</mark>…` es un protocolo de datos con un único intérprete (este componente). Reglas:

1. El consumidor **nunca** interpreta el fragmento como HTML; el único parser del sistema es `parseSearchHighlight`.
2. El texto libre (lo que no está dentro de `<mark>`) se muestra **literal**, sin interpretar etiquetas ni entidades.
3. El **productor** es responsable de escapar el texto antes de envolver la coincidencia (el portal ya lo hace con su `escapeHtml` local; el servidor lo garantiza para web). El `<mark>` delimitador solo aparece donde el productor lo emite deliberadamente.
4. Delimitadores sin cierre o con contenido vacío **no** matchean y se muestran literal (regex `/<mark>([\s\S]*?)<\/mark>/gi`).

### 3.2 Por qué `snippet: string` y no otra forma

| Candidata | Veredicto |
| --- | --- |
| **`snippet: string` (elegida)** | Un solo formato sirve a ambos consumidores: web pasa el fragmento ya delimitado del servidor; el portal construye el mismo formato en cliente (escape + `<mark>`) sin producir HTML interpretable. El parser vive en un único punto de control compartido: la clase de defecto desaparece por construcción, no por disciplina de cada app |
| `text: string` + `query: string` (el componente re-busca) | **Rechazada**: duplicaría el algoritmo de matching del servidor en cliente (case/diacríticos/stemming divergen), trabajo doble, y web no tiene `query` fiable frente al fragmento ya recortado |
| `segments: Array<{ text; isMatch }>` (precomputados) | **Rechazada**: reparte el parser entre consumidores (duplicación del protocolo y de su prueba de seguridad) y contradice el objetivo de un solo punto de control; además, web no puede computar segmentos sin volver a implementar el parser |

### 3.3 Invariante de seguridad (heredado de H-01 / C-7)

Ninguna variante de payload (script inline, atributos de evento, iframe `javascript:`, `svg onload`, mayúsculas, entidades) puede materializar elementos en el DOM: todo lo que no sea el delimitador se emite como **texto literal**. Verificado por la PoC C-7b en web (16 casos) y protegido por control negativo en pruebas (§8).

**Borde cosmético declarado (sin consecuencia de seguridad):** si un tenant escribe la cadena literal `<mark>…</mark>` en un campo indexado, el parser la trata como delimitador y muestra ese tramo resaltado sin las etiquetas. Confirmado en la PoC (§5 del informe v1.0). Se mantiene como comportamiento documentado; una futura versión con productores que entreguen segmentos estructurados lo eliminaría de raíz (extensión versionada, no parte de este contrato).

---

## 4. Tokens

**Cero tokens nuevos.** Todos existen en `packages/ui/src/styles/globals.css`. Los valores de marca se citan **por token** (ADR-056 §3 / v1.2 del perfil DS-OWNER); el hex vive solo en la fuente de tokens.

### 4.1 El `<mark>` de coincidencia

Par tonal lima de la Firma iWana (§3.4) — **idéntico al `Badge variant="lime"`** de `@iwana/ui` (`Badge.tsx:22`). Sin valores paralelos.

| Modo | Clases | Fundamento |
| --- | --- | --- |
| Claro | `bg-iwana-secondary-100 text-iwana-secondary-900` | Par tonal lima canónico de completitud/acento (Firma §3.4); sin radio (inline) |
| Oscuro | `dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400` | Regla de lima en dark ADR-056 §2 (mínimo `-400` en texto; `-700/20` como tinte de fondo, igual que `Badge lime`) |

Contraste calculado sobre los tokens reales (los valores de los tokens están en `globals.css`):

| Par | Ratio | Resultado |
| --- | --- | --- |
| `iwana-secondary-900` sobre `iwana-secondary-100` (claro) | ≈ **7.5:1** | AA (4.5:1) y AAA (7:1) para texto normal |
| `iwana-secondary-400` sobre `dark-surface-3` + `iwana-secondary-700/20` (oscuro, sobre el chip) | ≈ **7.2:1** | AA y AAA |

**Nota no bloqueante (WCAG 1.4.1):** el par es distinguible por *tono* a luminancia similar respecto del chip (ambos fondos muy claros). No es fallo: la información "esto es la coincidencia" es redundante con el texto mismo (visible completo) y está comunicada estructuralmente por `<mark>`. Si el diseño quisiera reforzar el diferenciador visual, la vía futura es `ring-1 ring-iwana-secondary-300` o subrayado — extensión versionada, no parte de este contrato.

### 4.2 El texto literal

**Sin token propio**: los segmentos no coincidentes heredan la tipografía y el color del contenedor del consumidor (nodos de texto planos). En la receta de chip canónica (§6), el color efectivo es `text-gray-600 dark:text-gray-300` (pasa AA: claro ≈6.9:1; oscuro ≈9.7:1 sobre `dark-surface-3`).

### 4.3 Estados de `mark`

**Sin estados.** El `mark` es invariante bajo `isActive` del item de búsqueda: el chip (composición) mantiene clases constantes en ambos apps hoy, y el primitive no depende del estado activo del option. Si un diseño futuro quisiera acentuar la coincidencia cuando el item está activo, es extensión versionada.

**Prohibido:** `dark:bg-gray-{700..950}`, hex literales, segunda sombra, `mark` con radio, `mark` en `iwana-secondary` crudo como texto (no pasa AA sobre el tinte).

---

## 5. Estados y variantes

**Sin variantes de color ni de tamaño.** Declaración explícita:

| Estado | Veredicto |
| --- | --- |
| hover | No aplica — el primitive no es interactivo |
| focus / focus-visible | No aplica — el foco vive en el `option` del consumidor (botón) |
| active (`isActive` del item) | Sin efecto sobre el `mark` (ver §4.3) |
| disabled | No aplica |
| loading / skeleton | No aplica — el consumidor muestra skeleton de filas en su propio estado de carga; el fragmento llega ya resuelto |
| empty | `snippet` vacío o `""` → renderiza `null` (parser devuelve `[]`). Consumidores ya filtran `null/undefined` antes de renderizar |
| error / success / readonly | No aplican |

Única variante real: **tema** claro/oscuro, resuelto por los overrides `dark:` del §4.1 — no es una variante de componente, es el modo de los tokens.

---

## 6. Límite del componente: el chip NO forma parte del contrato de `SearchHighlight`

`SearchHighlight` renderiza **solo el texto con resaltado**. El chip que lo envuelve (`rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300`) es composición del consumidor y **no entra en la API** del primitive. Justificación:

1. **Separación de preocupaciones**: el invariante de seguridad vive en el render del texto (primitive); el chip es presentación inerte, sin HTML, sin riesgo.
2. **Reutilización futura**: un consumo inline (p. ej. resaltar la coincidencia dentro de un `title` o `subtitle`) debe poder usar `SearchHighlight` sin pill.
3. **Densidad de app**: el pill actual usa `text-[11px] py-1` (más denso que `Badge`, que es `text-xs py-0.5`); forzar `Badge` sería un valor paralelo, y forzar el pill dentro del primitive lo acoplaría al caso de uso de búsqueda.

**Sin embargo**, la cadena de clases del chip es **byte-idéntica en las dos apps** (`apps/web/.../GlobalSearchResultItem.tsx:85` y `apps/portal/.../GlobalSearchResultItem.tsx:89`). Es duplicación visual real entre módulos → mandato anti-duplicación del DS-OWNER (perfil §2). Orden de consolidación:

- **Receta canónica documentada** (obligatoria): el chip se compone con exactamente `rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300`. Ningún consumidor introduce una clase paralela.
- **Consolidación en `@iwana/ui`** como composite `SearchSnippetPill` (mismo archivo o colindante de `SearchHighlight`, export hermano): `{ snippet: string }` → `<span className="…chip…"><SearchHighlight snippet={snippet}/></span>`. Ejecuta AI-FE-PLATFORM en el mismo handoff.

**Decisión DS-OWNER:** el pill se consolida en el mismo acto de promoción. Si AI-EM-ARCH prefiere alcance mínimo (un solo componente, como el plan original), el pill queda por-app con la receta documentada — ver **[CONSULTA C-2]** en §12. La **migración de los call sites** (web y portal usan `<SearchSnippetPill snippet={…} />`) es opcional en esa variante.

---

## 7. Accesibilidad (WCAG 2.2 AA)

### 7.1 ¿`<mark>` es la semántica correcta? Sí.

`<mark>` es el elemento HTML5 para texto *resaltado por referencia* (p. ej. coincidencia de búsqueda). Aporta semántica nativa: los lectores de pantalla modernos lo anuncian y lo distinguen estructuralmente del resto del texto. **No** se necesita `aria-label` ni texto alternativo: el contenido del `mark` **es** el texto de la coincidencia, y el fragmento completo ya forma parte del nombre accesible del `option` del consumidor. Añadir `aria-label` o `sr-only` duplicaría la lectura.

| Criterio | Cumplimiento |
| --- | --- |
| **1.4.1 Uso del color** | El resaltado no depende del color: el `<mark>` es estructural y el texto es idéntico al original. §4.1 nota |
| **1.4.3 Contraste** | Calculado en §4.1: 7.5:1 claro / 7.2:1 oscuro — AA (holgura AAA) |
| **1.4.11 Contraste no textual** | El chip es fondo decorativo sin borde y no es un control: exento; no introduce fallo |
| **2.4.7 Foco visible** | El foco vive en el `option` del consumidor (botón con `role="option"`); el primitive no roba foco |
| **4.1.2 Nombre accesible** | El contenido del option incluye los textos del pill (nodos de texto reales); el `dangerouslySetInnerHTML` del portal —que hoy degrada esta lectura— desaparece con la migración |
| **1.4.4 Reflow** | Texto inline sin ancho fijo; el pill hereda el truncado/flujo del consumidor |

**Mejora accesible derivada de la promoción:** hoy el portal inyecta el fragmento con `dangerouslySetInnerHTML` (leído como texto por SR, pero estructuralmente opaco). Al migrar a nodos de texto + `<mark>`, el portal gana la misma semántica que web: la coincidencia queda anunciada por los SR.

---

## 8. Pruebas auditables (regresión visual / tests de componente)

Para AI-SR-QA — estados y casos que deben quedar cubiertos en `@iwana/ui` (o en los apps, ver [CONSULTA C-3]):

| # | Prueba | Tipo |
| --- | --- | --- |
| P1 | `parseSearchHighlight`: split segmentos, sin delimitador (un solo segmento), vacío (`[]`), múltiples coincidencias, payload como texto literal | Unit (parser puro) |
| P2 | Render: `<mark>` presente con `textContent` de la coincidencia; texto completo del fragmento preservado | Component |
| P3 | Render: carga `<script>` / `onerror` / iframe / `svg onload` / `<SCRIPT>` mayúsculas / entidades → **cero elementos** de la carga en el DOM, marcado literal en `textContent` | Seguridad |
| P4 | **Control negativo**: reintroducir un sink en el render → P3 falla (la prueba es la red que detecta la clase de defecto) | Seguridad |
| P5 | **Guarda de directorio**: cero `dangerouslySetInnerHTML` en `packages/ui/src/components/` (componente) y en los directorios de búsqueda de ambas apps | Seguridad (estática) |
| P6 | Regresión visual clara y oscura: token del `mark` (par lima) sobre el chip, chip `rounded-full` | Visual |
| P7 | Contraste documentado de §4.1 verificado con auditoría (regla de SR-QA) | A11y |
| P8 | Semántica: `<mark>` presente (no un `span` estilizado); chip sin `role` propio (composición) | A11y |
| P9 | Borde cosmético: `snippet` con cadena literal `<mark>…</mark>` → tramo resaltado sin etiquetas, sin elementos de carga (comportamiento documentado, no defecto) | Regresión |

El parser (P1) y el control negativo (P4) son los **auditables de contrato**: cualquier cambio de API o de token que no rompa estas pruebas no es un cambio de contrato, es de implementación.

---

## 9. Qué queda fuera de este contrato

| Fuera | Dueño / patrón correcto |
| --- | --- |
| Helper productor del portal (`highlightMatch` + `escapeHtml` + `compactHighlights` en `apps/portal/src/lib/api-client.ts:4032-4066`) | **Permanece local** en el portal: es productor de *fragmento-dato* (no de HTML interpretable). Se promueve solo si aparece un segundo consumidor cliente con matching propio |
| `GlobalSearchResultItem` / `GlobalSearchOverlay` / modelo `GlobalSearchItem` | Composición de cada app (PROD-UX/FE-PLATFORM por app) |
| El chip `SearchSnippetPill` | §6 — orden de consolidación en el mismo handoff (ver [CONSULTA C-2]) |
| Cambio del backend de búsqueda (`extractHighlights` en `apps/api`) | AI-SR-FULL — contrato de API, no de UI; no se toca |
| Sink/defensa en profundidad (CSP, ADR-081) | C-8 (AI-FE-PLATFORM + AI-PLAT-OPS) y ADR-081 — capas distintas, fuera del DS |
| Token de marca nuevo o cambio de par tonal lima | CTO — este contrato no los pide |

---

## 10. Migración de consumidores (handoff a AI-FE-PLATFORM)

1. **Mover** `apps/web/src/components/search/SearchHighlight.tsx` → `packages/ui/src/components/SearchHighlight.tsx`, exportar `SearchHighlight`, `SearchHighlightProps`, `parseSearchHighlight`, `SearchHighlightSegment` desde `packages/ui/src/index.ts`. Ajustar directiva de cliente según §2. No tocar la lógica del parser ni el render.
2. **Web:** `GlobalSearchResultItem` importa de `@iwana/ui`; eliminar el archivo local. Sin cambios de layout.
3. **Portal (cierre de C-10):** en `apps/portal/src/components/search/GlobalSearchResultItem.tsx:87-91`, reemplazar el `span` con `dangerouslySetInnerHTML` por `<SearchHighlight snippet={highlight} />` dentro del mismo chip. `highlightMatch`/`escapeHtml`/`compactHighlights` de `api-client.ts` **se mantienen como productores de fragmento-dato** (ya escapan); no cambian. Verificar `grep -rn "dangerouslySetInnerHTML" apps/portal/src` → el del directorio de búsqueda debe desaparecer.
4. **Tests:** migrar/extender las pruebas de §8 al hogar que decida SR-QA + EM-ARCH ([CONSULTA C-3]); mover el control negativo P4 y la guarda P5 junto al componente.
5. **Visual:** el `mark` cambia de estilo UA (amarillo del navegador) al par tonal lima en **ambas** apps. Cambio visual menor, comunicado a SR-QA para baselines de regresión visual (mismo mecanismo que la nota 9.1 del changelog DS). Decisión de alcance: [CONSULTA C-1].
6. **Notificar a DS-OWNER** si la implementación exige una prop nueva → se versiona este documento (v1.1+) antes de mergear API divergente.

---

## 11. Matriz de aceptación DS

| Requisito del encargo | Cumple si… |
| --- | --- |
| API única para ambos consumidores | Existe `SearchHighlight({ snippet })` en `@iwana/ui`; web y portal lo usan sin `dangerouslySetInnerHTML` ni producción de HTML interpretable |
| Tokens reales | `mark` = par lima de `Badge` (§4.1); texto literal hereda; cero tokens nuevos, cero hex |
| Estados y variantes | Declarados en §5: sin variantes propias, sin estados de interacción; modo claro/oscuro vía `dark:` |
| Límite del componente | §6: primitive puro de texto; chip como receta canónica + orden de consolidación |
| A11y | §7: `<mark>` semántico, contraste AA calculado, sin `aria-label` duplicado, portal gana semántica |
| Pruebas auditables | §8 P1–P9 definidos para SR-QA |
| Boundary | §1: promoción correcta, sin tocar backend ni tenancy; el sink no se institucionaliza |

---

## 12. Veredicto y consultas a AI-EM-ARCH

**Veredicto de carril rápido:** aprobado por AI-DS-OWNER — API + tokens + estados de `SearchHighlight` congelados para la promoción a `@iwana/ui`; no toca marca (usa el par tonal lima existente), ni stack, ni alcance UX, ni boundary. Ejecuta AI-FE-PLATFORM.

---

**[CONSULTA] De: AI-DS-OWNER → AI-EM-ARCH**

**Contexto:** promoción de `SearchHighlight` a `@iwana/ui` (cierre de C-10); el contrato congelado está en `docs/specs/2026-08-09-search-highlight-ds-contrato.md`.

**Pregunta C-1 (marca visual del `mark`):** el contrato fija el `<mark>` en el par tonal lima (Firma §3.4), lo que cambia el resaltado visible en ambas apps del amarillo UA del navegador al lima iWana. ¿Se adopta el par lima (recomendado: alinea el componente con la identidad, usa tokens reales, AA verificado) o se exige **cero cambio visual** y el `mark` queda sin clase (UA default, sin token — opción que deja el primitive fuera de marca y que no recomiendo)? Impacto si se adopta: cambio visual menor en los resultados de búsqueda de web y portal, comunicado a SR-QA para baselines.

**Pregunta C-2 (alcance del pill):** la clase del chip es byte-idéntica en ambas apps. ¿Se consolida `SearchSnippetPill` en `@iwana/ui` en el mismo acto (recomendado por el mandato anti-duplicación) o se mantiene alcance mínimo (solo `SearchHighlight`) dejando el chip por-app con la receta documentada?

**Pregunta C-3 (hogar de los tests):** `packages/ui` no tiene infraestructura Jest hoy. ¿Los tests del contrato (§8) se mantienen en los apps (importando de `@iwana/ui`, como ya hace web) con la guarda de directorio extendida a `packages/ui/src/components/`, o se crea infraestructura de tests en `packages/ui` (decisión de scope mayor, coordinada con SR-QA)?

Bloqueante: Sí (las tres son parte del prompt de ejecución de la promoción; sin respuesta, FE-PLATFORM implementa el contrato pero no congela el alcance visual/test).
