# INFORME — Sistema de botones iWana neXt · Fases 01-02

**Tipo:** INFORME  
**Módulo:** TRANSVERSAL — Sistema visual `@iwana/ui`  
**Fase:** 01-02 — Estandarización de botones y migración priorizada web/portal  
**Versión:** 1.1  
**Estado:** En revisión  
**Fecha:** 2026-05-04  
**Modo activo:** Mixto  
**Agente responsable:** GitHub Copilot

---

## 1. Resumen ejecutivo

Se ejecutaron dos fases consecutivas del sistema de botones con enfoque incremental y sin alterar flujos funcionales, API, RBAC, tenancy ni stack.

- **Fase 01:** consolidación de la primitive `Button` y migración priorizada en `apps/portal`.
- **Fase 02:** migración estricta de tres superficies equivalentes en `apps/web` y cierre de evidencia visual pendiente.

El resultado deja una gramática más consistente para CTAs, acciones repetidas, icon buttons y acciones destructivas de riesgo controlado tanto en portal como en consola web.

## 2. Artefactos de soporte

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Spec visual de fase 01 | [SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../specs/SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md) | En revisión |
| Plan de fase 01 | [PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../plans/PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md) | En revisión |
| Prompt de ejecución | [PROMPT-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../prompts/PROMPT-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md) | Ejecutado |
| Design doc operativo Fase 01 | [2026-05-04-sistema-botones-fase-01-design.md](../specs/2026-05-04-sistema-botones-fase-01-design.md) | Aprobado para ejecución |
| Design doc operativo Fase 02 | [2026-05-04-sistema-botones-fase-02-web-design.md](../specs/2026-05-04-sistema-botones-fase-02-web-design.md) | Aprobado para ejecución |

## 3. Cambios implementados

### 3.1 Primitive compartida

`packages/ui/src/components/Button.tsx` se ajustó para soportar la dirección **Command Pill + Utility Icon**:

- `primary`, `secondary`, `ghost` y `destructive` expresan mejor el lenguaje pill.
- `size="icon"` ganó affordance explícita para acciones icon-only.
- Se agregó `variant="softDestructive"` para acciones destructivas secundarias.
- Se reforzó foco visible, `ring-offset` y consistencia light/dark.

### 3.2 Fase 01 — Portal

#### `TaxCatalogManager.tsx`

- `Actualizar catálogo` migra a icon button con nombre accesible.
- `Nueva definición` mantiene CTA visible con gramática de comando.
- `Editar` y `Eliminar` pasan a icon buttons gobernados.

#### `PlanCatalogManager.tsx`

- `Nuevo plan` se alinea al CTA pill con icono.
- `Editar` por fila migra a icon button secondary compacto.

#### `AdditionalProductsManager.tsx`

- `Agregar producto` se alinea al CTA pill con icono.
- `Limpiar filtros` deja de ser botón manual.
- `Editar` y `Eliminar` por fila migran a icon buttons con `aria-label`.

#### `UsersTable.tsx`

- `Limpiar filtros` migra a `Button`.
- `Editar`, `Reiniciar contraseña` y `Eliminar` migran a icon buttons accesibles.
- `Cargar más` migra a `Button` y conserva estado de carga.

### 3.3 Fase 02 — Web admin

#### `TenantsTable.tsx`

- Se refuerza el affordance del trigger icon-only de acciones por fila.
- El CTA manual `Reintentar` en estado de error migra a `Button variant="link"`.
- Se mantiene el patrón dropdown existente sin introducir primitive nueva.

#### `UserManagementModal.tsx`

- La acción `Eliminar usuario` conserva semántica destructiva.
- Su peso visual baja de `lg` a `default` para no competir con `Guardar cambios`.

#### `TenantBrandingForm.tsx`

- `Eliminar imagen` deja de usar rojo manual.
- La acción migra a `Button variant="softDestructive" size="sm"` dentro del flujo de branding.

## 4. Archivos tocados

| Tipo | Archivo |
| --- | --- |
| Primitive | `packages/ui/src/components/Button.tsx` |
| Portal Comercial | `apps/portal/src/components/commercial/TaxCatalogManager.tsx` |
| Portal Comercial | `apps/portal/src/components/settings/PlanCatalogManager.tsx` |
| Portal Comercial | `apps/portal/src/components/settings/AdditionalProductsManager.tsx` |
| Portal Usuarios | `apps/portal/src/components/users/UsersTable.tsx` |
| Web Dashboard | `apps/web/src/components/dashboard/TenantsTable.tsx` |
| Web Usuarios | `apps/web/src/components/users/UserManagementModal.tsx` |
| Web Tenants | `apps/web/src/components/tenants/TenantBrandingForm.tsx` |
| Tests Portal | `apps/portal/src/components/settings/AdditionalProductsManager.spec.tsx` |
| Tests Portal | `apps/portal/src/components/users/UsersTable.spec.tsx` |
| Tests Web | `apps/web/src/components/dashboard/TenantsTable.spec.tsx` |
| Tests Web | `apps/web/src/components/users/UserManagementModal.spec.tsx` |
| Tests Web | `apps/web/src/components/tenants/TenantBrandingForm.spec.tsx` |
| Informe vivo | `docs/informes/INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md` |

## 5. Validación ejecutada

| Área | Comando | Resultado |
| --- | --- | --- |
| UI | `pnpm --filter @iwana/ui typecheck` | OK |
| UI | `pnpm --filter @iwana/ui lint` | OK |
| Portal | `pnpm --filter @iwana/portal typecheck` | OK |
| Portal | `pnpm --filter @iwana/portal lint` | OK |
| Portal | `pnpm --filter @iwana/portal test -- TaxCatalogManager.spec.tsx PlanCatalogManager.spec.tsx AdditionalProductsManager.spec.tsx UsersTable.spec.tsx` | OK — 4 suites, 6 tests |
| Web | `pnpm --filter @iwana/web typecheck` | OK |
| Web | `pnpm --filter @iwana/web lint` | OK |
| Web | `pnpm --filter @iwana/web test -- TenantsTable.spec.tsx UserManagementModal.spec.tsx TenantBrandingForm.spec.tsx` | OK — 3 suites, 11 tests |
| Evidencia web | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm exec playwright test e2e/tests/web-button-evidence.temp.spec.ts --config e2e/playwright.web.config.ts` | OK — 2 capturas desktop/mobile con mocks locales |

## 6. Evidencia visual

### 6.1 Capturas after generadas

#### Portal

- `commercial-plans-after-desktop.png`
- `commercial-products-after-desktop.png`
- `tax-catalog-after-desktop.png`
- `users-after-desktop.png`
- `commercial-plans-after-mobile.png`
- `commercial-products-after-mobile.png`
- `tax-catalog-after-mobile.png`
- `users-after-mobile.png`

#### Web admin

- `web-tenants-after-desktop.png`
- `web-user-modal-after-desktop.png`
- `web-branding-after-desktop.png`
- `web-tenants-after-mobile.png`
- `web-user-modal-after-mobile.png`
- `web-branding-after-mobile.png`

### 6.2 Estado de before/after

Las capturas **after** quedaron generadas para portal y web admin usando mocks locales alineados a las superficies intervenidas.

Las capturas **before** no pudieron generarse en vivo dentro de esta sesión para Fase 01 ni Fase 02 porque las superficies ya estaban en estado modificado cuando se cerró la corrida visual. El baseline previo queda respaldado por:

- la auditoría inicial de código,
- los design docs aprobados por fase,
- y el diff concreto de los archivos intervenidos.

## 7. Decisiones de alcance

### 7.1 Fase 01

`apps/web` quedó fuera de la primera fase para evitar deriva de alcance durante la consolidación de la primitive compartida.

### 7.2 Fase 02

La segunda fase se limitó de forma estricta a tres superficies equivalentes:

| Archivo | Motivo |
| --- | --- |
| `apps/web/src/components/dashboard/TenantsTable.tsx` | trigger y acción operativa repetida por fila |
| `apps/web/src/components/users/UserManagementModal.tsx` | jerarquía visual de acción destructiva |
| `apps/web/src/components/tenants/TenantBrandingForm.tsx` | acción destructiva manual en branding |

## 8. Deuda residual

| ID | Deuda | Prioridad |
| --- | --- | --- |
| DT-BTN-02 | Evaluar si `softDestructive` y el patrón icon-only deben consolidarse como guideline explícita del design system. | Media |
| DT-BTN-03 | Revisar superficies restantes con acciones manuales fuera de Comercial, Usuarios y Tenants priorizados. | Media |
| DT-BTN-04 | Si se exige comparativo visual estricto, ejecutar una corrida dedicada sobre baseline previo limpio para obtener before reales. | Baja |

## 9. Stop/go

**Resultado:** GO

### Justificación

- No hubo cambio funcional.
- No hubo cambio de API, permisos, tenancy ni stack.
- `Button` evolucionó de forma compatible hacia atrás.
- Portal y web admin quedaron alineados en las superficies priorizadas.
- La evidencia after quedó cerrada en ambas aplicaciones.

## 10. Historial de cambios

| Versión | Fecha | Autor | Descripción |
| --- | --- | --- | --- |
| v1.0 | 2026-05-04 | GitHub Copilot | Ejecución Fullstack de Fase 01: primitive `Button`, migración de portal prioritario, validación focalizada y evidencia after portal. |
| v1.1 | 2026-05-04 | GitHub Copilot | Consolidación Fase 01-02: migración priorizada en `apps/web`, cierre de evidencia visual web y actualización del informe vivo. |
| v1.2 | 2026-05-04 | GitHub Copilot | Ajuste correctivo visual en `PlanCatalogManager`: alineación vertical centrada de la fila para mantener consistencia con `UsersTable`. |
| v1.3 | 2026-05-04 | GitHub Copilot | Estandarización visual de tablas en portal: `align-middle` en Productos, Servicios, Combos, Promociones, Compatibilidad, Cobertura y Suscriptores; verificado que `TaxCatalogManager` usa cards. |
| v1.4 | 2026-05-04 | GitHub Copilot | Documentación del estándar futuro: `align-middle` como regla base para celdas de tablas en frontend, registrada en instrucciones del repo y en el design doc de sistema visual. |
| v1.5 | 2026-05-04 | GitHub Copilot | Corrección de `AdditionalServicesManager`: acciones de fila migradas a icon buttons compactos (`secondary` y `softDestructive`) con semántica accesible consistente. |
