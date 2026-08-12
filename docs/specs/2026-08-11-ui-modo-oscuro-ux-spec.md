# UX spec — Modo oscuro (sistema web + portal)

**Versión:** 1.0  
**Estado:** Congelado  
**Fecha:** 2026-08-11  
**Propietario:** AI-PROD-UX  
**Alcance:** tema oscuro como **sistema** en `apps/web` y `apps/portal` (chrome, formularios, tablas, settings, centro de control). No es una pantalla.  
**Prompt:** [`PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md`](../prompts/PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md)  
**Plan:** [`2026-08-11-ui-modo-oscuro-alineacion.md`](../plans/2026-08-11-ui-modo-oscuro-alineacion.md)  
**Informe:** [`INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md`](../informes/INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md)  
**Contrato DS hermano:** [`2026-08-11-ui-modo-oscuro-ds-contrato.md`](2026-08-11-ui-modo-oscuro-ds-contrato.md) (track B en paralelo)  
**Norma:** [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (cuatro reglas de emparejamiento; el contraste es un par)  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md) §4 ítems **1.2, 1.2bis, 1.4**  
**Skills:** `iwana-identity-ui-review` (modo **diseño**, spec no informe) + `ui-ux-pro-max` **subordinada**  
**Forma de referencia (estructura, no copy):** [`2026-08-11-web-settings-plataforma-ux-spec.md`](2026-08-11-web-settings-plataforma-ux-spec.md)

Esta spec **alinea** la tarea en dark a pares ya existentes. **No rediseña** pantallas, no pide contratos API y no inventa tokens. Recetas de clase y GO de carril rápido → contrato DS hermano.

### Changelog

| Ver | Estado | Cambio |
| --- | --- | --- |
| **1.0** | **Congelado** | Alineación post-auditoría 24/100: tarea de sesión larga, estados de experiencia, CA-DARK-UX-01…06 transcritos. |

---

## 1. Persona / tarea

**Persona:** operador ISP en sesión larga (plataforma `SYSTEM_ADMIN` en `apps/web` **o** admin/operador de empresa en `apps/portal`). Misma tarea en ambas consolas; el chrome (campana, ThemeToggle, buscador) es el ancla.

**Tarea (un ciclo, sin wizard, sin rediseño de pantallas):**

1. **Abre** la consola con preferencia oscura ya guardada y ve el primer paint **en oscuro** (sin flash claro).
2. **Lee** chrome, KPIs y tablas: distingue canvas / card / fila bajo el puntero.
3. **Completa un campo** (settings, filtros, login, buscador): el control se identifica frente a la card.
4. **Reconoce** la acción primaria y el foco de teclado (ThemeToggle, campana, buscador, tabs, filas).
5. **Lee metadatos** («cuándo», «qué empresa», placeholders) con contraste AA.
6. **Vuelve al tema claro** con el ThemeToggle **sin FOUC** ni pérdida de preferencia.

Esta spec **empareja** lo que el operador ya hace en claro. No cambia el orden de pantallas, no añade pasos y no pide datos nuevos.

---

## 2. Arquitectura de experiencia (no de página)

Sin wireframe ornamental. El layout vigente de cada pantalla **no se mueve**. Dark solo cambia pares de superficie / texto / borde / foco. 375 / 768 / 1280 conservan la misma jerarquía.

```text
Sesión oscura (web y portal)
────────────────────────────────────────────
Chrome     ThemeToggle · campana · buscador
Canvas     fondo de página
Card       panel / KPI / formulario
Control    campo identificable (borde ≥ 3:1)
Tabla      fila + hover perceptible
Primaria   botón / tab activo reconocible
```

### Superficies que el operador debe distinguir

| Capa | Rol en la tarea |
| --- | --- |
| Canvas | Fondo de trabajo; no compite con el contenido. |
| Card / panel | Bloque operable (KPI, formulario, listado). Se lee por borde de card, no por glow. |
| Control | Input, select, buscador: el operador **encuentra** el campo sin adivinar. |
| Hover de fila | En historial y tablas hermanas: la fila bajo el puntero se distingue del resto. |
| Chrome | ThemeToggle, campana y buscador operables a teclado; icono del toggle sigue al tema real. |

**Prohibido en vistas operativas (identity + ui-ux-pro-max subordinada):** `dark:bg-gray-900` / familia `gray-700–950` como fondo; neon; glow OLED; «Premium nocturno» (glass masivo en tablas o formularios). Auth puede conservar glass de marca (Firma §1 / 3.5); **fuera** de esta alineación.

Navy del sidebar: **fuera**. No se reabre ni se puntúa aquí.

---

## 3. Copy canónico (solo ThemeToggle)

No se inventa copy de producto. Sentence case. Labels vivos de [`ThemeToggle.tsx`](../../packages/ui/src/components/ThemeToggle.tsx):

| Zona | Texto exacto |
| --- | --- |
| **ThemeToggle · destino claro** (`theme === 'dark'`) | Cambiar a tema claro |
| **ThemeToggle · destino oscuro** (resto) | Cambiar a tema oscuro |

El icono (sol / luna) sigue al **tema aplicado**, no a un estado React que mienta durante un flash. Clave de persistencia: `iwana-theme` (no se renombra).

Campana, buscador, tablas y settings **conservan** el copy ya vivo de cada pantalla. Esta spec no añade strings.

---

## 4. Flujos

### 4.1 Primer paint (preferencia oscura)

1. El operador recarga o abre una ruta con `iwana-theme=dark` (o preferencia de sistema si no hay clave).
2. El primer frame visible es oscuro: chrome, canvas y cards **no** pintan claro y luego oscurecen.
3. ThemeToggle muestra el destino «Cambiar a tema claro» y el icono de sol **después** de que el CSS ya es `.dark`.

### 4.2 Completar un campo

1. En settings, filtros, login o buscador, el operador localiza el control por su perímetro (no solo por el label).
2. Escribe; el placeholder muted es legible (AA).
3. Tab: el anillo de foco se ve sobre la superficie oscura.

### 4.3 Alternar tema

1. Activa ThemeToggle (clic o teclado).
2. La consola pasa a claro u oscuro **sin** flash del tema contrario.
3. Recarga: la preferencia se conserva. No hay ventana en la que el default `light` pise `iwana-theme` antes de hidratar.

### 4.4 Campana (portal)

1. Si hay avisos, el operador lee **atención** (warning / error según tono), no un acento lima de «hay avisos».
2. Lima queda para avance / acción (p. ej. «Actualizando» del dashboard empresa), nunca para recuento de notificaciones.
3. Web ya separa urgencia; portal se alinea al mismo modelo. No neon.

---

## 5. Empty / loading / feedback

Esta alineación **no** redefine empty ni skeletons de cada pantalla. Conserva la gramática vigente (skeleton con forma, empty con acción).

| Condición | Qué se ve en dark |
| --- | --- |
| **Carga de página / hidratación de tema** | Primer paint oscuro si la preferencia es dark. Prohibido flash claro. |
| **Carga de datos** | Skeleton con forma de contenido (ya especificado por cada pantalla). El par dark no convierte el skeleton en spinner bloqueante. |
| **Sin resultados / primera vez** | Empty de la pantalla dueña; no se inventa empty de «modo oscuro». |

---

## 6. Accesibilidad (WCAG 2.2 AA)

Criterio de diseño. Si identidad y a11y chocan, prevalece a11y y se documenta en el contrato DS.

- **1.4.11 (control):** el borde que identifica el campo frente a la card alcanza ≥ 3:1. `dark-border` / `dark-border-2` como **único** identificador **no** cumple (ADR-056 §2 regla 3).
- **1.4.3 (texto):** metadatos, placeholders y subtítulos muted en dark usan el par canónico que pasa AA (`gray-400` / `iwana-neutral-400`). `gray-500` / `gray-600` **prohibidos** sobre las cuatro superficies (regla 1).
- **2.4.7 (foco):** anillo visible sobre `dark-surface-*`. El anillo navy de marca sobre canvas oscuro **no** cuenta como foco. Offset sobre superficie de chrome/card se mantiene.
- **Lima:** en dark el texto lima real usa el mínimo `-400` (regla 2 invertida). Lima **nunca** es urgencia (campana portal).
- Color no es la única señal de aviso (icono + texto / recuento).
- ThemeToggle: `aria-label` §3; control de chrome con target operable.
- Iconos `aria-hidden` exentos del barrido lima.

`ui-ux-pro-max` (subordinada): foco 2–4 px visibles y rechazo gray-on-gray **solo** en tanto ADR-056 / Firma lo confirman. No se importan paletas OLED ni neon.

---

## 7. Estados de experiencia

| Estado | Qué se ve |
| --- | --- |
| **Primer paint** | Preferencia dark → primer frame oscuro. Sin flash claro. Clave `iwana-theme` intacta. |
| **Campo identificable** | Input / select / buscador se distingue de la card. El operador completa el campo sin buscar el perímetro a ciegas. |
| **Foco de teclado** | ThemeToggle, campana, buscador, tabs y filas: anillo visible sobre superficie oscura. |
| **Metadatos AA** | Timestamps de campana, empresa/subtítulo de historial, placeholders: legibles (par muted AA). Títulos en blanco/gray-100 siguen siendo el ancla de lectura. |
| **Hover de fila** | En historial y tablas de la tarea: la fila bajo el puntero se distingue de canvas y de las filas vecinas. Sin glow. |
| **Campana portal** | Recuento > 0 → warning / error según tono. **No** lima = «hay avisos». |
| **Vuelta a claro** | Toggle → primer frame claro; recarga conserva preferencia. |
| **Elevación de card** | Canvas ≠ card: borde de card perceptible. Sombra dual navy **no** opera en dark (`shadow-none`); no se sustituye por glow. |

---

## 8. Criterios de aceptación (CA-DARK-UX)

Transcritos del informe. Todos deben PASS en G6. No reenumerar. **Aceptación de tarea**, no receta de clases (eso es B).

| ID | Criterio |
| --- | --- |
| **CA-DARK-UX-01** | En dark, un campo de formulario (settings, filtros, login, buscador, Input/Select equivalentes) se distingue de la card: el identificador del control cumple WCAG 1.4.11 (≥ 3:1). Un divisor decorativo **no** basta como único borde del control. P0. |
| **CA-DARK-UX-02** | Recarga con preferencia oscura: **cero** flash claro en web y portal. `ThemeProvider` no persiste el default `light` antes de hidratar. Clave `iwana-theme` se mantiene. Script en `<head>` aplica el tema **antes** del primer paint (Firma 1.4). El icono/label del ThemeToggle no miente durante la carga. P1. |
| **CA-DARK-UX-03** | Foco de teclado visible en dark sobre chrome (ThemeToggle, campana, buscador), tabs y filas que usan el primitive compartido. El anillo navy de marca sobre `dark-surface-*` **no** cumple. Offset de chrome/card se queda. Sin glow OLED. P1. |
| **CA-DARK-UX-04** | Metadatos operativos en dark (timestamps, empresa/subtítulo, placeholders) pasan AA (1.4.3). `gray-500` / `gray-600` no aparecen como texto ni placeholder sobre superficie dark. Par canónico muted AA. Iconos `aria-hidden` exentos. P1. |
| **CA-DARK-UX-05** | El operador distingue canvas / card / hover de fila en sesión larga. Borde de card perceptible; hover de fila perceptible. Sin glow. Sombra dual navy permanece apagada en dark. No se piden hex nuevos de superficie. P2. |
| **CA-DARK-UX-06** | Campana del portal: avisos con escalas `warning` / `error` (alineada a web). Lima no significa «hay avisos». Lima sigue siendo avance/acción. Sin neon. P2. |

CA-DARK-DS-01 y CA-DARK-DS-04 son del contrato DS (B); esta spec no los reescribe. Unión G6: UX-01…06 **y** DS-01/04 PASS.

---

## 9. Responsive

| Viewport | Qué cambia | Qué no cambia |
| --- | --- | --- |
| 375 / 768 / 1280 | Solo pares dark (superficie, texto, borde, foco). | Layout, orden de bloques, densidad, IA de cada pantalla. |
| Touch | Targets de chrome (ThemeToggle, campana) siguen ≥ 44 px. | No se rediseña el shell. |

Evidencia de muestreo (D): shell + primitive + un formulario. No se exige captura live de todas las rutas.

---

## 10. Fuera de alcance

| Fuera | Motivo |
| --- | --- |
| Navy del sidebar | Contrato aparte; decisión EM-ARCH: no reabrir |
| OLED / `dark:bg-gray-900` / neon / «Premium nocturno» en vistas operativas | Rechazado (identity + ui-ux-pro-max subordinada) |
| Tokens nuevos (`info-400`, `warning-400`, hex de `--color-dark-surface*`) | CTO / ADR-056: superficies congeladas. `Alert` se queda en `*-300` |
| Auth hex de marca (Firma 3.5) | Fuera de esta alineación |
| `z-10002` | Fuera de puntaje dark |
| Rediseño de pantallas (centro de control, historial, settings, empresas) | Emparejamiento, no composición nueva |
| API, OpenAPI, migraciones, endpoints | Prompt §1.3 |
| Captura live de todas las rutas | D usa muestreo |

---

## Decisiones no reabiertas (EM-ARCH)

Transcritas del prompt ALINEACION-v1.0 §2. No se reinterpretan.

| # | Decisión |
| --- | --- |
| 1 | **Carril rápido SÍ.** Tokens existentes. **NO** cambiar `--color-dark-surface*` / marca / OLED / `info-400`. |
| 2 | **P0 CA-DARK-UX-01:** borde que identifica control = `dark:border-iwana-neutral-600` en `.portal-input-surface`, `Input`, `Select` y class-tokens equivalentes. `dark-border` solo divisor. |
| 3 | **FOUC CA-DARK-UX-02:** script inline Firma 1.4 en `<head>` de web y portal; `ThemeProvider` no persiste el default `light` (flag hidratado). Clave `iwana-theme` se mantiene. |
| 4 | **Foco CA-DARK-UX-03:** `dark:focus-visible:ring-iwana-primary-300` en `interactiveFocusClassName` y base de `Button`. Offset `dark-surface-2` se queda. Copiar el par ya vivo en `Input`. |
| 5 | **Texto muted CA-DARK-UX-04:** par canónico `text-gray-500 dark:text-gray-400` (o `iwana-neutral-400`) en primitives y un barrido grep de `dark:text-gray-500` / `gray-600` en `apps/*` + `packages/ui` (excl. specs). |
| 6 | **`dark:bg-gray-{700-950}` CA-DARK-DS-01:** las 13 ocurrencias → `dark-surface-2/3/4` según rol (card / input-dropdown / hover). Incluye `Popover` y `Calendar`. |
| 7 | **Lima invertida CA-DARK-DS-04:** texto real `secondary-700` sin override → `dark:text-iwana-secondary-400` (muestreo del informe + grep de `<th>`/`<dt>`/labels). Iconos `aria-hidden` exentos. `.portal-eyebrow` ya cumple. |
| 8 | **Elevación CA-DARK-UX-05:** borde de card `dark-border-2`; hover de fila `dark-surface-3`. No glow. `dark:shadow-none` se mantiene (sombra navy no opera). |
| 9 | **Campana portal CA-DARK-UX-06:** alinear a web (`warning`/`error`, no lima = avisos). |
| 10 | Semánticos `info-400`/`warning-400`: **no crear**. `Alert` se queda en `*-300`. |
| 11 | Tests: Jest ThemeProvider (no escribir light antes de hidratar) + foco/borde en primitive; D corre `audit-ui.mjs` y grep `dark:bg-gray-(700\|800\|900\|950)` = 0 en código productivo. |

**Stop:** token nuevo; cambio de hex dark-surface; OLED; reabrir navy; API.  
**Go:** CA-DARK-UX-01…06 y CA-DARK-DS-01/04 PASS en G6 (D). Combinado no tiene que llegar a 90 en esta fase; bloqueantes en verde.

---

## Nota de identidad (modo diseño)

- **Clasificación:** sistema (chrome + formulario + tabla), no pantalla nueva.
- **Firma con función:** lima = avance/acción (nunca urgencia); foco visible; elevación por borde de card, no por glow.
- **Rechazado:** `gray-900` / `dark:bg-gray-{700-950}` como canvas; neon; OLED; Premium nocturno en operativas.
- **Copy:** solo labels vivos del ThemeToggle.
- Recetas de clase, pares hex y GO de carril → **B**.

---

*Congelado 2026-08-11 por AI-PROD-UX · v1.0. Track A del prompt ALINEACION-v1.0 (protocolo §3bis). Cita CA-DARK-UX del informe y decisiones EM-ARCH 1–11; no inventa API, tokens ni copy. Sin `[BLOQUEO]`.*
