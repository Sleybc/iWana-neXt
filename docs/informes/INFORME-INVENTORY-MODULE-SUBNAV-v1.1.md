# INFORME — Inventario: reagrupación del subnav por eje de responsabilidad (Fase 2A)

**Versión:** 1.1 (de este informe; el antecesor v1.0 cerró dashboard primero + menú lima)
**Fecha:** 2026-09-02
**Estado:** **GO** (con residuales registrados §7)
**Módulo:** MOD12 — Inventario
**Spec:** [2026-08-19-inventario-module-subnav-ux.md](../specs/2026-08-19-inventario-module-subnav-ux.md) **v1.3** (Congelada)
**Plan:** [2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md](../plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md) §Fase 2A (+2A-bis absorbida)
**Prompt de fase:** [PROMPT-MOD12-FASE-2A-REAGRUPACION-SUBNAV-v1.0.md](../prompts/PROMPT-MOD12-FASE-2A-REAGRUPACION-SUBNAV-v1.0.md)
**Ejecución:** protocolo multiagente — AI-EM-ARCH (orquestador) + AI-PROD-UX (spec) + AI-DS-OWNER (validación) + AI-FE-PLATFORM (implementación) + AI-SEC-ENG (review seguridad) + AI-SR-QA (spec compliance)

---

## 1. Resumen ejecutivo

Los 11 destinos del subnav de Inventario se reagrupan **por eje de responsabilidad** en 5 grupos,
sin mover módulo, rutas ni `?tab`. El gate de la pestaña Compras pasa a **gate por grupo**
(«Abastecimiento» = Compras + Proveedores), cerrando por construcción el defecto D-3 de
ADR-084 v1.1 (rol solo-stock veía Proveedores y recibía 403). Deep-links a pestañas ocultas
muestran un **estado restringido inline** según la gramática de gates de MOD00, sin redirección.

```text
Antes (v1.2)                         Después (v1.3)
Operación (8 ítems)                  Vista general            ← sin eyebrow, anclada (hideLabel)
  overview…counts                    Maestros                 Catálogo · Bodegas
Seguimiento (3 ítems)                Operación                Existencias · Salidas · Conteos
  Compras visible sin permiso ✗      Abastecimiento           Compras · Proveedores  ← gate de grupo
  (403 vivo en Proveedores)          Seguimiento              Activos · Movimientos · Bajas
```

## 2. Contrato implementado

- **`PortalModuleSubnav` (extensión aditiva):** nueva prop `hideLabel?: boolean` en
  `PortalModuleSubnavGroup`. Con la prop: sin eyebrow, `ul` con `aria-label={label}` (sin
  `aria-labelledby` colgante), wrapper con la utilidad `.portal-subnav-group-sans-label`.
  Sin la prop: byte-idéntico (Comercial y Reglas no cambian — verificado).
- **Fuente de tokens:** `.portal-subnav-group-sans-label { padding-top: 19px }` en
  `packages/ui/src/styles/globals.css` junto a `.portal-eyebrow`, con comentario de acoplamiento
  (19 px = eyebrow 15 px + gap 4 px; cálculo y verificación de DS-OWNER).
- **`inventory-nav.ts`:** 5 grupos (`overview`/`masters`/`operation`/`supply`/`traceability`),
  11 destinos, mismos ids, iconos intactos. `filterInventoryNavGroups(canReadPurchasing)` excluye
  el grupo `supply` completo; `overview` jamás se filtra; fail-open del Sidebar preservado
  (visible en loading/degraded/tripwire/federado/ADMIN).
- **Estado restringido inline (`InventoryClient.tsx`):** para tab base `purchasing|suppliers` con
  permisos resueltos, set no vacío, no-ADMIN y sin `inventory.purchasing.read`: no se monta el
  workspace (ni en DOM oculto), se renderiza shell `restrictedShellClassName` (exportada desde
  `PagePermissionGate.tsx`, sin duplicar), Badge warning + Lock, `h2` con el copy congelado y botón
  «Volver a Vista general» que retira solo `tab` conservando el resto del query. URL conservada,
  sin redirección; cubre sufijos (`?tab=purchasing/…`).
- **Federado dormant intacto:** `INVENTORY_FEDERATED_TABS`, `INVENTORY_FEDERATED_NAV_GROUPS`,
  `INVENTORY_FEDERATED_EYEBROW` y el wrapper `settings/inventory/page.tsx` sin cambios. Registry
  de Settings sigue `COMING_SOON` (CA-2A-08).

## 3. Verificación (gates de salida, ejecutados por el orquestador)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal test inventory-nav.spec.ts InventoryClient.spec.tsx portal-module-subnav.spec.tsx --runInBand` | **3 suites, 57 passed / 1 skipped** (skip `it.skip` preexistente), 0 failed |
| Suites Comercial + Reglas (`PortalModuleSubnav` compartido) | **22 suites, 171 passed**, 0 failed (CA-2A-05) |
| Suites `access-control` (gate + contexto de permisos) | **2 suites, 14 passed** |
| `pnpm --filter @iwana/portal typecheck` | Limpio |
| `pnpm --filter @iwana/portal lint` | 0 errores; **0 hallazgos** en los archivos de la fase (45 warnings preexistentes de trabajo paralelo, en archivos no tocados) |
| `audit-ui.mjs` sobre los 4 archivos tocados | **P0 = 0, P1 = 0** (1 P2 heurístico preexistente en `portal-ui.tsx:428`, fuera de los hunks de la fase) |
| Backend sin cambios de la fase | `git diff --name-only apps/api` = solo archivos preexistentes de fases ajenas; **`purchasing.controller.ts` sin modificar**; catálogo de permisos `access-permission-key.enum.ts` intacto (CA-2Ab-06/07) |
| E2E deep-links (`portal-inventory-scm.spec.ts`, config portal) | **Deep-links en verde** (`tab=stock`, `tab=locations`); suite completa: 30 passed / 11 failed — fallos atribuidos a trabajo paralelo en vuelo (§7) |

## 4. Review multiagente

- **AI-DS-OWNER — REQUEST_CHANGES resuelto:** 3 precisiones incorporadas a la spec v1.3 antes de
  implementar (divisor del grupo anclado —no lleva separator por índice 0—; compensación 19 px
  fijada como utilidad en fuente de tokens; contrato visual completo del estado inline reusando
  `restrictedShellClassName`, título `h2` y badge del patrón del gate). Contraste WCAG 2.2 AA
  verificado sobre tokens vigentes en claro y oscuro.
- **AI-SEC-ENG — APROBADO, sin P0/P1/P2:** el gate es exclusivamente presentación
  (`purchasing.controller.ts` conserva `JwtAuthGuard + RolesGuard + PermissionsGuard` con
  `INVENTORY_PURCHASING_READ` en GET y `_MANAGE` en escritura); el estado restringido no monta el
  workspace ni dispara fetch de purchasing/suppliers antes del gate; sin permisos nuevos; fail-open
  conforme a la gramática de convergencia nav-gates §1.5, cubierto por tests en loading/degraded/
  tripwire. Copy sin claves crudas ni códigos HTTP.
- **AI-SR-QA — COMPLIANT:** checklist de spec v1.3 (§3.2 CAs 7-16) + CA-2A-01..08 + CA-2Ab-01..05/07
  verificado con evidencia archivo:línea; sin over-building; tests existentes no debilitados.

## 5. Hallazgos y tratamiento

| ID | Severidad | Descripción | Estado |
| --- | --- | --- | --- |
| SEC-P3-01 | P3 | El deep-link gated a `?tab=purchasing` disparaba `loadCatalogOptions()` (request descartado; sin fuga — endpoint protegido por `inventory.stock.read`) | **Corregido**: efecto condicionado a `!showTabRestrictedGate` |
| QA-P3-02 | P3 | Sin test de deep-links con sufijo en estado restringido | **Corregido**: `it.each(['purchasing/nueva-ot','suppliers/x'])` |
| QA-P3-03 | P3 | Sin test de fail-open con deep-link activo | **Corregido**: `?tab=suppliers` + loading → workspace visible, sin estado restringido |

## 6. Decisiones de diseño (congeladas en spec v1.3)

1. «Vista general» = grupo anclado primero con `hideLabel: true` (única extensión de la primitive;
   el resto de opciones duplicaban el rótulo o introducían un segundo modelo de ítems).
2. Gate **por grupo** alineado a la frontera de permisos: Compras y Proveedores comparten backend y
   llave; el grupo completo desaparece sin permiso efectivo — D-3 imposible por construcción.
3. Deep-link a pestaña oculta → estado restringido inline (no redirige: la gramática de gates exige
   conservar URL para que el usuario reporte el enlace a su administrador).
4. `<lg` sin cambios estructurales: Dialog en columna con 5 grupos; scroll interno estándar.
5. Orden interno = el del árbol funcional (sin afinaciones adicionales).
6. Federado conserva su eyebrow «Maestros» mientras duerme; re-evaluación diferida a Fase 2B/3.

## 7. Residual / pendientes

1. **E2E transversal:** `portal-inventory-scm.spec.ts` completo → 30 passed / **11 failed**. Los
   fallos están en flujos transaccionales (composer de Salidas «Con material», compra full-flow,
   reservas 03B) cuyo código **no fue tocado por esta fase** (`StockIssueSourceTabs.tsx` y el
   composer sin diff vs HEAD) y sí por trabajo paralelo en vuelo del tree (rework del dialog de
   nuevo producto, custodia ejecutor backend, reservas). Los E2E de navegación, deep-links, slices,
   bodegas, conteos y proveedores pasan. **Acción:** re-validar la suite cuando el trabajo paralelo
   aterrice; no bloquea esta fase.
2. **Fase 3 (gate habilitante de 2B):** validación UX moderada con 5 operadores + 3 admins sobre el
   subnav reagrupado — requiere participantes humanos; fuera del alcance de esta sesión.
3. **Fase 2B:** activación del alias federado (registry `AVAILABLE`) solo tras Fase 3; al activar,
   el wrapper debe aplicar el gate por grupo (Proveedores exige `inventory.purchasing.read` dentro
   del alias) — ya registrado en el plan.
4. Nota operativa: el disparador de `loadCatalogOptions` en `loading`→`ready` re-evalúa con la
   dependencia añadida (mejora frente a no depender del gate).

## 8. Veredicto

**GO** — La reagrupación alinea la navegación con la frontera de permisos, alivia la saturación de
11 destinos y corrige el defecto RBAC de Proveedores sin tocar backend ni contratos. Contrato
visual v1.2 intacto; extensión de la primitive aditiva y verificada contra Comercial y Reglas.
