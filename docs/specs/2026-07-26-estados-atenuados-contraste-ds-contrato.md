# Contrato DS — estados atenuados y contraste (`disabled`, `loading`/`aria-busy`, fila inactiva)

**Versión:** 1.0
**Estado:** **Vigente** — congelado el 2026-07-26
**Autor:** AI-DS-OWNER
**Aprobación:** carril rápido DS ([protocolo §3bis regla 3](../roles/Protocolo_Colaboracion_Multiagente_v1.md)) — cambia estados y recetas de clase; **no** altera alcance, contrato de datos, boundary ni tokens de marca. **Cero tokens nuevos.**
**Origen:** hallazgo **A-3** y punto 5 de la disposición de [INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0](../informes/INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.md); defecto **D-3** de [INFORME-ADR065-REGATE-RONDA3-v1.0](../informes/INFORME-ADR065-REGATE-RONDA3-v1.0.md) §D-3.
**Enmienda a:** [2026-07-24-paginacion-numerada-ds-contrato.md](2026-07-24-paginacion-numerada-ds-contrato.md) §5, fila «loading de página» — ver §6.
**Ejecuta:** AI-FE-PLATFORM. **Verifica:** AI-SR-QA.

---

## 0. Método de medición

Todos los ratios de este documento están calculados por AI-DS-OWNER sobre los valores vigentes en `packages/ui/src/styles/globals.css` y la paleta `gray-*` de Tailwind v4 (**verificado: el repo no la sobrescribe**; `--color-iwana-neutral-*` es una rampa aparte). Fórmula WCAG 2.2 de luminancia relativa, con el color de texto **compuesto sobre su fondo real** usando la opacidad efectiva del ancestro:

```
c_efectivo = c_texto · α + c_fondo · (1 − α)
```

Ese compuesto es el punto clave del documento: `opacity` no atenúa «un poco» el texto — lo mezcla con el fondo y **destruye la relación de contraste de forma multiplicativa**. Los valores de marca se citan por token; el hex vive solo en la fuente de tokens.

---

## 1. Veredicto de carril rápido sobre D-3

### 1.1 Verificación previa al registro (protocolo §7.4)

Abrí `packages/ui/src/components/Select.tsx` y su `git diff`. Lo que afirma el informe auditado, contrastado con la lectura:

| Afirmación auditada | Verificación propia | Resultado |
| --- | --- | --- |
| El placeholder pasó de `text-gray-400` a `text-gray-500` | `Select.tsx:479` → `!selectedOption && 'text-gray-500 dark:text-gray-500'`; el diff muestra exactamente esa línea | **Confirmado** |
| Solo cambió la variante clara | El diff es de una línea; `dark:text-gray-500` aparece a ambos lados del cambio | **Confirmado** |
| No hay regresión en oscuro | Correcto: no cambió | **Confirmado, pero incompleto** — ver §1.3 |
| `text-gray-400` daba ~2,6:1 | Medido: **2,60:1** | **Confirmado** |
| `text-gray-500` da ~5,3:1 | Medido: **4,84:1** | **Corregido** — pasa AA igual, pero el margen real sobre 4,5 es 0,34, no 0,8 |
| 90 archivos consumidores | `[<]Select` en `*.tsx` → **90 archivos**; de esos 2 son specs de test → **88 consumidores productivos** (81 en `apps/portal`, 7 en `apps/web`) | **Confirmado** |

El diff trae además dos cambios ajenos a D-3 en el mismo archivo (`React.useId()` extraído de un ternario en `:99-103`; dependencias completadas en un `useEffect` en `:311`). No alteran apariencia ni contrato: quedan fuera de este veredicto.

### 1.2 Veredicto

# RATIFICADO TAL CUAL — sin ajuste, sin reversión

Razones, en orden de peso:

1. **Revertir reintroduce una violación AA medida.** `text-gray-400` sobre blanco = **2,60:1** contra el mínimo de 4,5:1 del SC 1.4.3. Un placeholder no es texto exento: es la etiqueta que dice qué se espera del campo.
2. **El estado corregido cumple:** `text-gray-500` sobre blanco = **4,84:1**.
3. **No toca marca.** `gray-*` es paleta neutra de Tailwind, no la rampa `iwana-primary` / `iwana-secondary`. No hay materia de escalación al CTO.
4. **El alcance real —88 consumidores productivos— refuerza la ratificación, no la debilita.** El cambio propaga una corrección de accesibilidad a todo el producto de forma uniforme. Revertirlo propagaría el defecto con la misma uniformidad.

**Sobre el proceso, que es lo que A-3 registra correctamente:** el cambio se hizo dentro de un arreglo de E2E, sin pasar por el contrato. Ratifico el resultado y confirmo la objeción de método. Queda cubierto por §7.

**`text-gray-500` queda fijado como el piso de texto sobre blanco.** 4,84:1 es el token neutro más bajo que aún cumple AA; su margen es de 0,34. Ningún texto no exento baja de ahí, y —consecuencia directa, §3— **nada que lo contenga puede llevar `opacity`**.

### 1.3 Hallazgo nuevo · la variante oscura del mismo placeholder **no** cumple AA

El informe auditado verificó que el modo oscuro **no cambió**, y es cierto. Pero de ahí concluyó que el oscuro está bien, y no lo está.

`Select.tsx:479` aplica `dark:text-gray-500` sobre el fondo del trigger, que es `dark:bg-dark-surface-3` (`:475`):

| Medición | Ratio | AA (4,5:1) |
| --- | --- | --- |
| `gray-500` sobre `dark-surface-3` | **2,97:1** | **FALLA** |
| `gray-400` sobre `dark-surface-3` | **5,52:1** | Cumple |

**D-3 corrigió el claro y dejó el oscuro incumpliendo.** No es una regresión introducida por la remediación —el defecto es anterior—, pero el gate lo dio por resuelto y no lo está.

**Corrección ordenada (carril rápido, token no-marca):** en `Select.tsx:479` el placeholder oscuro pasa a `dark:text-gray-400`. Línea resultante:

```
!selectedOption && 'text-gray-500 dark:text-gray-400'
```

El `dark:disabled:text-gray-500` de `:474` **no se toca**: es estado exento (§2).

---

## 2. La frontera de exención — regla decidible

WCAG 2.2 SC 1.4.3 exime del mínimo de contraste al «texto que forma parte de un componente de interfaz inactivo». La frontera es estrecha y se cruza con facilidad. Se decide así, sin margen de interpretación:

> **Un estado atenuado está exento si y solo si la inoperancia está declarada en el DOM**, mediante el atributo `disabled` nativo (sobre `button`, `input`, `select`, `textarea`, `fieldset`) o `aria-disabled="true"`, **en el propio elemento o en un ancestro del texto atenuado**.

Todo lo demás **no está exento** y debe medir ≥ 4,5:1 (≥ 3:1 para ≥ 24 px, o ≥ 18,66 px en negrita) **después de componer la opacidad**.

Comprobación en una línea para el implementador:

> Si quitas la clase de atenuación, ¿el usuario podría actuar sobre este elemento **en este instante**?
> **Sí → no está exento.** El contenido sigue siendo información vigente: refrescando, inactivo, archivado, en segundo plano. Debe cumplir 4,5:1.
> **No, y el DOM lo dice → exento.**

Casos que **no** están exentos, por más que lo parezcan:

- `aria-busy="true"` / `refreshing` / `loading` — el contenido sigue en pantalla, sigue siendo legible y sigue siendo **la señal de estado del sistema**. Atenuarlo es precisamente el caso que WCAG no exime.
- «Registro inactivo», «archivado», «vencido» — es dato de negocio plenamente vigente y consultable.
- «Atenuado porque hay otro panel abierto» — jerarquía visual, no inoperancia.

Esta frontera coincide con la que aplica la herramienta que verifica: `axe-core` 4.11.1 excluye del `color-contrast` únicamente los nodos que su helper `isDisabled` reconoce — `disabled` nativo o `aria-disabled="true"`, con herencia por ancestro (`axe.js:27478` y `:24430-24448`). Un contenedor con `aria-busy` **no** entra en esa exclusión.

---

## 3. Regla operativa · `opacity` queda prohibido sobre subárboles con texto no exento

### 3.1 La regla

> **Prohibido `opacity-*` < 100 en cualquier elemento que contenga —él o sus descendientes— texto no exento.**
> No hay valor permitido. No es «usa un valor más alto»: es que **no existe** un valor conforme.

### 3.2 Por qué no hay valor que negociar

La opacidad de un ancestro se aplica a **todo** el subárbol. El token que decide la conformidad no es el más fuerte, es **el más débil que haya dentro**. Ratios medidos:

**Claro — sobre blanco:**

| Token | α=1 | α=0,9 | α=0,8 | α=0,75 | α=0,7 | α=0,6 | α=0,5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gray-700` (celda) | 10,30 | 7,65 | 5,71 | 4,96 | **4,33** | **3,34** | **2,63** |
| `gray-500` (secundario) | 4,84 | **3,96** | **3,28** | **3,00** | **2,75** | **2,32** | **1,98** |
| `iwana-primary` | 17,32 | 13,07 | 9,24 | 7,73 | 6,47 | 4,60 | **3,36** |

**Oscuro — sobre `dark-surface-2`:**

| Token | α=1 | α=0,9 | α=0,85 | α=0,8 | α=0,7 | α=0,6 |
| --- | --- | --- | --- | --- | --- | --- |
| `gray-200` (celda) | 12,85 | 10,65 | 9,64 | 8,70 | 6,99 | 5,52 |
| `gray-400` (secundario) | 6,12 | 5,23 | 4,82 | **4,44** | **3,73** | **3,11** |

En negrita, lo que incumple AA.

Las tablas del portal **mezclan** `gray-700` en la celda con `gray-500` en la línea secundaria (nombre + correo, código + descripción). El token vinculante es `gray-500`, cuyo margen entero sobre 4,5 es de 0,34: **falla ya en α=0,90**, la atenuación más leve que un ojo humano distingue. En oscuro el vinculante es `gray-400`, que falla desde α=0,80.

De ahí la forma de la regla. Cualquier umbral —0,75, 0,8, 0,85— sería una cifra arbitraria que un módulo con una línea secundaria rompería en silencio. **La única frontera estable es 1.**

### 3.3 Cómo se atenúa entonces: escalón de token, nunca opacidad

Cuando un estado **no exento** debe verse atenuado, se baja un escalón en la rampa de texto y se deja la opacidad en 1:

| Contexto | De | A | Ratio resultante |
| --- | --- | --- | --- |
| Celda de tabla, claro | `text-gray-700` (10,30) | `text-gray-500` | **4,84 — AA** |
| Celda de tabla, oscuro | `text-gray-200` (12,85) | `text-gray-400` | **6,12 — AA** |
| Texto ya secundario (`gray-500` claro / `gray-400` oscuro) | — | **no baja** | ya está en el piso |

Reglas que acompañan al escalón:

- **El piso es duro.** `gray-500` sobre blanco y `gray-400` sobre `dark-surface-2`/`-3`. Nada por debajo, en ningún estado no exento.
- **Un solo escalón.** Bajar dos (`gray-700` → `gray-400`) da 2,60:1 en claro: prohibido.
- **El texto que ya está en el piso no se atenúa.** Un estado no puede atenuar todas sus líneas: la atenuación de la fila la carga el texto primario, más un recurso **no textual**.
- **Recurso no textual permitido:** fondo de fila (`bg-iwana-neutral-50`, token existente) y/o un marcador explícito — `Badge` de estado, que además satisface SC 1.4.1 (el estado no puede depender solo del color).

**Trampa de implementación que el contrato señala y FE-PLATFORM debe resolver:** poner `text-gray-500` en el `<tr>` **no hace nada**, porque cada `<td className={portalDataTableCellClassName}>` fija su propio `text-gray-700`. El escalón exige una variante de descendiente (`[&_td]:text-gray-500 dark:[&_td]:text-gray-400`) o que la clase de celda acepte la variante. El contrato fija el **resultado medible**; el mecanismo es de FE-PLATFORM.

---

## 4. Contrato por estado

### 4.1 `disabled` — exento

- **Requisito duro:** el atributo `disabled` nativo o `aria-disabled="true"` **debe estar en el DOM**. Atenuar sin declararlo es un defecto de accesibilidad *y* deja de estar exento. Hallazgo **P1**.
- **Valor único de atenuación: `opacity-50`.** Un solo valor en todo el sistema. `opacity-30` / `-40` / `-60` preexistentes se normalizan a `-50` cuando el componente se toque por otra razón; no se ordena una migración masiva por esto.
- **Prohibido apilar `opacity` sobre un token de texto ya atenuado.** `text-gray-400` (2,60:1 en claro) más `opacity-60` da **1,70:1**: el control desaparece. El estado `disabled` se compone sobre el token **normal** del control. Hallazgo **P1** — es la única regla de esta sección que sí ordena remediación (§5, caso 6).
- **El texto atenuado nunca puede ser el único portador de información** que el usuario necesite leer. Si lo es, no se atenúa: se deshabilita el control y la información se emite fuera de él.

### 4.2 `loading` / `aria-busy` — **no** exento

La señal de carga es **no textual**. El texto que siga renderizado se queda en su token pleno, con opacidad 1.

Composición obligatoria, toda ella con primitives y tokens ya existentes:

1. **Los controles que disparan el cambio pasan a `disabled` nativo.** Es señal visible, es exento y es lo que ya hace `PortalTablePager` (`portal-ui.tsx:836`, `:877`, `:891`). Conservan su `disabled:opacity-50`.
2. **La región lleva `aria-busy="true"`** y **un solo** anuncio `aria-live="polite"` (ya implementado en `portal-ui.tsx:819-821`).
3. **`cursor-progress`** sobre la región ocupada. Sin implicación de contraste.
4. **Si el contenido debe ceder visiblemente, se sustituye por `SkeletonBlock`** — primitive ya exportado por `@iwana/ui` (`packages/ui/src/index.ts:19`). El skeleton **no contiene texto**, así que no tiene requisito de contraste. Es además lo que ya prescribe `iwana-identity-ui-review` §7: «loading = skeleton con forma».
5. **La región no se desmonta.** La sustitución es en sitio, para no producir CLS.
6. **`opacity` sobre el contenido: prohibido, en cualquier valor.** Sin excepción de duración: un estado de 300 ms que incumple, incumple.

### 4.3 Fila inactiva / registro archivado — **no** exento

Un registro inactivo es dato vigente y consultable. No hay exención posible.

- **`portalDataTableInactiveRowClassName` deja de ser `opacity-70`.** Medido: celda `gray-700` a α=0,7 → **4,33:1** (falla), línea secundaria `gray-500` → **2,75:1** (falla holgadamente).
- **Sustitución:** escalón de token según §3.3 (`[&_td]:text-gray-500` claro / `dark:[&_td]:text-gray-400` oscuro) **más** el `Badge` de estado que estas tablas ya renderizan en su columna de estado. Cero opacidad.
- **Nombre y semántica:** la constante se usa hoy en dos sentidos distintos —fila inactiva (no exento) y botón `disabled` en `portal-ui.tsx:444` (exento)—. **Un nombre, dos contratos, es un defecto de contrato.** Se separa en dos: la constante de fila inactiva pasa a expresar el escalón de token; el `:444` usa la receta de `disabled` de §4.1.

### 4.4 Matriz de referencia

| Estado | ¿Exento? | Mecanismo obligatorio | Prohibido |
| --- | --- | --- | --- |
| `disabled` | Sí, si está en el DOM | `disabled`/`aria-disabled` + `opacity-50` sobre el token normal | Atenuar sin declararlo; apilar sobre token ya atenuado; valores distintos de `-50` |
| `loading` / `aria-busy` | **No** | Controles `disabled` + `aria-busy` + `aria-live` + `cursor-progress`; `SkeletonBlock` si el contenido cede | **Todo `opacity-*` sobre contenido con texto** |
| Fila inactiva / archivado | **No** | Escalón de token (§3.3) + `Badge` de estado + fondo `iwana-neutral-50` | `opacity-*`; depender solo del color |
| Segundo plano / de-énfasis | **No** | Jerarquía por tamaño, peso o token; nunca por opacidad | `opacity-*` sobre texto |
| `readonly` | **No** | Token pleno; el borde y la ausencia de cursor portan el estado | Confundirlo con `disabled` |

---

## 5. Componentes en incumplimiento — insumo para la ola de FE-PLATFORM

Enumerado por lectura directa del código, con el ratio medido. **Prioridad P1 = viola AA hoy.**

### P1 · Contenedor atenuado durante `refreshing` — 11 archivos, mismo patrón literal

Todos aplican `'overflow-x-auto opacity-60 transition-opacity'` (o `'p-4 opacity-60 …'`) sobre un `<div aria-busy>` que envuelve la tabla completa. **Esta es la causa del flake `color-contrast` de v2-34 / R-14**, no el pager.

Ratios dentro de ese contenedor: celda `gray-700` → **3,34:1**; línea secundaria `gray-500` → **2,32:1**; en oscuro `gray-400` → **3,11:1**.

| Archivo | Línea |
| --- | --- |
| `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` | 450 |
| `apps/portal/src/components/assurance/AssuranceTicketsTable.tsx` | 203 |
| `apps/portal/src/components/inventory/AssetLoansPanel.tsx` | 250 |
| `apps/portal/src/components/inventory/AssetsWorkspace.tsx` | 206 |
| `apps/portal/src/components/inventory/PurchaseWorkspace.tsx` | 653 |
| `apps/portal/src/components/inventory/StockCountsWorkspace.tsx` | 633 |
| `apps/portal/src/components/inventory/StockIssuesWorkspace.tsx` | 410 |
| `apps/portal/src/components/inventory/StockKardexPanel.tsx` | 348 |
| `apps/portal/src/components/inventory/SuppliersPanel.tsx` | 298 |
| `apps/portal/src/components/inventory/UsefulLifeAlertsPanel.tsx` | 270 |
| `apps/portal/src/components/inventory/WriteOffsPanel.tsx` | 337 |

**Orden de consolidación:** once copias literales de la misma receta es duplicación de contrato, no coincidencia. Al remediarlas, la composición de §4.2 se extrae a **un solo** helper en `apps/portal/src/components/shared/portal-ui.tsx`, y ninguna pantalla vuelve a escribir la receta a mano. Un `opacity-*` sobre un contenedor con `aria-busy` es **hallazgo P1 automático** en review.

### P1 · Fila inactiva por opacidad — 7 consumidores

`portalDataTableInactiveRowClassName` (`portal-ui.tsx:55`), aplicado sobre `<tr>` sin `disabled` ni `aria-disabled`:

`users/UsersTable.tsx:360` · `commercial/TaxApplicationRulesManager.tsx:486` · `commercial/CompatibilityRulesManager.tsx:415` · `commercial/PromotionsManager.tsx:487` · `commercial/BundlesManager.tsx:468` · `commercial/catalog/AdditionalServicesPanel.tsx:609` · `commercial/catalog/PlanCatalogTable.tsx:196` · `commercial/catalog/AdditionalProductsPanel.tsx:706`

La octava aparición, `portal-ui.tsx:444`, sí va sobre un `<button disabled>` → exenta, pero exige la separación de nombre de §4.3.

### P1 · Otros contenedores no exentos con opacidad

| Archivo:línea | Caso | Medición |
| --- | --- | --- |
| `crm/subscribers/ContractCard.tsx:176` | `<div>` con `opacity-60` para contrato `ARCHIVED`; sin `disabled` ni `aria-disabled` | Mismo género que la fila inactiva: `gray-700` → 3,34:1 |
| `scheduling/VisitRequestRecommendationPanel.tsx:887, 1089` | `opacity-60` como de-énfasis cuando otro panel está abierto | Solo afecta a un ícono `aria-hidden` en `:887`; **verificar `:1089`** antes de remediar |
| `scheduling/ScheduleCalendar.tsx:1259` | `opacity-40` en franjas pasadas | Exento solo si la celda no contiene texto; **verificar** |

### P1 · Apilado de opacidad sobre token ya atenuado

`apps/portal/src/components/layout/Sidebar.tsx:165` — `<span aria-disabled="true">` con `text-gray-400 opacity-60` → **1,70:1**.

Está **exento** por §2 (lleva `aria-disabled`) y `axe-core` no lo reporta. Aun así incumple §4.1: un ítem de navegación primaria a 1,70:1 no es perceptible. **Corrección: quitar `opacity-60` y conservar `text-gray-400`** (2,60:1), que es el aspecto que ya tiene cualquier otro control deshabilitado del sistema. Es el único caso donde este contrato ordena remediar un estado exento, y se ordena por coherencia de sistema, no por conformancia.

### Verificados y conformes — no requieren acción

- **`PortalTablePager`, `portal-ui.tsx:190` y `:693`** — `disabled:opacity-50`. La variante `disabled:` solo se activa con el atributo nativo, presente en `:836`, `:877` y `:891`. Exento por §2 y excluido por `axe-core`. **El prompt de la etapa 4 lo señalaba como el segundo problema de contraste vivo; la lectura del código no lo sostiene.** El defecto real es §5-P1 (el contenedor `opacity-60`), que está en las pantallas consumidoras, no en el primitive.
- **`@iwana/ui`:** `Calendar.tsx:64,131,137,162` · `MultiSelect.tsx:112,222` · `CheckboxCard.tsx:35` · `SectionAccordion.tsx:171,193,269` · `Button.tsx:90,98` — todos sobre `disabled` nativo, o sobre un `<label>` que envuelve un `<input disabled>` (caso que `axe-core` excluye explícitamente, `axe.js:27509-27513`). Exentos.
- **`shared/CatalogPicker.tsx:245`** — `opacity-50` sobre un `<div role="combobox">` que emite `aria-disabled={disabled}` (`:233`). Exento.

### Deuda adyacente detectada de paso (fuera del alcance de este contrato)

Valores de marca escritos como hex crudo en lugar de token, contra ADR-056 §3: `packages/ui/src/components/auth/auth-form-styles.ts:36` (`!bg-[#A5C330]`, `!text-[#181818]`, `shadow-[#A5C330]/20`), `MultiSelect.tsx:219` (`bg-[#F5F5FD]`), `SubscribersListClient.tsx:457` (`bg-[#f6f8f4]`). Se registra; no se ordena aquí.

---

## 6. Enmienda al contrato de paginación numerada

[2026-07-24-paginacion-numerada-ds-contrato.md](2026-07-24-paginacion-numerada-ds-contrato.md) §5, fila **«loading de página»**, dice hoy:

> «`aria-busy="true"` en el `<nav>` + controles `disabled`. **Sin spinner en el pager: la señal es el contenido atenuado.**»

**La cláusula «la señal es el contenido atenuado» queda retirada.** Es el origen documental del defecto: autorizó a las pantallas a atenuar el contenido, y once de ellas lo hicieron con `opacity-60`. Se sustituye por:

> «`aria-busy="true"` en el `<nav>` + controles `disabled`. Sin spinner en el pager. **El contenido no se atenúa: la señal son los controles deshabilitados, `aria-busy`, el anuncio `aria-live` y —si el contenido debe ceder— su sustitución por `SkeletonBlock`.** Ver [contrato de estados atenuados](2026-07-26-estados-atenuados-contraste-ds-contrato.md) §4.2.»

El resto de ese contrato no cambia. Es un cambio **post-congelación**: se versiona aquí y se notifica a AI-FE-PLATFORM y AI-SR-QA a través del orquestador (protocolo §5).

---

## 7. Qué debe poder verificar QA

Convertible a aserción; sin esto el contrato no tiene red:

1. **Auditoría axe durante el estado transitorio, no solo en reposo.** El flake de v2-34 existió porque la auditoría corría cuando el estado ya había pasado. La spec temporal `e2e/tests/portal-tmp-r14-loading-contrast.spec.ts` (sin trackear) ya demuestra la técnica: latencia inyectada en la ruta, espera a `[aria-busy="true"]`, `AxeBuilder` dentro de esa ventana. Debe volverse permanente y determinista.
2. **Aserción estructural, barata y sin navegador:** ningún elemento con `aria-busy="true"` puede tener una clase `opacity-*`, ni tenerla ningún descendiente suyo. Es una regla de lint o un test de render sobre el árbol; no necesita medir color y no puede ser flaky.
3. **Regresión de la propia corrección:** un test que falle si `Select` vuelve a `text-gray-400` en el placeholder claro, y si el oscuro no queda en `dark:text-gray-400`.
4. Los tres casos marcados **«verificar»** en §5 se cierran con lectura o medición antes de tocarlos.

---

## 8. Nota de proceso — por qué este documento existe

A-3 registra que un primitive compartido cambió de apariencia dentro de un arreglo de tests, sin pasar por el contrato. La objeción de método es correcta y la sostengo. Pero el registro tardío destapó algo de más peso que el cambio que lo motivó:

**El cambio de `Select` era correcto y estaba aislado. El problema estructural estaba en el contrato, no en el parche.** El contrato de paginación —que firmé— autorizó «la señal es el contenido atenuado» sin medir qué le hace `opacity` a un subárbol de texto. Once pantallas ejecutaron esa autorización al pie de la letra y produjeron once violaciones AA. El gate a11y las vio de forma intermitente y las cerró con un reintento verde.

De ahí la lección que este contrato incorpora, y que aplica más allá de este caso: **una receta de estado que no trae su contraste medido no es un contrato, es una sugerencia.** Un estado nuevo no se congela sin el ratio calculado sobre tokens reales, en claro y en oscuro, y compuesto con la opacidad efectiva.
