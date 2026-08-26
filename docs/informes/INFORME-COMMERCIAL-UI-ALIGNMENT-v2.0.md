# INFORME — Comercial UI: rail lima + alineación de identidad

**Versión:** 2.0
**Fecha:** 2026-08-19
**Estado:** **GO**
**Módulo:** MOD06 — Comercial
**Modo:** Auditoría UI/UX (skill `iwana-identity-ui-review`, modo review) + implementación del rail vertical
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.9.md](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.9.md)
**Spec:** [2026-08-19-comercial-module-subnav-ux.md](../specs/2026-08-19-comercial-module-subnav-ux.md)
**Enmienda H9:** [2026-07-22-mod06-comercial-resumen-navegacion-ux.md](../specs/2026-07-22-mod06-comercial-resumen-navegacion-ux.md)

---

## Resumen ejecutivo

La auditoría de `apps/portal/src/components/commercial` encontró listados maduros (primitives, empty/error/loading, URL de filtros) y un cuello de botella de navegación: 7 tabs agrupados + 3 subtabs fiscales, activo navy, menú que en móvil se come el primer viewport. El tab Resumen ya no existe (v1.4); el puntaje 100/100 de v1.9 cubría paginación/a11y, no esta IA.

Se sustituyó el shell de tabs por `PortalModuleSubnav`: rail blanco con barra lima en `lg+`, selector `Sección: {label}` + `Dialog` bajo `lg`, 10 destinos planos. Copy de nav, alertas y paneles alineado al vocabulario canónico. URLs `?tab=` sin breaking change.

| Métrica | Antes (esta auditoría) | Después |
| --- | --- | --- |
| Puntaje skill (nav + copy) | 53/100 (0 P0, 3 P1, 5 P2, 2 P3) | **90/100** (0 P0, 0 P1, 3 P2 residuales fuera de alcance, 1 P3) |
| `audit-ui.mjs` deterministas | 0 | 0 |
| Jest commercial + primitive | 14 suites / 124 | **17 suites / 126** |
| Typecheck portal | — | limpio |

El P2 heurístico del script en `portalFilterChipClassName` (`bg-iwana-secondary-50`) es acento de chip activo preexistente, no fondo de panel: descartado.

---

## Hallazgos cerrados

### P1
- Navegación móvil/desktop: rail sticky `lg+` (`--portal-sticky-offset`); bajo `lg` un control de una fila abre dialog agrupado.
- Tributación anidada y «Catálogo» duplicado: Impuestos, Aplicación de impuestos y Simulador son destinos de primer nivel en Reglas.
- Simulador: label «Municipio» + ayuda «código DANE de 5 dígitos».

### P2
- Activo navy de tabs reemplazado por receta firma #1 (barra lima + `iwana-surface-soft`).
- Copy: Reemplazos, Productos, Impuestos, Reglas incompletas, subtítulo de carga sin «empresa autenticada».
- Chip inventario → `Badge variant="lime"`; pill «Auto» → `Badge`; ganador del simulador → `shadow-iwana-active` + badge lima.
- Recarga icon-only de impuestos → botón «Actualizar».

### P3
- Empty de productos/servicios: «Aún no hay…» + CTA.
- Errores fiscales a tono operable («No pudimos…»).

---

## Contrato implementado

Primitive `PortalModuleSubnav` en [portal-ui.tsx](../../apps/portal/src/components/shared/portal-ui.tsx):

- `<nav>` + botones, `aria-current="page"`, `min-h-11`, `interactiveFocusClassName`.
- Activo: `bg-iwana-surface-soft` + barra `w-1 rounded-r-full bg-iwana-secondary`.
- Prohibido: fill `bg-iwana-primary` (eso sigue siendo el contrato de **tabs** de Inventario).
- Token `--portal-sticky-offset: 69px` en `globals.css`.

IA (10 destinos): Catálogo (Planes, Productos, Servicios) · Ofertas (Combos, Promociones) · Reglas (Reemplazos, Impuestos, Aplicación de impuestos, Simulador).

Deep links conservados: `taxation`, `taxation/tax-simulator`, aliases `offers` / `summary`.

---

## Verificación

- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial apps/portal/src/components/shared/portal-ui.tsx --json` → 0 deterministas. 1 heurístico P2 preexistente en chips (descartado).
- `pnpm --filter @iwana/portal exec jest src/components/commercial src/components/shared/portal-module-subnav.spec.tsx` → 17 suites / 126 tests PASS.
- `pnpm --filter @iwana/portal exec jest src/components/shared/portal-ui.spec.tsx` → 40 tests PASS.
- Typecheck portal: limpio.
- Lint de archivos nuevos/tocados del rail: 0 errores. 5 warnings `exhaustive-deps` preexistentes en managers de catálogo/ofertas.

E2E actualizados (roles `tab` → `button` + `aria-current`): `portal-commercial-alerts-gate`, `portal-commercial-catalog-products-services`, `portal-tax-simulator`.

---

## Residual / fuera de alcance

- Sandwich panel + tabla (`shadow-sm` en shell de tabla): toca Inventario y el resto del portal.
- Inventario sigue en tabs navy (`portalModuleTabs*`); no se migra en esta entrega.
- Selector de municipio por nombre: exige contrato API.
- Edición comercial solo `ADMIN` (alcance de producto).
- Teclado roving de `@iwana/ui` `Tabs`: ya no es el menú de Comercial.

---

## Veredicto

**GO** — el módulo Comercial se reconoce como iWana en la subnavegación (barra lima, no fill navy), Tributación deja de estar escondida y el copy de nav coincide con la tarea. Los listados no se rediseñaron.
