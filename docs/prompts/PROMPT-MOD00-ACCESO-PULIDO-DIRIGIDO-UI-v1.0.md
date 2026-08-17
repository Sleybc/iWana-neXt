# PROMPT MOD00 Acceso — Pulido dirigido UI

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`  
**Versión:** 1.0  
**Estado:** Aprobado para ejecución  
**Fecha:** 2026-08-15  
**Módulo:** MOD00 Configuración Control Plane  
**Fase:** Correctiva — pulido dirigido de Acceso  
**Generado por:** AI-EM-ARCH  
**Nombre de archivo destino:** `PROMPT-MOD00-ACCESO-PULIDO-DIRIGIDO-UI-v1.0.md`

**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
**ADR:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`  
**Spec baseline:** `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` v1.4; promover a v1.5 antes de producción  
**Plan:** `docs/plans/2026-08-15-mod00-acceso-pulido-dirigido-ui.md`  
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

Ejecutar exclusivamente el pulido dirigido de `/dashboard/settings/access`. Aplicar el plan task-by-task con TDD. No implementar backend, migraciones, endpoints, tokens ni cambios globales del design system.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** una única card sugerida conserva densidad de catálogo en desktop, el editor explica con claridad lo que se revisa y el pie MFA es legible y operable en mobile.
- **Sí entra:** spec v1.5, copy dinámico, grilla responsive incondicional, footer MFA responsive, Jest, E2E, axe, snapshots e informe vivo.
- **No entra:** API, OpenAPI, PostgreSQL, migraciones, tenancy, permisos, navegación, `/dashboard/users`, Organización, tokens o primitives globales.

## 2. Artefactos y skills obligatorios

Leer antes de editar:

1. `AGENTS.md`
2. `.github/copilot-instructions.md`
3. spec baseline v1.4
4. plan de pulido dirigido
5. spec Firma iWana
6. informe vivo

Aplicar en este orden:

1. `iwana-identity-ui-review`
2. `senior-ui-systems-designer`
3. `ui-ux-pro-max`, solo como apoyo subordinado
4. `system-vocabulary-review`
5. `frontend-dev-guidelines`
6. `core-components`
7. `tailwind-patterns`
8. `test-driven-development`
9. `verification-before-completion`

Usar `executing-plans` para ejecutar. No delegar a subagentes salvo autorización explícita del usuario.

## 3. Instrucciones de ejecución

1. Inspeccionar `git status` y el diff de los archivos de Acceso. Preservar todos los cambios existentes y no revertir trabajo ajeno.
2. Promover la spec a v1.5 y congelar CA-ACC-UX-18…20 según el plan.
3. Escribir y ejecutar los RED unitarios antes de cambiar producción.
4. Implementar exactamente:
   - `grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` sin ramas por cantidad;
   - `Revisa lo que «{perfil}» puede ver o hacer en cada sección.`;
   - `Revisa lo que «{perfil}» podrá ver o hacer en cada sección.`;
   - footer `flex-col/items-stretch` en mobile y `sm:flex-row/sm:items-center`;
   - botón MFA `w-full sm:w-auto`;
   - eliminación de `templateEyebrow`.
5. Ejecutar GREEN unitario.
6. Añadir E2E observable para card única y footer MFA mobile.
7. Actualizar snapshots solo después de que el comportamiento sea correcto y confirmar una segunda corrida sin actualización.
8. Ejecutar gates y actualizar el informe vivo a v1.67 con resultados reales.

## 4. Restricciones no negociables

- Usar pnpm; nunca npm o yarn.
- No crear `tailwind.config.js`, hex, sombras o tokens nuevos.
- No modificar `portal-ui.tsx`, `@iwana/ui`, `OrganizationSettingsClient.tsx` ni snapshots de Organización.
- No cambiar contratos API, backend, roles, permisos ni tenancy.
- Mantener copy en español, sentence case, objetivos táctiles ≥44 px, foco visible y WCAG 2.2 AA.
- El lima sigue limitado a avance, edición, interacción o completitud; no usarlo como fondo base, urgencia o CTA operativo.
- No degradar CTAs sugeridos: siguen apilados, `w-full`, `size="sm"` y `min-h-11`.
- No crear commit ni publicar cambios salvo solicitud explícita del usuario.

## 5. Entregables técnicos

- Cliente y catálogo de copy actualizados.
- Tests Jest focalizados.
- E2E de Acceso con axe y seis snapshots light/dark.
- Typecheck, lint, cobertura y auditor iWana verificados.

## 6. Entregables documentales

- Spec v1.5 coherente y sin contradicciones.
- Plan y este prompt conservados en sus rutas canónicas.
- Informe vivo actualizado a v1.67; no crear un informe nuevo.

## 7. Criterios de aceptación

- **CA-ACC-UX-18:** con una sugerencia, la card ocupa una columna responsive en desktop y ancho completo en mobile.
- **CA-ACC-UX-19:** el editor usa el nuevo copy para perfil existente y borrador.
- **CA-ACC-UX-20:** en 390×844 la ayuda MFA queda encima del CTA, sin solape, y el botón ocupa el ancho disponible; desde `sm` vuelven a fila.
- CA-ACC-UX-01…17 permanecen verdes.
- Jest, Playwright, axe, typecheck y lint verdes.
- Cobertura de `AccessControlSettingsClient.tsx` ≥80% en statements, branches, functions y lines.
- Auditor iWana con P0/P1 = 0; heurísticas justificadas.

## 8. Comandos de validación

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand
pnpm --filter @iwana/portal exec tsc --noEmit
pnpm --filter @iwana/portal exec eslint src/components/settings/AccessControlSettingsClient.tsx src/components/settings/mod00-settings-labels.ts src/components/settings/AccessControlSettingsClient.spec.tsx
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand --coverage --collectCoverageFrom=src/components/settings/AccessControlSettingsClient.tsx
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-ui.spec.ts --update-snapshots
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-ui.spec.ts
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/settings/AccessControlSettingsClient.tsx
git diff --check
```

## 9. Criterio de stop/go

Detener la ejecución y escalar a AI-EM-ARCH si el cambio exige backend, token nuevo, primitive global, cambio de navegación o contradice la spec v1.5. No ampliar alcance para resolver deuda ajena a esta pantalla.

## 10. Criterio de salida

- Frontend validado contra CA-ACC-UX-01…20.
- Tests y documentación coherentes con el comportamiento final.
- Evidencia visual revisada en mobile, tablet y desktop, claro y oscuro.
- Informe vivo actualizado con resultados observados.
- Sin cambios fuera del alcance cerrado.
