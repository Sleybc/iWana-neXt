# Portal Settings Input Layout Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar la distribución visual de inputs en `General` y `Operación` dentro de `apps/portal:/dashboard/settings`, aumentando densidad útil y escaneabilidad sin fusionar tabs ni alterar contratos API.

**Architecture:** La solución conserva la separación funcional entre `CompanyProfileForm` y `OperationalSettingsForm`, pero normaliza ambos a una gramática de layout más densa y controlada. Se usará una grilla flexible de 12 columnas con spans variables para campos cortos y largos, manteniendo formularios independientes, validaciones existentes y acciones de guardado separadas.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, Tailwind CSS v4, `@iwana/ui`, Jest, Testing Library.

---

## Metadatos documentales

**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-08  
**Módulo:** TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS  
**Referencia base:** `docs/prompts/PROMPT-TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS-v1.0.md`

## 0. Artefactos obligatorios de contexto

Leer antes de ejecutar:

- `docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md`
- `docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md`
- `docs/prompts/PROMPT-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md`
- `apps/portal/src/components/settings/CompanyProfileForm.tsx`
- `apps/portal/src/components/settings/OperationalSettingsForm.tsx`
- `apps/web/src/components/profile/ProfileForm.tsx`
- `apps/web/src/components/settings/SecuritySettings.tsx`
- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

## 1. File structure lock

### Files to modify

- `apps/portal/src/components/settings/CompanyProfileForm.tsx`
- `apps/portal/src/components/settings/OperationalSettingsForm.tsx`
- `apps/portal/src/components/settings/SettingsClient.spec.tsx`
- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

### Files to create

- `docs/prompts/PROMPT-TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS-v1.0.md`

### Files to test

- `apps/portal/src/components/settings/SettingsClient.spec.tsx`
- `apps/portal/src/components/settings/BrandingForm.spec.tsx`
- `apps/portal/src/components/settings/AdditionalProductsManager.spec.tsx`
- `apps/portal/src/components/settings/AdditionalServicesManager.spec.tsx`
- `apps/portal/src/components/settings/PlanCatalogManager.spec.tsx`

## 2. Layout rules approved

Estas reglas no son opcionales durante la ejecución:

- No fusionar `General` y `Operación` en una sola tab.
- No unificar submits ni tocar endpoints `PATCH /tenants/me/profile` y `PATCH /tenants/me/settings`.
- No usar 4 columnas iguales para formularios editables.
- Sí usar una base de 12 columnas con spans variables.
- Máximo 3 campos cortos por fila en desktop amplio.
- Campos largos deben ocupar 6 o 12 columnas.
- Mobile vuelve a 1 columna; tablet prioriza 2 columnas.
- Mantener los bloques read-only de resumen como superficies separadas de los inputs editables.

## 3. Mapa de redistribución por formulario

### 3.1 General — `CompanyProfileForm`

**Resumen superior (read-only):**
- Mantener 4 tarjetas/slots para `Nombre comercial`, `Slug`, `Estado`, `Creado`.
- No mezclar este resumen con la grilla editable.

**Bloque A — Perfil y contacto:**
- `contactEmail` → span ancho
- `legalName` → span ancho
- `phone` → span medio
- `website` → span ancho

**Bloque B — Identificación y ubicación:**
- `nit` → campo corto
- `nitDv` → campo muy corto
- `countryCode` → campo corto
- `city` → campo medio
- `department` → campo medio

**Regla visual:**
- El usuario debe percibir dos grupos temáticos, no una lista plana de 9 campos.
- `NIT`, `DV` y `País legal` pueden convivir en una fila densa solo en desktop grande.
- `Correo`, `Razón social` y `Sitio web` no deben comprimirse al ancho de un dato corto.

### 3.2 Operación — `OperationalSettingsForm`

**Mantener grupos existentes:**
- `Ubicación`
- `Preferencias`

**Redistribución recomendada:**
- `timezone` → span ancho
- `country` → span corto/medio
- `language` → span corto
- `currency` → span corto

**Regla visual:**
- `Zona horaria` no debe compartir exactamente el mismo ancho visual de `Moneda`.
- `País operativo`, `Idioma` y `Moneda` pueden comportarse como fila densa.
- No eliminar la nota de plataforma ni el footer del submit.

## 4. Task breakdown

### Task 1: Asegurar ancla de pruebas y baseline antes del refactor

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsClient.spec.tsx`

- [ ] **Step 1: Revisar los anchors visibles actuales del flujo General y Operación**

Verificar qué textos estables deben servir como ancla tras el refactor:

- `Guardar perfil empresarial`
- `Guardar configuración operativa`
- `Perfil empresarial`
- `Configuración operativa`

- [ ] **Step 2: Ajustar o ampliar test si falta cobertura del layout visible por tab**

Agregar una prueba focalizada como base:

```tsx
it('should render general and operations sections with their primary actions', async () => {
  render(<SettingsClient />);

  expect(await screen.findByText('Guardar perfil empresarial')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /Operación/i }));

  expect(await screen.findByText('Guardar configuración operativa')).toBeInTheDocument();
});
```

- [ ] **Step 3: Ejecutar la prueba para establecer baseline**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx --no-coverage`
Expected: PASS antes del refactor de layout.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/components/settings/SettingsClient.spec.tsx
git commit -m "test: lock settings tabs baseline before input layout refactor"
```

### Task 2: Refactor visual de General con densidad controlada

**Files:**
- Modify: `apps/portal/src/components/settings/CompanyProfileForm.tsx`

- [ ] **Step 1: Crear agrupación interna por secciones temáticas**

Agregar subtítulos funcionales dentro del formulario editable:

```tsx
<p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
  Perfil y contacto
</p>
```

```tsx
<p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
  Identificación y ubicación
</p>
```

- [ ] **Step 2: Sustituir la grilla plana por una grilla de 12 columnas**

Usar un wrapper base como este:

```tsx
<div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
  <div className="xl:col-span-6">...</div>
  <div className="xl:col-span-6">...</div>
  <div className="xl:col-span-4">...</div>
  <div className="xl:col-span-2">...</div>
  <div className="xl:col-span-3">...</div>
</div>
```

- [ ] **Step 3: Aplicar spans específicos por campo**

Usar esta distribución mínima:

```tsx
contactEmail  -> xl:col-span-6
legalName     -> xl:col-span-6
phone         -> xl:col-span-4
website       -> xl:col-span-8
nit           -> xl:col-span-4
nitDv         -> xl:col-span-2
countryCode   -> xl:col-span-3
city          -> xl:col-span-6
department    -> xl:col-span-6
```

- [ ] **Step 4: Mantener el footer y feedback sin cambios funcionales**

No mover ni unificar:

```tsx
{serverError && <PortalAlert ... />}
{success && !serverError && <PortalAlert ... />}
<Button type="submit" ...>Guardar perfil empresarial</Button>
```

- [ ] **Step 5: Ejecutar validación focalizada**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

- [ ] **Step 6: Ejecutar test focalizado**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx --no-coverage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/portal/src/components/settings/CompanyProfileForm.tsx apps/portal/src/components/settings/SettingsClient.spec.tsx
git commit -m "feat: densify company profile form layout"
```

### Task 3: Refactor visual de Operación con mejor proporción de campos

**Files:**
- Modify: `apps/portal/src/components/settings/OperationalSettingsForm.tsx`

- [ ] **Step 1: Mantener estructura conceptual actual**

No eliminar:

- bloque `Ubicación`
- bloque `Preferencias`
- nota de plataforma
- feedback de servidor
- CTA `Guardar configuración operativa`

- [ ] **Step 2: Cambiar grillas internas a 12 columnas en desktop amplio**

Usar una estructura base como esta:

```tsx
<div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
  <div className="xl:col-span-7">...</div>
  <div className="xl:col-span-5">...</div>
</div>
```

Y para preferencias:

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
  <div className="xl:col-span-4">...</div>
  <div className="xl:col-span-4">...</div>
</div>
```

- [ ] **Step 3: Asignar proporciones por campo**

Distribución aprobada:

```tsx
timezone -> xl:col-span-7
country  -> xl:col-span-5
language -> xl:col-span-6
currency -> xl:col-span-6
```

Si visualmente queda demasiado ancho, permitir ajuste fino a `5/7`, `4/4/4` o `5/3/4`, pero sin convertirlo en una tabla compacta.

- [ ] **Step 4: Mantener paridad visual entre vista editable y read-only**

La versión de solo lectura debe reflejar la misma lógica temática:

- `Ubicación` primero
- `Preferencias` después
- densidad equilibrada en los info-panels

- [ ] **Step 5: Ejecutar validación focalizada**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

- [ ] **Step 6: Ejecutar test focalizado**

Run: `pnpm --filter @iwana/portal test -- src/components/settings/SettingsClient.spec.tsx --no-coverage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/portal/src/components/settings/OperationalSettingsForm.tsx
git commit -m "feat: refine operational settings field proportions"
```

### Task 4: Verificación integrada del slice settings

**Files:**
- Modify: `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

- [ ] **Step 1: Ejecutar suite de settings completa**

Run:

```bash
pnpm --filter @iwana/portal test -- "src/components/settings" --no-coverage
```

Expected: PASS en todas las suites del slice.

- [ ] **Step 2: Ejecutar chequeos obligatorios del portal**

Run:

```bash
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
```

Expected: PASS.

- [ ] **Step 3: Validar visualmente breakpoints mínimos**

Revisión manual obligatoria:

- desktop 1440x900
- tablet 1024x768
- mobile 390x844

Checklist manual:

- no hay filas rotas con labels largos;
- `Correo`, `Razón social` y `Zona horaria` conservan aire visual;
- `NIT`, `DV` y `País` no se sienten aplastados;
- los footers con CTA no saltan de posición entre tabs;
- el formulario no parece una tabla editable.

- [ ] **Step 4: Actualizar informe vivo con evidencia real de ejecución**

Agregar addendum con:

- archivos modificados;
- comandos ejecutados;
- resultado de tests, typecheck y lint;
- deuda residual si algún span requiere ajuste fino posterior.

- [ ] **Step 5: Commit**

```bash
git add docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md
git commit -m "docs: record settings input layout refinement"
```

## 5. Riesgos y mitigaciones

- **Riesgo:** el formulario se vuelve demasiado denso y pierde aire.
  **Mitigación:** usar 3 columnas solo en campos cortos y dejar campos largos en spans de 6 o más.

- **Riesgo:** la paridad entre edición y solo lectura se rompe en Operación.
  **Mitigación:** replicar el mismo grouping temático en ambas vistas.

- **Riesgo:** se introducen cambios funcionales accidentales en validación o submit.
  **Mitigación:** no tocar esquemas Zod, handlers `onSubmit` ni contratos API.

- **Riesgo:** el fullstack copie el patrón de 4 columnas iguales desde bloques read-only.
  **Mitigación:** dejar explícito que 4 columnas aplica solo a resumen, no a inputs editables.

## 6. Criterio de salida

La ejecución se considera completa solo si se cumplen todos estos puntos:

- `General` y `Operación` siguen separados en tabs distintas.
- `CompanyProfileForm` deja de verse como una lista plana de inputs.
- `OperationalSettingsForm` gana mejor proporción entre campos largos y cortos.
- `pnpm --filter @iwana/portal test -- "src/components/settings" --no-coverage` queda en verde.
- `pnpm --filter @iwana/portal typecheck` queda en verde.
- `pnpm --filter @iwana/portal lint` queda en verde.
- El informe vivo queda actualizado con evidencia real.
