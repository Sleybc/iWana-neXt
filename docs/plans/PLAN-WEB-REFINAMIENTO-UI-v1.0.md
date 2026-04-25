# PLAN — Refinamiento UI apps/web

**Tipo:** PLAN  
**Módulo:** apps/web (plataforma administrativa)  
**Versión:** 1.0  
**Estado:** Borrador  
**Fecha:** 2026-04-25  
**Refs:** Manual de Implementación Identidad iWana, apps/portal (referencia de diseño), AGENTS.md

---

## Contexto

`apps/web` es la consola de plataforma (`SYSTEM_ADMIN`, `IWANA_SUPPORT`). Existe una brecha de calidad visual y técnica con `apps/portal`, que está más avanzado. Este plan cierra esa brecha alineando `apps/web` al manual de identidad corporativa y a los patrones establecidos en el portal.

---

## Análisis de brechas

### Brechas críticas (riesgo técnico)

| ID | Problema | Archivo web | Referencia portal |
|----|----------|-------------|-------------------|
| B-01 | `useSearchParams()` sin `Suspense` en `TopHeader` → bloquea prerenderizado estático en Next.js 15 | `components/layout/TopHeader.tsx` | Portal extrajo `SearchBar` interno con Suspense |
| B-02 | Tipografía `Exo 2` no se aplica al `<body>` — falta `next/font/google` en layout raíz | `app/layout.tsx` | Portal usa `Exo_2({ ... })` + `body className={exo2.className}` |
| B-03 | Sin favicon en metadata del layout raíz | `app/layout.tsx` | Portal: `icons: { icon: '/brand/iwiso6.png' }` |

### Brechas de calidad UI (coherencia visual)

| ID | Problema | Archivo web | Referencia portal |
|----|----------|-------------|-------------------|
| B-04 | Sidebar usa SVG inline (Heroicons) en vez de `lucide-react` | `components/layout/Sidebar.tsx` | Portal usa `lucide-react` exclusivamente |
| B-05 | `NavItems` del sidebar no wrappea `usePathname` en `Suspense` | `components/layout/Sidebar.tsx` | Portal: componente `NavItems` separado + `<Suspense>` |
| B-06 | `DropdownUser` no tiene `roleToLabel` para usuarios de plataforma | `components/layout/DropdownUser.tsx` | Portal: mapea roles a labels de negocio |
| B-07 | Input de búsqueda en `TopHeader` sin estilos mejorados ni shadow tokens | `components/layout/TopHeader.tsx` | Portal: input con `rounded-2xl`, `shadow-[var(--shadow-iwana-card)]`, kbd hint `⌘K` |
| B-08 | `MetricCard` tiene lógica de color hardcodeada (switch sobre strings) | `components/dashboard/MetricCard.tsx` | Portal: API limpia con `icon: LucideIcon`, sin hardcodes |
| B-09 | `LoginBrandPanel` usa URL externa de Google (`lh3.googleusercontent.com`) | `components/auth/LoginBrandPanel.tsx` | Mismo problema en portal — ambos deben usar asset local |
| B-10 | Sin `web-typography.css` — no refuerza herencia tipográfica ni fuente mono | `app/layout.tsx` | Portal: `portal-typography.css` importado en layout |

### Brechas de activos (brand assets)

| ID | Problema |
|----|----------|
| B-11 | `apps/web/public/` vacío — sin logo iWana, sin favicon, sin isotipo |

---

## Plan de implementación

### FASE 1 — Correcciones técnicas críticas (B-01, B-02, B-03, B-11)

**Objetivo:** Eliminar riesgos de compilación/runtime y añadir identidad base.

#### Tarea 1.1 — Copiar brand assets al public de web
```
apps/web/public/brand/
  iwiso6.png      (copiar desde portal/public/brand/)
  favicon-gecko.svg
```

#### Tarea 1.2 — Actualizar `app/layout.tsx`
Cambios requeridos:
- Importar `Exo_2` y `JetBrains_Mono` desde `next/font/google`
- Aplicar `exo2.className` + `jetbrainsMono.variable` al `<body>`
- Añadir `icons` en `metadata` con `/brand/iwiso6.png`
- Importar `web-typography.css` local (crear en tarea 1.3)
- Añadir `Suspense` wrapper alrededor de `AuthProvider`

#### Tarea 1.3 — Crear `app/web-typography.css`
Mismo patrón que `portal-typography.css`: refuerza herencia de fuente y aplica JetBrains Mono a elementos `code/pre`.

#### Tarea 1.4 — Extraer `SearchBar` en `TopHeader.tsx` con `Suspense`
Mover toda la lógica de `useSearchParams` a un componente `SearchBar` interno y envolverlo en `<Suspense>`. Mismo patrón que el portal.

---

### FASE 2 — Coherencia del Sidebar (B-04, B-05)

**Objetivo:** Migrar iconos inline a `lucide-react` y añadir Suspense en NavItems.

#### Tarea 2.1 — Reemplazar SVG inline por lucide-react en `Sidebar.tsx`
Mapeo de iconos:
- `IconHome` → `LayoutDashboard` (lucide)
- `IconBuilding` → `Building2` (lucide)
- `IconUsers` → `Users` (lucide)
- `IconClipboard` → `ClipboardList` (lucide)
- `IconCog` → `Settings` (lucide)

#### Tarea 2.2 — Extraer `NavItems` en componente separado con `Suspense`
Aislar toda lógica que usa `usePathname()` en un sub-componente `NavItems`, y envolverlo en `<Suspense fallback={<NavItemsSkeleton />}` en el árbol del Sidebar.

---

### FASE 3 — Mejoras de componentes UI (B-06, B-07, B-08)

**Objetivo:** Elevar la calidad de componentes al nivel del portal.

#### Tarea 3.1 — `DropdownUser.tsx`: añadir `roleToLabel` para plataforma
Crear función que mapee roles de plataforma:
```typescript
function platformRoleToLabel(role: string): string {
  const labels: Record<string, string> = {
    SYSTEM_ADMIN: 'Administrador de plataforma',
    IWANA_SUPPORT: 'Soporte iWana',
  };
  return labels[role] ?? role;
}
```
Usar el label en el `subtitle` del dropdown.

#### Tarea 3.2 — `TopHeader.tsx`: mejorar input de búsqueda
Aplicar clases del portal al input:
- `rounded-2xl` en vez de rounded básico
- `shadow-[var(--shadow-iwana-card)]`
- Badge `⌘K` a la derecha del input
- Placeholder actualizado: `"Buscar en la plataforma..."`

#### Tarea 3.3 — `MetricCard.tsx`: simplificar API
Migrar a la API limpia del portal:
- `icon: LucideIcon` en vez de `iconBg + iconColor` strings
- Eliminar `resolveIconTone` con switch hardcodeado
- Mantener `trend` badge (valor agregado que no tiene el portal)
- Actualizar `DashboardClient.tsx` para pasar iconos Lucide

---

### FASE 4 — LoginBrandPanel local assets (B-09)

**Objetivo:** Eliminar dependencia de imagen externa.

#### Tarea 4.1 — Reemplazar URL externa por asset local
Opciones:
1. Usar CSS `iwana-gradient` del design system como background (recomendado — no requiere imagen)
2. Usar imagen local en `public/brand/`

La opción 1 es preferida: fondo con `iwana-gradient` + isotipo SVG local. Elimina dependencia de red en el panel de login.

---

## Orden de ejecución recomendado

```
Fase 1 (crítico) → Fase 2 → Fase 3 → Fase 4
```

Las fases 1 y 2 son independientes entre sí y pueden ejecutarse en paralelo por componente.

---

## Criterios de aceptación globales

- [ ] `pnpm typecheck` pasa sin errores en `apps/web`
- [ ] `pnpm lint` pasa sin warnings nuevos
- [ ] Tipografía Exo 2 visible en todos los textos del dashboard
- [ ] Favicon del isotipo iWana visible en tab del browser
- [ ] Sin URLs externas hardcodeadas en componentes (solo Google Fonts via next/font)
- [ ] Sidebar usa iconos `lucide-react` exclusivamente
- [ ] `TopHeader` sin errores de Suspense en producción
- [ ] `DropdownUser` muestra rol mapeado en español

---

## Impacto estimado

| Fase | Archivos tocados | Riesgo |
|------|-----------------|--------|
| Fase 1 | 3 archivos + 2 nuevos | Bajo |
| Fase 2 | 1 archivo | Bajo |
| Fase 3 | 3 archivos | Bajo |
| Fase 4 | 1 archivo | Bajo |

Sin cambios de routing, contratos API ni base de datos. Sin ADR requerido.
