# INFORME — Comercial UI: menú horizontal lima

**Versión:** 2.1
**Fecha:** 2026-08-19
**Estado:** **GO**
**Módulo:** MOD06 — Comercial
**Modo:** Implementación de reorientación (spec v1.1) sobre la entrega v2.0
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v2.0.md](./INFORME-COMMERCIAL-UI-ALIGNMENT-v2.0.md)
**Spec:** [2026-08-19-comercial-module-subnav-ux.md](../specs/2026-08-19-comercial-module-subnav-ux.md) v1.1

---

## Resumen ejecutivo

La entrega v2.0 sustituyó tabs navy por `PortalModuleSubnav` con rail vertical lima. El rail se rechazó en producto. Esta entrega reorienta la misma primitive: barra horizontal agrupada encima del listado en `lg+`, subrayado lima inferior (firma #1), Dialog agrupado en columna bajo `lg`.

No cambian la IA de 10 destinos, el copy canónico, las URLs `?tab=` ni Inventario (sigue en tabs navy).

| Métrica | v2.0 (rail) | v2.1 (horizontal) |
| --- | --- | --- |
| Chrome `lg+` | Columna 14 rem + contenido | Nav encima, una fila |
| Activo desktop | Barra izquierda `w-1` | Subrayado `h-0.5` inferior |
| Móvil `<lg` | Selector + Dialog columna | Sin cambio |
| Fill navy | Prohibido | Prohibido |

---

## Contrato implementado

Primitive `PortalModuleSubnav` en [portal-ui.tsx](../../apps/portal/src/components/shared/portal-ui.tsx):

- Shell desktop: `flex flex-row`, `overflow-x-auto`, `rounded-2xl`, `shadow-iwana-soft`, sticky `lg:top-(--portal-sticky-offset)`.
- Grupos en fila; divisor `w-px self-stretch bg-gray-200`.
- Activo `lg+`: `bg-iwana-surface-soft` + `absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-iwana-secondary`.
- Dialog: lista `orientation="vertical"` con barra izquierda (escaneo táctil).
- Layout [CommercialTabLayout.tsx](../../apps/portal/src/components/commercial/CommercialTabLayout.tsx): apilado `space-y-6`; sin `lg:grid` de dos columnas.

Prohibido: fill `bg-iwana-primary` (contrato de tabs de Inventario).

---

## Verificación

- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial apps/portal/src/components/shared/portal-ui.tsx --json` → 0 deterministas. 1 heurístico P2 preexistente en chips (`bg-iwana-secondary-50` en `portalFilterChipClassName`): acento de chip, no fondo de panel; descartado.
- `pnpm --filter @iwana/portal exec jest src/components/commercial src/components/shared/portal-module-subnav.spec.tsx` → 17 suites / 127 tests PASS.
- Typecheck portal: limpio.

---

## Residual / fuera de alcance

- Sandwich panel + tabla (`shadow-sm` en shell de tabla): toca Inventario y el resto del portal.
- Inventario sigue en tabs navy (`portalModuleTabs*`); no se migra.
- Selector de municipio por nombre: exige contrato API.
- Edición comercial solo `ADMIN` (alcance de producto).

---

## Veredicto

**GO** — Comercial deja el rail y ancla «estoy aquí» con subrayado lima en una barra de módulo, sin copiar el fill navy de Inventario.
