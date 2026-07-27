# INFORME-ADR065-V2-E2E-A11Y-EVIDENCIA-v1.0

**Programa:** ADR-065 — cierre, verificación **V-2** (E2E de a11y con dev server)
**Modo:** AI-SR-QA — verificación por ejecución propia, salida literal pegada
**Fecha:** 2026-07-27
**Contrato:** [PROMPT-ADR065-CIERRE-V2-SRQA-v1.0](../prompts/PROMPT-ADR065-CIERRE-V2-SRQA-v1.0.md) + reapertura emitida por AI-EM-ARCH
**Contrato de referencia:** [contrato DS de estados atenuados](../specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md)
**Estándar:** WCAG 2.2 AA · axe-core 4.11 vía `@axe-core/playwright`

---

## Veredicto

# NO GO — V-2 queda en rojo. `portal-pager-a11y.spec.ts` falla en 4 de 5 corridas del archivo y en 12 de 12 en aislamiento.

El defecto que motivó R-14 —`opacity-60` sobre el contenedor `aria-busy`— **está corregido y verificado**. Pero **el flake de axe no está extinto**: sobrevive en el test hermano `v2-34: axe-core no reporta violaciones en tabla paginada` por un vector distinto, y esta vez está **medido**, no inferido.

Las otras dos specs del gate están en verde.

---

## 0. Entorno — declarado antes de la evidencia

| Elemento | Estado |
| --- | --- |
| Infra Docker | `iwana_postgres_dev`, `iwana_redis_dev`, `iwana_pgbouncer_dev`, `iwana_nginx_dev`, `iwana_minio_dev`, `iwana_adminer_dev` — todos `Up`, los healthchecked en `healthy` |
| Portal (3002) | Ya corriendo antes de empezar → `GET /auth/login` = **200**. `webServer.reuseExistingServer: true` reutilizó ese proceso; Playwright no levantó ninguno nuevo |
| Web (3001) | Ya corriendo → **200**. Mismo caso |
| API (3000) | `GET /api/v1/health` = **200** (las tres specs mockean HTTP; la API no participa) |
| `baseURL` | `http://127.0.0.1:3002` (portal) y `http://127.0.0.1:3001` (web), tomados de los configs. **Sin fallo de `baseURL`** — la contaminación de la ronda anterior no se repitió |
| `retries` | **0** en ambos configs y sin override en CI. Ningún rojo de este informe está enmascarado ni rescatado por reintento |
| Servidores al terminar | Quedan corriendo los dos dev servers (3001, 3002) y la infra Docker, **tal como estaban antes**. No arranqué ni detuve nada |

---

## 1. Corrida 1 de `portal-pager-a11y.spec.ts` — VERDE

```
Running 7 tests using 1 worker

  ok 1 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:532:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-25: foco permanece en un botón del pager al paginar (956ms)
  ok 2 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:558:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-25: foco restaurado tras paginar a la última página parcial (873ms)
  ok 3 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:582:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-25: foco restaurado tras volver con Anterior (949ms)
  ok 4 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:602:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-27: controles se deshabilitan durante carga con latencia (2.6s)
  ok 5 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:644:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-34: axe-core no reporta violaciones en tabla paginada (3.2s)
  ok 6 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:714:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-34 R-14: el estado de carga cumple contraste AA (2.0s)
  ok 7 [chromium] › e2e\tests\portal-pager-a11y.spec.ts:791:3 › PortalTablePager — foco (v2-25) y a11y (v2-34) › v2-34: modo oscuro no introduce violaciones de contraste (1.9s)

  7 passed (13.7s)
```

**Si el encargo hubiera pedido una sola corrida, este informe habría firmado verde.** Es exactamente el error de método que la reapertura señala. La corrida 2 lo desmonta.

---

## 2. Corrida 2, consecutiva, mismo comando — ROJA

```
Running 7 tests using 1 worker

  ok 1 ... v2-25: foco permanece en un botón del pager al paginar (952ms)
  ok 2 ... v2-25: foco restaurado tras paginar a la última página parcial (913ms)
  ok 3 ... v2-25: foco restaurado tras volver con Anterior (916ms)
  ok 4 ... v2-27: controles se deshabilitan durante carga con latencia (2.5s)

===== AXE_V2_34_PAGE2 =====
[
  {
    "id": "color-contrast",
    "impact": "serious",
    "help": "Elements must meet minimum color contrast ratio thresholds",
    "nodeCount": 1,
    "nodes": [
      {
        "target": [
          "button[aria-label=\"Anterior\"] > .sm\\:inline.hidden"
        ],
        "html": "<span class=\"hidden sm:inline\">Anterior</span>",
        "data": {
          "fgColor": "#777e92",
          "bgColor": "#fafbfc",
          "contrastRatio": 3.91,
          "fontSize": "9.0pt (12px)",
          "fontWeight": "normal",
          "messageKey": null,
          "expectedContrastRatio": "4.5:1"
        }
      }
    ]
  }
]
===== /AXE_V2_34_PAGE2 =====
  x  5 ... v2-34: axe-core no reporta violaciones en tabla paginada (2.6s)
  ok 6 ... v2-34 R-14: el estado de carga cumple contraste AA (2.3s)
  ok 7 ... v2-34: modo oscuro no introduce violaciones de contraste (1.9s)

  1) [chromium] › e2e\tests\portal-pager-a11y.spec.ts:644:3 › ... › v2-34: axe-core no reporta violaciones en tabla paginada

    Error: expect(received).toEqual(expected) // deep equality

    "message": "Element has insufficient color contrast of 3.91 (foreground color: #777e92,
                background color: #fafbfc, font size: 9.0pt (12px), font weight: normal).
                Expected contrast ratio of 4.5:1",
    "relatedNodes": [
      { "html": "<button class=\"inline-flex items-ce...\" aria-busy=\"false\" type=\"button\" aria-label=\"Anterior\">",
        "target": ["button[aria-label=\"Anterior\"]"] }
    ],
    "tags": ["cat.color","wcag2aa","wcag143","TTv5","TT13.c","EN-301-549","EN-9.1.4.3","ACT","RGAAv4","RGAA-3.2.1"]

      676 |     logAxeEvidence('AXE_V2_34_PAGE2', page2Result.violations);
    > 677 |     expect(page2Result.violations).toEqual([]);
          |                                    ^
        at C:\appiw\e2e\tests\portal-pager-a11y.spec.ts:677:36

  1 failed
    [chromium] › ... › v2-34: axe-core no reporta violaciones en tabla paginada
  6 passed (14.5s)
```

Detalle relevante del nodo: **una sola violación, un solo nodo**, siempre en el mismo sitio — la etiqueta del botón «Anterior», en la auditoría de la **página 2**. Las auditorías de página 1 y página 3 del mismo test pasan siempre.

---

## 3. Tasa de fallo — 5 corridas del archivo + 12 aisladas

Corridas 3, 4 y 5 del archivo completo, mismo comando, consecutivas:

```
===== CORRIDA 3 =====
  ok 1 ... v2-25: foco permanece en un botón del pager al paginar (914ms)
  ok 2 ... v2-25: foco restaurado tras paginar a la última página parcial (928ms)
  ok 3 ... v2-25: foco restaurado tras volver con Anterior (900ms)
  ok 4 ... v2-27: controles se deshabilitan durante carga con latencia (2.5s)
  x  5 ... v2-34: axe-core no reporta violaciones en tabla paginada (2.5s)
  ok 6 ... v2-34 R-14: el estado de carga cumple contraste AA (2.1s)
  ok 7 ... v2-34: modo oscuro no introduce violaciones de contraste (1.8s)
  1 failed
  6 passed (13.8s)
===== CORRIDA 4 =====
  ... idéntico ... x 5 ... (2.5s)
  1 failed
  6 passed (13.7s)
===== CORRIDA 5 =====
  ... idéntico ... x 5 ... (2.5s)
  1 failed
  6 passed (13.3s)
```

`--repeat-each=12` sobre el test aislado:

```
Running 12 tests using 1 worker
  x   1 ... v2-34: axe-core no reporta violaciones en tabla paginada (2.6s)   fg #777e92 / bg #fafbfc / 3.91
  x   2 ... (2.6s)   fg #777e92 / bg #fafbfc / 3.91
  x   3 ... (2.6s)   fg #777e92 / bg #fafbfc / 3.91
  x   4 ... (2.6s)   fg #777e92 / bg #fafbfc / 3.91
  x   5 ... (2.5s)   fg #777d92 / bg #fafbfc / 3.94
  x   6 ... (2.6s)   fg #777e92 / bg #fafbfc / 3.91
  x   7 ... (2.5s)   fg #777e92 / bg #fafbfc / 3.91
  x   8 ... (2.5s)   fg #777d92 / bg #fafbfc / 3.94
  x   9 ... (2.6s)   fg #777e92 / bg #fafbfc / 3.91
  x  10 ... (2.5s)   fg #8c94a4 / bg #f9fbfc / 2.93
  x  11 ... (2.5s)   fg #777d92 / bg #fafbfc / 3.94
  x  12 ... (2.6s)   fg #777d92 / bg #fafbfc / 3.94
  12 failed
```

**Balance de `v2-34: axe-core no reporta violaciones en tabla paginada`: 17 ejecuciones, 16 rojas, 1 verde (5,9 %).** La única verde fue la primera del día, contra un dev server que llevaba horas ocioso. Es la corrida que un gate apurado habría firmado.

Los otros dos tests de a11y del mismo archivo, con `--repeat-each=12`:

```
v2-34 R-14: el estado de carga cumple contraste AA        →  12 passed (36.8s)   [12/12]
v2-34: modo oscuro no introduce violaciones de contraste  →  12 passed (35.2s)   [12/12]
```

---

## 4. La pregunta de la reapertura, respondida con la medición

> **¿El flake de axe desapareció porque se corrigió el defecto, o sigue vivo?**

**Las dos cosas, y hay que separarlas porque no son el mismo objeto.**

### 4.1 El defecto de R-14 está corregido — verificado, no supuesto

`v2-34 R-14` pasa **12/12 más 5/5 en archivo = 17/17**. No es un verde de suerte: el test es determinista por construcción (una compuerta retiene la respuesta de la página 2, así que no hay carrera entre axe y el fin de la carga) y asserta dos cosas dentro de la ventana `aria-busy`:

- opacidad computada del contenedor de la tabla **= 1** (mata cualquier reintroducción de `opacity-*`),
- `axe.violations` **= []** con `wcag2a + wcag2aa`.

La sustitución de `opacity-60` por `portalDataBusyRegionClassName` (`cursor-progress`) en las 11 pantallas del contrato §5-P1 **hizo lo que decía que hacía**. Ese punto se cierra.

### 4.2 El flake NO está extinto — cambió de vector, y este es su mecanismo medido

El par de colores que reporta axe (`#777e92` sobre `#fafbfc`) **no corresponde a ningún token en reposo del sistema**. Eso ya descartaba la explicación fácil. Para no volver a entregar una hipótesis, monté una **sonda de diagnóstico temporal** —fuera de `e2e/tests`, con su propio config, sin tocar ni la spec ni ningún componente— que muestrea `getComputedStyle` fotograma a fotograma sobre el botón «Anterior» justo después de que el `nav` deja de estar `aria-busy`. La sonda quedó **eliminada** al terminar la medición; su salida es esta:

```
===== SONDA_REPOSO_PAGINA_1 =====
{
  "disabled": true,
  "transitionProperty": "all",
  "transitionDuration": "0.2s",
  "color": "lab(65.9269 -0.832707 -8.17474)",        // = text-gray-400  (estado disabled:)
  "backgroundColor": "lab(98.2596 -0.247031 -0.706708)",  // = bg-gray-50 (estado disabled:)
  "opacity": "1"
}

===== SONDA_TRAZA_POST_BUSY =====   (tMs = 0 en el instante en que desaparece aria-busy)
  tMs   0  disabled:false  color oklab(0.706998 -0.00332537 -0.0217307)  bg oklab(0.984998 …)  opacity 1
  tMs   3  disabled:false  color oklab(0.706998 …)                       bg oklab(0.984998 …)  opacity 1
  tMs  15  disabled:false  color oklab(0.698663 …)                       bg oklab(0.985257 …)  opacity 1
  tMs  32  disabled:false  color oklab(0.666142 …)                       bg oklab(0.986269 …)  opacity 1
  tMs  47  disabled:false  color oklab(0.593079 …)                       bg oklab(0.988541 …)  opacity 1
  tMs  65  disabled:false  color oklab(0.486495 …)                       bg oklab(0.991856 …)  opacity 1
  tMs  80  disabled:false  color oklab(0.395695 …)                       bg oklab(0.994681 …)  opacity 1
  tMs  98  disabled:false  color oklab(0.332857 …)                       bg oklab(0.996635 …)  opacity 1
  tMs 114  disabled:false  color oklab(0.291225 …)                       bg oklab(0.997930 …)  opacity 1
  tMs 130  disabled:false  color oklab(0.263017 …)                       bg oklab(0.998808 …)  opacity 1
  tMs 148  disabled:false  color oklab(0.244402 …)                       bg oklab(0.999387 …)  opacity 1
  tMs 164  disabled:false  color oklab(0.232897 …)                       bg oklab(0.999744 …)  opacity 1
  tMs 180  disabled:false  color oklab(0.226756 …)                       bg oklab(0.999935 …)  opacity 1
  tMs 198  disabled:false  color oklab(0.224879 …)                       bg oklab(0.999994 …)  opacity 1
  tMs 214  disabled:false  color rgb(23, 22, 58)                         bg rgb(255, 255, 255) opacity 1
  … estable a partir de aquí (rgb(23,22,58) = #17163A = --color-iwana-primary)
```

Lo que dice la traza, punto por punto:

1. **`opacity` vale 1 en todas las muestras.** El vector de A-1 —la opacidad compuesta— no está implicado. Confirma 4.1 desde el otro lado.
2. `Button` lleva `transition-all duration-200` (`packages/ui/src/components/Button.tsx:17`). La variante `secondary` cambia **color y fondo** entre estados: `disabled:bg-gray-50 disabled:text-gray-400` frente a `bg-white text-iwana-primary`.
3. Cuando el pager sale de `loading`, el botón «Anterior» **pasa a habilitado en el mismo frame** (`disabled: false` ya en `tMs 0`) pero su color arranca en la paleta `disabled:` e **interpola en oklab durante 200 ms** hasta `#17163A`. Cierra en `tMs ≈ 214`.
4. **Los dos extremos cumplen.** El inicial está *exento* (atributo `disabled` nativo → `axe-core` lo excluye por §2 del contrato). El final es `#17163A` sobre `#FFFFFF` = **17,32:1**. Lo único que incumple es **la interpolación**.
5. **En el tramo interpolado el botón ya NO está exento**: `disabled === false` y `aria-busy="false"` en el DOM (así lo reporta el propio `relatedNodes` de axe). Ningún ancestro declara inoperancia. Por §2 del contrato, ahí el mínimo de 4,5:1 aplica.
6. Los ratios medidos por axe —2,93 / 3,91 / 3,94— caen sobre esa trayectoria, a ~15–55 ms del arranque, es decir entre el **8 % y el 28 %** de la transición.

**Por qué axe cae justo ahí, y por qué es sistemático y no azaroso.** El helper `waitForTableSettled` (`portal-pager-a11y.spec.ts:465-472`), que se introdujo *como remediación de A-1*, espera a `[aria-busy="true"]` con `toHaveCount(0)` y a que la opacidad del contenedor de la tabla sea 1. Ambas condiciones se cumplen **en el instante exacto en que arranca la transición del pager**. El helper devuelve el control en `tMs ≈ 0` y `AxeBuilder.analyze()` muestrea dentro de la ventana. No es aleatorio: es un muestreo anclado al peor instante posible. La variabilidad residual (qué frame concreto toca) es lo que produce el verde ocasional del 6 %.

**Por qué falla exactamente un nodo y exactamente en la página 2.** El único control que cambia de `disabled` a habilitado en esa navegación es «Anterior» (en página 1 estaba deshabilitado por ser la primera). En la auditoría de página 1 no ha habido transición previa; en la de página 3, «Siguiente» pasa a deshabilitado —vuelve a estar exento— y «Anterior» ya venía habilitado desde la página 2. La firma del fallo encaja con el mecanismo sin residuo.

### 4.3 Respuesta corta

> El **defecto** de A-1/R-14 (`opacity-60` sobre la región `aria-busy`) **está corregido**, y su test lo verifica de forma determinista: 17/17 verde.
> El **flake** —auditar con axe mientras una transición CSS está en vuelo— **sigue vivo**. Cambió de vector: ya no es `opacity` sobre el contenedor de la tabla, es la interpolación de `color`/`background-color` del propio `Button` del pager al salir del estado `disabled`. Y ya no es intermitente en el sentido benigno: falla en **16 de 17** ejecuciones.
> El verde de la corrida 1 no es prueba de nada. Es el 6 %.

---

## 5. Hallazgo V2-A · rojo con evidencia

| Campo | Valor |
| --- | --- |
| **Id** | V2-A |
| **Regla axe** | `color-contrast` · `impact: serious` · tags `wcag2aa`, `wcag143` |
| **Nodo** | `button[aria-label="Anterior"] > .sm\:inline.hidden` → `<span class="hidden sm:inline">Anterior</span>` |
| **Ancestro** | `<button aria-busy="false" aria-label="Anterior">`, **sin** `disabled` ni `aria-disabled` en el instante medido |
| **`fgColor` / `bgColor`** | `#777e92` / `#fafbfc` (modal); también `#777d92`/`#fafbfc` y `#8c94a4`/`#f9fbfc` |
| **`contrastRatio`** | **2,93 – 3,94** según el frame |
| **`expectedContrastRatio`** | 4,5:1 · texto 12 px, peso normal |
| **Ventana** | ~200 ms desde que el pager sale de `loading`; cierra en `tMs ≈ 214` |
| **Superficies** | `packages/ui/src/components/Button.tsx:17` (`transition-all duration-200`) y `:30` (variante `secondary`); consumidor `apps/portal/src/components/shared/portal-ui.tsx` (`PortalTablePager`, botones «Anterior»/«Siguiente») |
| **Reproducción** | `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-pager-a11y.spec.ts -g "v2-34: axe-core no reporta violaciones en tabla paginada" --repeat-each=12` → 12/12 rojas |
| **Severidad de gate** | **Bloqueante de V-2** — la spec del gate no pasa |
| **Severidad de producto** | **P2**, no P1: los dos extremos del estado cumplen; lo que incumple es una interpolación de 200 ms. No es la clase de la violación estructural de A-1 |

### 5.1 Las dos lecturas posibles, y por qué no las decido yo

**Lectura de método de test.** `waitForTableSettled` es incompleto: se declara «en reposo» cuando el pager acaba de empezar su transición. La corrección natural sería esperar también al fin de la transición de los controles —`transitionend`, o estabilidad de `getComputedStyle().color` en dos frames consecutivos— antes de auditar. **No la aplico**: el encargo prohíbe expresamente modificar specs para conseguir verde, y hacerlo sin disposición explícita sería exactamente el patrón que este programa viene corrigiendo. Requiere orden de AI-EM-ARCH.

**Lectura de producto.** El contrato DS §4.2 punto 6 dice, literal, «sin excepción de duración: un estado de 300 ms que incumple, incumple». Esa cláusula está escrita para `opacity` sobre contenido `aria-busy`, no para una transición de color entre dos estados conformes — **el contrato no cubre este caso**. La pregunta abierta, que es de AI-DS-OWNER y no mía, es si una interpolación de 200 ms entre un estado exento y uno conforme constituye violación de SC 1.4.3 o es un artefacto de renderizado. Si se resuelve que sí, la remediación es de AI-FE-PLATFORM: acotar el `transition-all` del `Button` a las propiedades que no afectan al contraste, o no transicionar la salida de `disabled`.

**Mi lectura como QA, para que quede registrada y no para sustituir a ninguna de las dos:** el peso real está en el método de test, porque los extremos del estado cumplen y la percepción humana de una transición de 200 ms entre dos estados legibles no es la de un texto ilegible. Pero **el gate es del test, no de mi opinión**, y el test está rojo 16 de 17 veces. V-2 no se firma.

### 5.2 Deuda de método que este hallazgo deja al descubierto

El punto 1 de §7 del contrato DS pide auditar el **estado transitorio**. Lo que la evidencia añade es que hay **dos** transitorios distintos y solo uno está cubierto:

- el transitorio de **entrada** en carga (`aria-busy` activo) → cubierto y determinista por la compuerta de R-14;
- el transitorio de **salida** de carga (controles rehabilitándose) → **descubierto**, y es donde vive V2-A.

El punto 2 de §7 —«aserción estructural, barata y sin navegador: ningún elemento con `aria-busy="true"` puede tener clase `opacity-*`»— **sigue sin implementarse**. No lo escribo aquí porque excede el alcance de V-2, pero lo dejo anotado: es la red que haría innecesario depender de una auditoría cronometrada.

---

## 6. Las otras dos specs del gate — VERDE

### 6.1 `e2e/tests/portal-crm-subscribers-pagination.spec.ts`

```
Running 1 test using 1 worker

  ok 1 [chromium] › e2e\tests\portal-crm-subscribers-pagination.spec.ts:238:3 › ADR-065 Ola 4 — Suscriptores paginación numerada › recorrido página · tamaño · filtro · deep-link (2.8s)

  1 passed (3.9s)
```

### 6.2 `e2e/tests/web-audit-logs-datepicker.spec.ts`

```
Running 3 tests using 1 worker

  ok 1 [chromium] › e2e\tests\web-audit-logs-datepicker.spec.ts:87:3 › Web auditoria - filtros de fecha con DatePicker › filtra y restablece la tabla de plataforma usando Fecha desde (2.0s)
  ok 2 [chromium] › e2e\tests\web-audit-logs-datepicker.spec.ts:133:3 › Web auditoria - filtros de fecha con DatePicker › filtra y restablece la tabla Por empresa usando Fecha desde y Fecha hasta (2.0s)
  ok 3 [chromium] › e2e\tests\web-audit-logs-datepicker.spec.ts:181:3 › Web auditoria - filtros de fecha con DatePicker › cambia de empresa y mantiene filtros DatePicker funcionales en la tabla tenant (1.8s)

  3 passed (6.8s)
```

---

## 7. Conteo consolidado

| Spec | Tests | Corridas | Resultado |
| --- | --- | --- | --- |
| `portal-pager-a11y.spec.ts` (archivo completo) | 7 | 5 | 1 verde · **4 rojas** (siempre el mismo test) |
| └ `v2-25` ×3 · `v2-27` ×1 | 4 | 5 | 5/5 verdes |
| └ `v2-34: axe-core … tabla paginada` | 1 | 5 + 12 aisladas | **1 verde / 16 rojas** |
| └ `v2-34 R-14: estado de carga cumple AA` | 1 | 5 + 12 aisladas | **17/17 verdes** |
| └ `v2-34: modo oscuro` | 1 | 5 + 12 aisladas | **17/17 verdes** |
| `portal-crm-subscribers-pagination.spec.ts` | 1 | 1 | 1/1 verde |
| `web-audit-logs-datepicker.spec.ts` | 3 | 1 | 3/3 verdes |

Ninguna corrida usó reintentos. Ningún verde de esta tabla proviene de un rescate.

---

## 8. Lo que NO hice, declarado

- **No modifiqué ninguna spec.** `portal-pager-a11y.spec.ts` está en disco exactamente como lo encontré.
- **No toqué ningún componente.** Ni `Button.tsx`, ni `portal-ui.tsx`, ni ninguna de las 11 pantallas del contrato §5-P1.
- **No ejecuté `git add`, `git commit`, `git stash` ni `git checkout`.**
- La sonda de diagnóstico de §4.2 vivió en `e2e/probe-tmp/` durante la medición, fuera del `testDir` de ambos configs de Playwright, y **está eliminada**. No queda rastro en el árbol.
- No dejé servidores nuevos: los dev servers de 3001 y 3002 y la infra Docker ya estaban arriba y siguen igual.

---

## 9. Qué necesito de AI-EM-ARCH para poder cerrar V-2

V-2 no se cierra con más ejecuciones: el rojo es estable y su causa está medida. Necesita una **disposición**, y son excluyentes:

1. **Ruta de test** — instrucción explícita para completar `waitForTableSettled` de modo que espere también al fin de la transición de los controles del pager antes de auditar. Es trabajo mío, unas líneas, y devuelve el archivo a verde sin tocar producto. Requiere que se acepte que la interpolación no es una violación de conformancia.
2. **Ruta de producto** — enrutar V2-A a AI-DS-OWNER para que se pronuncie sobre si una transición entre estado exento y estado conforme cae bajo SC 1.4.3, y en su caso a AI-FE-PLATFORM para acotar el `transition-all` del `Button`. Mientras tanto V-2 queda rojo y el test rojo es correcto: está registrando algo real.

**Mientras no haya disposición, V-2 = NO GO.** Prefiero entregar este rojo con la traza de la sonda pegada que un verde de una corrida.

---

## Disposición de AI-EM-ARCH (2026-07-27)

**Modo:** Orchestrator + Architect. **Decisión:** las dos rutas no son excluyentes — se ordenan **ambas**, en este orden y con este reparto. V2-A **no es defecto de producto**; el método de test sí está mal. Y el contrato debe cubrir el caso para que no vuelva a arbitrarse por incidente.

### Verificación previa (AI-EM-ARCH, por lectura de código)

Antes de decidir comprobé las tres afirmaciones que sostienen el hallazgo: `packages/ui/src/components/Button.tsx:18` lleva `transition-all duration-200` en la base y `:34` define el par `disabled:bg-gray-50 disabled:text-gray-400` → `bg-white text-iwana-primary` de la variante `secondary`; `waitForTableSettled` (`portal-pager-a11y.spec.ts:465-472`) espera `aria-busy` count 0 y opacidad 1 **del contenedor**, y nada más. Las tres se sostienen.

### 1 · Por qué V2-A no es defecto de producto

**No es el mismo objeto que R-14, aunque ambos se describan como «contraste en un transitorio».** La diferencia es material, no de grado:

| | R-14 (defecto real) | V2-A |
| --- | --- | --- |
| Naturaleza | **Estado estable** mientras dura la petición — segundos si el backend tarda | **Interpolación de 200 ms** entre dos extremos |
| Qué afecta | El **contenido de la tabla que el usuario está leyendo** | La etiqueta de un control |
| Extremos | El estado atenuado **es** el estado; incumple y punto | Ambos extremos cumplen: el inicial exento (`disabled` nativo, axe lo excluye), el final a 17,32:1 |
| Puede el usuario detenerse en él | Sí | No |

SC 1.4.3 exige contraste del **texto que se presenta al usuario**. Un fundido de 200 ms entre dos estados conformes no es un estado presentado: es el tránsito entre dos que sí lo son. Sostener lo contrario obligaría a prohibir toda transición de color del sistema, que no es lo que la norma dice ni lo que el contrato quiso decir.

### 2 · Por qué el método de test sí está mal — y por qué corregirlo no es relajar nada

El docblock de `waitForTableSettled` declara literalmente que **«aquí solo se audita el reposo»**. No lo consigue: espera al contenedor y devuelve el control mientras los botones del pager están a mitad de su transición. **El helper no alcanza el reposo que él mismo dice auditar.**

Esto es lo que separa esta orden del anti-patrón que este programa persigue: **se corrige *cuándo* se muestrea, no *qué* se asserta.** La aserción `expect(result.violations).toEqual([])` queda **byte a byte idéntica**. La prohibición vigente —«no relajes la aserción para conseguir verde»— no está en juego: relajar sería tolerar violaciones; esto es medir el estado que el test declara medir.

Y hay un segundo motivo, de igual peso: **16 rojas de 17 tampoco es una compuerta.** El mandato de R-14 es determinismo, y un gate que depende de si el servidor está ocioso incumple ese mandato en la dirección contraria a la de julio, pero lo incumple igual.

### 3 · Órdenes

| # | Encargo | R | Criterio de cierre |
| --- | --- | --- | --- |
| **D-1** | Completar `waitForTableSettled` para esperar el fin de la transición de los controles del pager (`transitionend`, o estabilidad de color en dos frames consecutivos). **La aserción no se toca.** | AI-SR-QA | `--repeat-each=12` en **12/12 verde**, con la misma metodología que destapó el rojo. Menos que eso no es evidencia |
| **D-2** | Implementar el punto 2 de §7 del contrato DS: aserción **estructural sin navegador** — ninguna etiqueta con `aria-busy="true"` puede llevar clase `opacity-*`. Sigue sin existir para el pager pese a estar en el contrato | AI-SR-QA | Prueba de mutación: reintroducir el defecto → rojo; revertir → verde |
| **D-3** | Extender el contrato de estados atenuados a las **transiciones entre estados**, no solo a los estados. Hoy §4.2.6 cubre `opacity` sobre contenido `aria-busy` y no dice nada de una interpolación de color entre un estado exento y uno conforme — por eso este caso hubo que arbitrarlo | AI-DS-OWNER | Regla escrita y decidible por un implementador, con el criterio de duración y de extremos |
| **D-4** | Registrar como deuda declarada: **`prefers-reduced-motion` no se honra en ningún punto del repo** (verificado por AI-EM-ARCH: cero coincidencias en `packages/ui/src` y `apps/portal/src`) | AI-DS-OWNER | Registro, no remediación en esta ola |

**Sobre D-4, para que no se sobredimensione:** SC 2.3.3 *Animation from Interactions* es **AAA**, no AA. No honrar `prefers-reduced-motion` **no** es incumplimiento del estándar único del proyecto. Se registra porque es relevante al caso —con la preferencia honrada, la transición desaparecería y con ella toda esta clase de pregunta— no porque bloquee nada.

**Lo que NO se ordena:** tocar el `transition-all` de `Button`. Sin la regla de D-3 escrita, acotarlo sería remediar contra un criterio que aún no existe — el error que el propio contrato DS diagnosticó en su §8 («una receta de estado que no trae su contraste medido no es un contrato, es una sugerencia»), ahora aplicado a las transiciones.

### 4 · Estado de V-2

**NO GO se mantiene hasta D-1 y D-2.** El rojo de SR-QA es correcto y su decisión de no arreglarlo por su cuenta fue la correcta: sin disposición, habría sido exactamente el patrón que este programa lleva cuatro informes corrigiendo. **D-3 no bloquea el cierre de V-2**, pero sí bloquea cualquier decisión futura sobre transiciones.
