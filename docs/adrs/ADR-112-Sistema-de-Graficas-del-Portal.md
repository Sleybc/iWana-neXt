# ADR-112: Sistema de gráficas del portal (Recharts tras un wrapper de `@iwana/ui`)

**Versión:** 1.0
**Estado:** Aprobado
**Aprobación:** CTO, 2026-11-17
**Fecha:** 2026-11-17
**Autor:** Claude Code (AI-EM-ARCH) · **Ejecución pendiente:** AI-DS-OWNER (tokens y API del wrapper), AI-FE-PLATFORM (peso del bundle)
**Módulos:** `packages/ui` · `apps/portal` (MOD02 inicio; reutilizable por los demás)
**Origen:** decisión D3 de [`2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md`](../specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md) · [Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) §4/Fase 3 ítem 3.1 y §8 (dependencia nueva exige ADR)

## 1. Contexto

El inicio del portal no tiene ninguna serie temporal. La dirección «Pulso y atención» pide una tendencia con tres series (suscriptores, recaudo, casos). La Firma iWana ya fijó la dirección —Recharts envuelto en un `Chart`, tema por variables `--chart-*`— pero la dejó pendiente de ADR. Hoy no existe librería de gráficas ni tokens `--chart-*` en `packages/ui/src/styles/globals.css`.

Verificado el 2026-11-17 con `npm view recharts`: versión 3.10.1, licencia MIT, peer `react ^19.0.0` (el portal usa `^19.2.0`), 7,4 MB desempaquetado.

## 2. Decisiones

| # | Decisión |
| --- | --- |
| D1 | Se adopta **Recharts 3.x** como única librería de gráficas. Se instala en `packages/ui`, no en las apps. |
| D2 | Las pantallas **no importan Recharts**: consumen un wrapper `Chart` de `@iwana/ui`. Una regla de ESLint lo impide fuera de `packages/ui`. |
| D3 | Color solo por tokens `--chart-1..4` definidos en `globals.css` para claro y oscuro. Valores y contraste (3:1 como objeto gráfico, WCAG 1.4.11) los fija AI-DS-OWNER en su contrato. Lima solo en series de avance. |
| D4 | El wrapper carga con `next/dynamic` (sin SSR): la gráfica no entra en el JS inicial del inicio ni en las pantallas que no la usan. |
| D5 | Tipos admitidos en esta fase: barras agrupadas y líneas. Sin dona, sin radial, sin área apilada multicolor (Firma §5, receta #15). |
| D6 | Toda gráfica lleva resumen textual (`role="img"` con `aria-label`) y una tabla alternativa con los mismos datos. Series distinguibles por trazo, no solo por color. |
| D7 | Las barras de proporción ya entregadas en CSS (`dashboard-visuals.tsx`) **no** migran a Recharts: no son series. |

## 3. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| SVG propio, como el del prototipo | Cero dependencia, pero ejes, escalas, tooltips por teclado y redimensionado quedarían a cargo del equipo; la Firma ya eligió Recharts |
| Tremor | Arrastra su propio sistema de estilos; choca con los tokens CSS-first |
| ApexCharts (el de TailAdmin) | No es declarativo en React y ADR-023 limita lo que se toma de TailAdmin |

## 4. Consecuencias

- Dependencia nueva de producción en `packages/ui`: entra en `pnpm audit --prod` y en la revisión de `codebase-cleanup-deps-audit`.
- El wrapper es contrato de DS: cambiarlo exige a AI-DS-OWNER.
- Si el peso del chunk diferido supera lo que AI-FE-PLATFORM acepte al medir el build, se reabre este ADR antes de publicar la gráfica.

## 5. Verificación

| Qué | Cómo |
| --- | --- |
| Ninguna pantalla importa Recharts | Regla ESLint + `grep -r "from 'recharts'" apps/` = 0 |
| La gráfica no entra en el JS inicial | Comparar el tamaño de la ruta `/dashboard` en `next build` antes y después |
| Contraste de series | Tabla de contraste en el contrato DS, en claro y oscuro |
| Accesibilidad | axe en la E2E del inicio, con la gráfica montada |
