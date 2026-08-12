# PROMPT-UI-MODO-OSCURO-AUDITORIA-v1.0

## Prompt de ejecución — auditoría de diseño del modo oscuro (sistema)

**Versión:** 1.0  
**Estado:** Cerrado — INFORME A+B integrado; G2 en `PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md`  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** Auditoría (pre-G2) · protocolo v1.5 §3bis  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B)  
**Siguiente:** tras INFORME, EM-ARCH emitirá prompt de alineación G2 **solo** si el score o un P0/P1 de emparejamiento lo exige. C y D no arrancan en esta etapa.

> **Solo auditoría.** No implementar código. No congelar specs de remediación aún. No cambiar tokens de marca (CTO). No reabrir navy del sidebar.

---

## 0. Identidad de sesión

1. `AGENTS.md`
2. Este prompt
3. Skills:
   - **A** = `iwana-identity-ui-review` **modo review** (dimensiones usabilidad / UX / a11y percibida en dark) + `ui-ux-pro-max` **subordinada** (contraste, jerarquía, fatiga en sesiones largas). Toda sugerencia genérica se filtra: rechazar `dark:bg-gray-900`, OLED/neon, «Premium nocturno» (Firma §1 lo descartó).
   - **B** = `iwana-identity-ui-review` **modo review** (identidad, tokens, primitives, ingeniería) + `references/tokens.md` (bloque Dark) + ADR-056 §2. `core-components` solo para detectar primitive vs estilo local.
4. Norma dark: [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (emparejamiento obligatorio). Valores: `packages/ui/src/styles/globals.css` (bloque tokens dark). **No citar ADR-026.**
5. Dirección: [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) §4 ítems **1.2, 1.2bis, 1.4** (deuda ya contratada — medir código vivo, no redescubrir como si fuera nueva).
6. Recetas: `.agents/skills/iwana-identity-ui-review/references/component-recipes.md` · `firma-elements.md` · `evaluation-criteria.md` § Dark mode.
7. WCAG 2.2 AA. Si un hallazgo exige evidencia formal de contraste, citar el **par** (texto + superficie), no el color suelto.

**Modo de entregable:** código (grep + lectura). Screenshot live **no** es bloqueante; si no hay captura dark, marcar «revisión código sin screenshot» y no inventar pixeles.

---

## 1. Tarea del operador

Trabajar una sesión operativa larga (centro de control, listados, formularios, settings) en **tema oscuro**: leer, distinguir elevaciones, completar un campo, reconocer acción primaria y volver al tema claro sin FOUC ni pérdida de preferencia.

---

## 2. Alcance (sistema, no inventario de pantallas)

El modo oscuro es **un sistema**. Auditar capas; no abrir un hallazgo por cada archivo de inventario/expedientes.

| Capa | Qué medir | Muestreo obligatorio |
| --- | --- | --- |
| 0 · Motor | Persistencia, clase `.dark`, FOUC | `ThemeProvider.tsx`, `ThemeToggle.tsx`, `apps/web/src/app/layout.tsx`, `apps/portal/src/app/layout.tsx` |
| 1 · Tokens / primitives | Emparejamiento ADR-056; `.portal-input-surface`; Button, Input, Select, Tabs, Alert, Card, focus offset | `packages/ui/src/**` + `portal-ui.tsx` |
| 2 · Shell | Canvas, sidebar, TopHeader, campana, overlay | web + portal `layout/` |
| 3 · Superficies recientes web | Dashboard, Empresas, Historial, Plataforma/settings, auth login | `apps/web` (código vivo 2026-08-11) |
| 4 · Portal operativo | Dashboard empresa + settings empresa | `apps/portal` equivalentes |
| 5 · Deuda mecánica | Conteos Firma 1.2 / 1.2bis | grep; **una causa raíz, N ocurrencias** |

**Fuera de muestreo detallado (agregar, no desglosar):** CRM expedientes, inventario, scheduling, assurance — salvo que un primitive compartido o un `dark:bg-gray-{700-950}` los cruce (entonces el hallazgo es la causa raíz, con lista de archivos).

### Barrido EM-ARCH (punto de partida — A/B confirman, no copian a ciegas)

| Señal | Evidencia 2026-08-11 |
| --- | --- |
| `dark:bg-gray-(700\|800\|900\|950)` | Portal: `ContractCard`, `TaxProfileBlock`, `ContractDetailDrawer`, `SubscriberDetailClient`, `ScheduleCalendar` (×3), `OperationalEventualitiesPanel`. UI: `Popover.tsx`, `Calendar.tsx`. Coincide con Firma §4 1.2 (lista aún abierta). |
| `dark:text-gray-500` / `dark:text-gray-600` | Presente en web (audit rows, form-styles, NotificationBell, LoginForm, Sidebar, search, tenants) y portal (expedientes, settings, overlay). UI: Input, Select, MultiSelect, Calendar, ProgressMeter, auth-form-styles. Firma 1.2bis(b). |
| `text-iwana-secondary-700` | Muy extendido; **solo es defecto** si es texto real **sin** `dark:text-iwana-secondary-400+` (regla invertida ADR-056). Iconos `aria-hidden` exentos. `.portal-eyebrow` **sí** empareja `-700` / `-400`. |
| FOUC / persistencia | `ThemeProvider` inicializa `useState('light')` y aplica `.dark` en `useEffect`. Layouts **sin** script inline en `<head>`. Firma §4 **1.4 abierto**. Verificar si el segundo efecto escribe `light` en `localStorage` antes de leer la preferencia. |
| `.portal-input-surface` | `globals.css` ~L244: `dark:border-dark-border` + `dark:bg-dark-surface-3` — par 1.06:1 (Firma 1.2bis(a), WCAG 1.4.11). Confirmar si sigue igual. |

Correr además:

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src apps/portal/src packages/ui/src
```

Adjuntar: n deterministas, n heurísticos confirmados, n descartados.

---

## 3. Foco (qué puntúa)

1. **Emparejamiento ADR-056 §2** — texto sobre dark; lima invertido (`-400+` en dark, `-700` solo claro); bordes de control vs `dark-border` decorativo; semánticos `-400` sobre surface-3/4.
2. **Jerarquía de elevación** — nota ADR-056: superficies adyacentes 1.11–1.14. ¿El operador distingue canvas / card / input / hover en dark? Si no, es hallazgo de **identidad/DS**, no de «falta de color».
3. **Firma en dark** — lima = avance/acción, nunca urgencia; sombra dual (¿invisible sobre `#181818`?); barra lima activa; glass solo overlays.
4. **Contraste AA** del flujo de la tarea (chrome + formularios + tablas), no de cada badge.
5. **FOUC y preferencia** — primer paint vs `iwana-theme`.
6. **Consistencia web vs portal** en el mismo primitive.

No puntuar: copy/vocab salvo labels del ThemeToggle; navy del sidebar; deuda de light mode que no rompe el par dark.

---

## 4. Entregables

### Track A — INFORME owner (UX / tarea / a11y percibida)

Crear: `docs/informes/INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md`

Formato `iwana-identity-ui-review` (resumen, puntaje /100, P0–P3 con `archivo:línea`).

- Tarea del operador en una frase.
- Hallazgos de **flujo en dark**: ilegibilidad, elevación plana, foco invisible sobre surface, ThemeToggle, FOUC, fatiga (glass masivo).
- IDs **CA-DARK-UX-01…N**.
- Hueco `## Identidad / DS (Track B)` para B.
- Puntaje A (solo UX/a11y de tarea). Fórmula skill: `100 − 20·P0 − 10·P1 − 3·P2 − 1·P3`.
- `ui-ux-pro-max` subordinada: citar HIG/MD solo si el ancla iWana (ADR-056 / Firma / tokens) lo confirma.

### Track B — DS (contrato / tokens / primitives)

Integrar en el **mismo INFORME** (si A aún no existe, crear el archivo con secciones DS y dejar hueco A; no duplicar).

- Confirmar o refutar cada señal del barrido EM-ARCH con `archivo:línea`.
- Matriz: token / par / WCAG / estado (cumple / falla / deuda 1.2 ya contratada).
- IDs **CA-DARK-DS-01…N** (no chocar con CA-DARK-UX).
- Puntaje B (identidad + tokens + primitives).
- **Puntaje combinado A+B** en la cabecera (misma fórmula de la skill sobre el conjunto deduplicado por causa raíz).
- Veredicto carril rápido SÍ/NO: remediación de **emparejamiento con tokens existentes** = carril rápido (ADR-056 ya lo ratificó). Cambio de valores `--color-dark-surface*` o de marca = **no** es carril rápido (CTO).
- Script `audit-ui.mjs` en el INFORME.

Anti-falsos-positivos de la skill: una causa raíz, no 80 hallazgos de `secondary-700`; heurísticos del script no entran sin confirmación; no recomendar tokens que no existan.

---

## 5. Fuera de alcance

Implementación FE · tests E2E nuevos · OpenAPI · portal/web **rediseño** de pantallas · cambiar hex de superficies · reabrir contrato navy · auth «Premium nocturno» como dirección de las vistas operativas.

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Auditoría sistémica del modo oscuro (web + portal + `@iwana/ui`) |
