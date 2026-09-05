# PROMPT DE EJECUCIÓN — MOD12 Fase 2A · Reagrupación del subnav de Inventario

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — subnavegación del portal
- **Código:** MOD12 (`/dashboard/inventory`)
- **Fase:** 2A — reagrupación de la subnavegación por eje de responsabilidad
- **Destinatarios:** **AI-PROD-UX** + **AI-DS-OWNER** (spec) → **AI-FE-PLATFORM** (implementación)
- **Carril:** rápido de UI (ADR-049 / protocolo §3bis.3). AI-EM-ARCH **no interviene** mientras se respeten los contratos congelados de §4.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** aliviar la saturación de 11 destinos del subnav de Inventario reagrupándolos
**por eje de responsabilidad** en lugar de por momento, sin mover nada de módulo ni de ruta.

**Lo que sí entra:**
- Spec `docs/specs/2026-08-19-inventario-module-subnav-ux.md` v1.2 (Congelada) → **v1.3** con el árbol de cinco grupos de §3.
- Implementación de la agrupación en `apps/portal/src/components/inventory/inventory-nav.ts`.
- Extensión de `filterInventoryNavGroups` a **gate por grupo** (hoy filtra un ítem suelto).
- Si el árbol lo exige, extensión **aditiva** de `PortalModuleSubnav` en `apps/portal/src/components/shared/portal-ui.tsx`.
- `docs/informes/INFORME-INVENTORY-MODULE-SUBNAV-v1.1.md` con antes/después.

**Lo que no entra:**
- Mover destinos a otro módulo o a `/dashboard/settings` (decidido: ADR-084 v1.1).
- Cambiar rutas, ids de `?tab`, deep-links (`custody`, `commercialRef`, `serializedAssetId`) ni el aterrizaje en `overview`.
- Activar el alias federado (Fase 2B — requiere la validación UX de Fase 3).
- Tocar backend, modelo de datos, permisos nuevos o el registry de Settings.
- Rediseñar los workspaces internos ni las subtabs de recurso.

---

## 2. Artefactos de entrada obligatorios

- **PRD:** `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (interna 1.1, En revisión)
- **HLD:** `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md` (interna 1.1, En revisión)
- **ADRs aplicables:**
  - `ADR-084` v1.1 (**Aprobado**) — D5 autoriza esta reagrupación **sin evidencia previa**; D3 fija el gate por grupo
  - `ADR-040` (**Aprobado**) — Configuración centraliza experiencia, no ownership
  - `ADR-083` (**Aprobado**) — navegación derivada de permisos efectivos; sin permisos granulares nuevos
  - `ADR-049` (**Aprobado**) — carril rápido de UI, delegado en DS-OWNER
  - `ADR-056` (**Aprobado**) — Estrella Polar en sus tres dominios
- **Specs:** `2026-08-19-inventario-module-subnav-ux.md` v1.2 (Congelada) · `2026-08-19-comercial-module-subnav-ux.md` v1.1 (receta antecesora) · `2026-08-28-mod00-convergencia-nav-gates-ux.md` v1.2 (gramática de gates: ocultar lo no efectivo)
- **Plan:** `docs/plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md` v1.2, §Fase 2A
- **Artefactos faltantes detectados:** ninguno bloqueante.

---

## 3. Definición funcional de entrada (AI-EM-ARCH) — el qué, no el cómo

Árbol objetivo. Los 11 destinos se conservan; ninguno cambia de `?tab`:

```text
Vista general                    ← aterrizaje (?tab omitido)
Maestros          Catálogo · Bodegas
Operación         Existencias · Salidas · Conteos
Abastecimiento    Compras · Proveedores      ← gate INVENTORY_PURCHASING_READ (grupo completo)
Seguimiento       Activos · Movimientos · Bajas
```

**Razón de diseño que debe preservarse:** la agrupación queda **alineada con la frontera de
permisos**. `Compras` y `Proveedores` comparten backend (`purchasing.controller.ts`) y permiso
(`INVENTORY_PURCHASING_*`); hoy el filtro oculta solo `purchasing` y deja `suppliers` visible, que
es un defecto vivo (403). Con «Abastecimiento» como grupo, el gate se aplica al grupo completo y la
incoherencia desaparece por construcción.

El **diseño detallado** —divider, eyebrow, jerarquía tipográfica, comportamiento `<lg`, tokens,
orden interno de cada grupo— es de PROD-UX y DS-OWNER. Esta definición no lo prescribe.

---

## 4. Restricciones no negociables

1. **`PortalModuleSubnav` es contrato compartido** con Comercial (`commercial-nav.ts`) y Reglas
   (`settings/rules/rules-settings-nav.ts`). Toda extensión es **aditiva** y no puede romperlos.
2. **Contrato visual de la spec v1.2 intacto:** activo = `bg-iwana-surface-soft` + barra
   `h-0.5 bg-iwana-secondary` + icono `text-iwana-secondary-700`; sticky `lg:top-(--portal-sticky-offset)`;
   ítems `min-h-11`; `<lg` = trigger `Sección: {label}` + Dialog en columna.
3. **Semántica de gate fail-open del Sidebar:** el grupo se oculta **solo** con permisos efectivos
   resueltos (`status === 'ready'`, set no vacío, rol no-ADMIN, sin la llave). En loading, degradado
   o tripwire permanece visible. La barrera real es el backend (`PermissionsGuard`).
4. **Sin permisos nuevos.** Prohibido crear `INVENTORY_CATALOG_READ` / `SUPPLIERS_READ` /
   `LOCATIONS_READ` (ADR-084 Regla 2, ADR-083).
5. **Navegación, no tabs de recurso:** `<nav>` + `aria-current`; las subtabs internas de Catálogo,
   Existencias y Activos no se tocan.
6. Sin cambios de backend, de modelo de datos ni del registry de Settings.
7. `INVENTORY_FEDERATED_NAV_GROUPS` y el wrapper federado permanecen **dormant**; si la reagrupación
   los afecta, mantener su coherencia sin activarlos.

**Contratos congelados (protocolo §3bis):** spec de subnav **v1.3** una vez emitida · API de
`PortalModuleSubnav` (`portal-ui.tsx` ~1975-2197) · `packages/shared/src/enums/access-control/*` ·
contrato de metadata de `settings-registry.service.ts`.

---

## 5. Entregables técnicos

- `apps/portal/src/components/inventory/inventory-nav.ts` — grupos y gate por grupo.
- `apps/portal/src/components/shared/portal-ui.tsx` — solo si la spec v1.3 lo exige; extensión aditiva.
- Tests: `inventory-nav.spec.ts`, `InventoryClient.spec.tsx`, `portal-module-subnav.spec.tsx`.
- Sin migraciones, sin cambios de OpenAPI.

## 6. Entregables documentales

- `docs/specs/2026-08-19-inventario-module-subnav-ux.md` **v1.3** (PROD-UX + DS-OWNER).
- `docs/informes/INFORME-INVENTORY-MODULE-SUBNAV-v1.1.md` — antes/después, decisiones de diseño, evidencia de gates.
- Delta en sitio de HLD-MOD12 **solo si** cambia algo aprobado (convención: versión interna, no archivo nuevo).

---

## 7. Criterios de aceptación

- **CA-2A-01:** el subnav presenta cinco agrupaciones; los 11 destinos siguen presentes y ninguno cambia de `?tab` ni de ruta.
- **CA-2A-02:** `/dashboard/inventory` sin `?tab` sigue aterrizando en Vista general; `?tab=summary` legacy sigue resolviendo a `overview`.
- **CA-2A-03:** sin `inventory.purchasing.read` efectivo, el grupo **Abastecimiento** se oculta **completo** (Compras y Proveedores). Con permisos no resueltos, degradados o tripwire, permanece visible.
- **CA-2A-04:** deep-links intactos — `?tab=catalog&commercialRefId=…`, `?tab=locations&custody=mobile`, `?tab=locations&action=create`, `serializedAssetId`.
- **CA-2A-05:** Comercial y Reglas, que comparten `PortalModuleSubnav`, no presentan regresión visual ni funcional.
- **CA-2A-06:** contrato visual de la spec v1.2 preservado (activo lima, sticky, `min-h-11`, dialog `<lg`).
- **CA-2A-07:** `audit-ui.mjs` sobre los archivos tocados → **P0 = 0, P1 = 0**.
- **CA-2A-08:** el registry de Settings sigue en `COMING_SOON` — esta fase no activa la federación.

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**
- La agrupación exige un cambio **no aditivo** de `PortalModuleSubnav` que rompa Comercial o Reglas.
- El gate por grupo obligara a crear permisos nuevos o a modificar el backend.
- Aparece necesidad de cambiar un id de `?tab`, una ruta o el ownership de un destino.
- DS-OWNER concluye que el árbol de cinco grupos degrada la usabilidad frente al de dos.

**Documentar causa en:** `docs/informes/INFORME-INVENTORY-MODULE-SUBNAV-v1.1.md` §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión (protocolo §3).
**Recomendación esperada:** opción alternativa de agrupación que respete los contratos congelados, o
justificación de conservar el árbol de dos grupos con otro mecanismo de alivio.

## 9. Criterio de salida de la fase

- **Frontend validado:** `pnpm --filter @iwana/portal test src/components/inventory/inventory-nav.spec.ts src/components/inventory/InventoryClient.spec.tsx src/components/shared/portal-module-subnav.spec.tsx` en verde, **con `Cached: 0`**.
- **Sin regresión cruzada:** suites de Comercial y Reglas en verde.
- **E2E:** `pnpm exec playwright test e2e/tests/portal-inventory-scm.spec.ts` en verde (deep-links).
- **Calidad:** `pnpm --filter @iwana/portal typecheck && pnpm lint` en verde; `audit-ui.mjs` P0/P1 = 0.
- **Backend:** sin cambios — verificar con `git diff --stat apps/api` vacío.
- **Documentación archivada:** spec v1.3 e informe v1.1 en el repo.

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** sin impacto — cambio de presentación en el cliente.
- **Seguridad:** **mejora** — el gate por grupo cierra la incoherencia que hoy expone Proveedores a un 403. Sin permisos nuevos; PoLP preservado.
- **Escala:** sin impacto — sin consultas, endpoints ni modelo tocados.
- **Regulación:** sin impacto.
