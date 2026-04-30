# PROMPT — Ejecucion Fase 03C · Frontend web + portal

**Version:** 1.0
**Estado:** Listo para ejecucion (tras cierre de 03B)
**Fecha:** 2026-04-30
**Generado por:** Engineering Manager (AI-EM-ARCH)
**Plantilla base:** [docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Convencion documental:** PROMPT-MOD03-BRANDING-FASE-03C-v1.0.md

## Modulo

- Nombre: Branding Empresarial v2 — Frontend (web + portal)
- Codigo: MOD03 — fase 03C
- Version: 1.0
- Fecha: 2026-04-30
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-MOD03-BRANDING-FASE-03C-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** Consolas funcionales en `apps/web` (administracion de cualquier tenant) y `apps/portal` (autoservicio TENANT_ADMIN) con upload, URL externa, previews claro/oscuro, reset; aplicacion del branding en login publico del portal y en sesion autenticada.
- **Lo que SI entra:**
  - Componente `<BrandingSlotEditor>` en `@iwana/ui` con modos upload / URL / reset.
  - Pestaña "Marca" en `TenantSettingsForm` de `apps/web` (4 slots × 2 variantes = 8 editores).
  - Seccion extendida en Configuracion > Marca de `apps/portal`.
  - api-client `tenantSelfApi.uploadBrandingAsset()` y `platformTenantApi.uploadBrandingAsset()`.
  - Hook `usePublicBranding(slug)` y aplicacion en login portal.
  - Favicon dinamico via media query `prefers-color-scheme`.
  - Tests RTL + Playwright E2E.
- **Lo que NO entra:**
  - Edicion grafica (crop, resize).
  - Temas de color completos.
  - Aplicacion de branding en emails o PDFs.

## 2. Artefactos de entrada obligatorios

- PRD: [docs/prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md)
- HLD: [docs/hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)
- Plan: [docs/plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md](../plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md)
- Contratos: OpenAPI estable de 03B.
- ADR-023 TailAdmin: [docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)
- Skills: `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `wcag-audit-patterns`, `i18n-localization`, `playwright-skill`, `e2e-testing-patterns`, `frontend-security-coder`.

## 3. Instrucciones para Sr. Dev Fullstack

1. Crear componente `<BrandingSlotEditor>` en `packages/ui/src/components/branding/`:
   - Props: `slotKey`, `variant` (light|dark), `valueUrl`, `valueAssetId`, `previewUrl`, `policy`, `onUpload`, `onSetUrl`, `onReset`, `disabled`.
   - Tres modos: archivo (drag&drop + input), URL (input con validacion HTTPS), reset (boton).
   - Preview con marco claro u oscuro segun variante.
   - Errores de validacion accesibles (aria-live).
   - Labels y mensajes en es-CO sentence case.
2. `apps/web`:
   - Crear pestaña "Marca" en `TenantSettingsForm` accesible al editar un tenant.
   - Renderizar 8 editores (4 slots × 2 variantes) con preview unificado claro y oscuro.
   - Permisos: SYSTEM_ADMIN y IWANA_SUPPORT.
   - api-client: `platformTenantApi.uploadBrandingAsset(tenantId, file, usage, variant)` y `platformTenantApi.updateBranding(tenantId, dto)`.
3. `apps/portal`:
   - Extender la seccion Marca existente con favicon y login_background.
   - Usar el mismo `<BrandingSlotEditor>` para uniformidad.
   - Permisos: TENANT_ADMIN.
   - api-client: `tenantSelfApi.uploadBrandingAsset(file, usage, variant)`.
4. Login publico portal:
   - Determinar slug del tenant (subdominio o query param) en server component si es posible.
   - Hook/server fetch `getPublicBranding(slug)`. Si falla -> fallback iWana.
   - Aplicar fondo de login segun `prefers-color-scheme` con overlay fijo del sistema (preserva contraste).
   - Inyectar logo en card de login.
   - Inyectar favicon dinamico via `<link rel="icon">` con `media="(prefers-color-scheme: dark)"` para variante dark.
5. Sesion autenticada portal:
   - Extender consumo existente de `tenantSelfApi.me()` para los nuevos slots.
   - Sidebar: aplicar `seal.{light|dark}` y `logo.{light|dark}`.
   - Documentar TODO si se requiere preload de favicon en sesion (puede ya estar resuelto por public-branding).
6. Tests:
   - RTL: `<BrandingSlotEditor>` modos upload, URL invalida HTTP, reset, MIME no permitido (rechazado en cliente y servidor).
   - RTL: pagina Marca portal y web con mocks de api-client.
   - Playwright (`e2e/tests/portal-branding.spec.ts`): upload de logo desde portal, login muestra logo aplicado.
   - Playwright (`e2e/tests/web-tenant-branding.spec.ts`): SYSTEM_ADMIN edita branding de un tenant arbitrario.
7. Accesibilidad:
   - Validar contraste de previews (skill `wcag-audit-patterns`).
   - Sin texto en mayusculas crudas; sentence case obligatorio.
   - Skips correctos en zona de drag&drop.
8. Actualizar informe vivo con estado final de 03C y cierre del modulo.

## 4. Restricciones no negociables

- No hardcodear slug ni tenantId en codigo.
- No exponer tokens en URLs ni en logs cliente.
- No mostrar errores de backend con detalles internos al usuario final.
- No introducir bypass de auth en login publico mas alla del endpoint `/public-branding` ya definido.
- Validaciones cliente NO sustituyen validaciones servidor.

## 5. Entregables tecnicos obligatorios

- Codigo frontend: `apps/web/**`, `apps/portal/**`, `packages/ui/src/components/branding/**`.
- api-client extendido en ambas apps.
- Tests RTL con cobertura adecuada.
- Playwright E2E para flujos clave.
- Aplicacion en login publico funcional.

## 6. Entregables documentales obligatorios

- Actualizar informe vivo `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` con cierre del modulo.
- Evidencia E2E (videos/screenshots) en `e2e/test-results/` referenciados desde el informe.
- Hallazgos WCAG en `docs/quality/` si aplica.

## 7. Criterios de aceptacion

- CA-03C-01: TENANT_ADMIN sube logo light desde portal y la sesion refleja el cambio sin recargar manualmente.
- CA-03C-02: TENANT_ADMIN ingresa URL HTTPS externa y se aplica en preview y persistencia.
- CA-03C-03: TENANT_ADMIN reset favicon hace fallback al sello compacto.
- CA-03C-04: SYSTEM_ADMIN edita branding de un tenant arbitrario desde `apps/web`.
- CA-03C-05: Login publico portal muestra fondo, logo y favicon antes de pedir credenciales.
- CA-03C-06: Si endpoint publico falla, login fallback a iWana sin error visible.
- CA-03C-07: Favicon respeta `prefers-color-scheme` en navegadores compatibles.
- CA-03C-08: Validaciones cliente rechazan archivo > tamano max y MIME no permitido antes de subir.
- CA-03C-09: Playwright E2E pasa en CI.
- CA-03C-10: Sin violaciones de contraste WCAG AA en previews.

## 8. Criterio de stop/go

- Detenerse si:
  - El branding no se puede aplicar antes de auth en login publico sin flicker grave.
  - Hay fugas cross-tenant en UI (acceso accidental a otra empresa).
  - Tests E2E flaky imposibles de estabilizar (consultar `e2e-testing-patterns`).
- Documentar causa en: informe vivo + `docs/quality/`.
- Escalar a: Staff Engineer y CTO si > 4h.
- Recomendacion esperada: ajuste de UX o de contrato del endpoint publico.

## 9. Criterio de salida de la fase

- Frontend validado: lint + typecheck + tests verde.
- Playwright E2E verde en CI.
- Backend ya validado en 03B (regresion verde).
- Documentacion archivada con cierre formal del modulo.
- Sin tokens ni PII en logs cliente.
- Listo para gates de salida del modulo y cierre via informe.
