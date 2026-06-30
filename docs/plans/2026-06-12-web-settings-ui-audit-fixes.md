# Settings Web (`/settings`) — Correcciones UI/UX y accesibilidad

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir todos los hallazgos bloqueantes e importantes detectados en la auditoría visual de `/settings` (apps/web): migrar tabs a `@iwana/ui`, migrar inputs de contraseña, corregir accesibilidad ARIA, normalizar tokens de sombra y radio, proteger el formulario de branding durante carga, agregar confirmación de eliminación, y completar la cobertura de tests.

**Architecture:** La página `/settings` usa un patrón de tabs custom que debe reemplazarse con los componentes de `@iwana/ui` (Tabs, TabsList, TabsTrigger, TabsContent). Los componentes SecuritySettings y PlatformBrandingSettings se refactorizan en lugar de reescribirse: se migran los inputs nativos a `<Input>` de `@iwana/ui`, se corrigen los estados ARIA y se normalizan los tokens de diseño. No se introduce ninguna dependencia nueva — todo ya existe en el design system.

**Tech Stack:** Next.js App Router · React · TypeScript estricto · `@iwana/ui` (Tabs, Input, OtpInput, Dialog, Button, Card) · react-hook-form · Zod · Jest · Testing Library

**Referencia de hallazgos:** Auditoría 2026-06-12 — roles `AI-SR-UI-SYS` y `AI-EM-ARCH`
**PRD rector:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.5)
**HLD rector:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.6)
**ADR rector:** `ADR-040`, `ADR-045`

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Modify | `apps/web/src/app/(protected)/settings/page.tsx` | Migrar tabs custom → `<Tabs>` de `@iwana/ui`; corregir Card-in-Card del tab General; normalizar shadow |
| Modify | `apps/web/src/components/settings/SecuritySettings.tsx` | Migrar inputs nativos → `<Input>` de `@iwana/ui`; migrar TOTP → `<OtpInput>`; añadir `role="alert"` al bloque de éxito; añadir `autoComplete`; añadir estado de carga MFA |
| Modify | `apps/web/src/components/settings/PlatformBrandingSettings.tsx` | Deshabilitar formulario durante carga; limpiar `defaultValues` hardcodeados; añadir Dialog de confirmación antes de eliminar imagen; `role="alert"` en bloque de éxito; `role="status"` en overlay de upload |
| Create | `apps/web/src/components/settings/SecuritySettings.spec.tsx` | Tests: cambio contraseña exitoso/error, validación formulario, flujo setup MFA, flujo disable MFA, estado inicial MFA |
| Modify | `apps/web/src/app/(protected)/settings/page.spec.tsx` | Agregar tests: Restaurar base, error API en carga, tab Seguridad, tab General, estado isLoadingData |

---

## Task 1: Migrar tabs a `<Tabs>` de `@iwana/ui` en `page.tsx`

**Hallazgos que resuelve:** B-1 (sin ARIA tablist/tab/tabpanel), M-2 (scroll indeseado), M-10 (tab General sin deuda documentada)

**Files:**
- Modify: `apps/web/src/app/(protected)/settings/page.tsx`

- [ ] **Step 1.1: Verificar el export de Tabs en `@iwana/ui`**

```bash
pnpm --filter @iwana/web typecheck 2>&1 | head -5
```
Expected: sin errores previos (o errores existentes ya conocidos).

- [ ] **Step 1.2: Reemplazar la implementación de tabs en `page.tsx`**

Abre `apps/web/src/app/(protected)/settings/page.tsx` y aplica este reemplazo completo:

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformBrandingSettings } from '@/components/settings/PlatformBrandingSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuración"
        subtitle="Gestiona la configuración de tu cuenta y preferencias de plataforma"
      />

      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Parámetros de cuenta</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <Tabs defaultValue="general">
            <div className="overflow-x-auto pb-4">
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
              </TabsList>
            </div>

            <div className="max-w-[1180px]">
              <TabsContent value="general">
                {/* TODO (ADR-040): Este tab debe contener preferencias operativas del
                    administrador de plataforma. Contenido real pendiente de definición
                    en la próxima fase de MOD00. Ver PRD-MOD00 sección 4.3. */}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  La configuración operativa y los datos de empresa se gestionan desde el
                  detalle de cada empresa en la sección <strong>Empresas</strong>.
                </p>
              </TabsContent>

              <TabsContent value="seguridad">
                <SecuritySettings />
              </TabsContent>

              <TabsContent value="branding">
                <PlatformBrandingSettings />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 1.3: Verificar tipado**

```bash
pnpm --filter @iwana/web typecheck 2>&1 | grep -i "settings"
```
Expected: sin errores nuevos en settings/page.tsx.

- [ ] **Step 1.4: Commit**

```bash
git add apps/web/src/app/'(protected)'/settings/page.tsx
git commit -m "refactor(settings): migrate custom tabs to @iwana/ui Tabs with full ARIA"
```

---

## Task 2: Corregir `SecuritySettings` — inputs, accesibilidad y estado de carga MFA

**Hallazgos que resuelve:** B-2 (inputs sin aria-invalid/aria-describedby), B-3 (TOTP sin label/inputMode), B-4 (éxito sin role="alert"), I-2 (sin autoComplete), I-5 (carga MFA invisible), I-7 (inputs nativos vs @iwana/ui)

**Files:**
- Modify: `apps/web/src/components/settings/SecuritySettings.tsx`

- [ ] **Step 2.1: Actualizar imports**

En `SecuritySettings.tsx`, reemplaza el bloque de imports de `@iwana/ui` y añade `OtpInput`:

```typescript
// Antes:
import { Button } from '@iwana/ui';

// Después:
import { Button, Input, OtpInput } from '@iwana/ui';
```

Y elimina los imports de form-styles que ya no se usarán para inputs:
```typescript
// Eliminar de las importaciones:
FORM_ERROR_CLASS,
FORM_INPUT_CLASS,
FORM_LABEL_CLASS,
```

(Mantener: `FORM_ALERT_ERROR_CLASS`, `FORM_ALERT_SUCCESS_CLASS`, `FORM_ALERT_INFO_CLASS`, `FORM_HELP_CLASS`, `FORM_MICROCOPY_CLASS`)

- [ ] **Step 2.2: Añadir estado de carga MFA inicial**

Añade `isLoadingMfa` al estado:

```typescript
// Añadir al bloque de useState existente (después de mfaDisableCode):
const [isLoadingMfa, setIsLoadingMfa] = useState(true);
```

Actualiza el `useEffect` de carga:

```typescript
useEffect(() => {
  const loadSecurityState = async () => {
    try {
      const profile = await platformUsersApi.me();
      setMfaState((current) => ({ ...current, enabled: profile.mfaEnabled }));
    } catch {
      // El estado visible sigue operable aun si falla la carga inicial.
    } finally {
      setIsLoadingMfa(false);
    }
  };

  void loadSecurityState();
}, []);
```

- [ ] **Step 2.3: Corregir bloque de éxito — añadir `role="alert"`**

```typescript
// Antes (línea ~135):
{message && (
  <div className={FORM_ALERT_SUCCESS_CLASS}>

// Después:
{message && (
  <div role="alert" className={FORM_ALERT_SUCCESS_CLASS}>
```

- [ ] **Step 2.4: Migrar formulario de cambio de contraseña a `<Input>` de `@iwana/ui`**

Reemplaza el bloque `<form onSubmit={handleSubmit(onChangePassword)}>` completo:

```tsx
<form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
  <div className="max-w-[440px] space-y-4">
    <Input
      label="Contraseña actual"
      type="password"
      autoComplete="current-password"
      error={errors.currentPassword?.message}
      {...register('currentPassword')}
    />
    <Input
      label="Nueva contraseña"
      type="password"
      autoComplete="new-password"
      error={errors.newPassword?.message}
      {...register('newPassword')}
    />
    <Input
      label="Confirmar nueva contraseña"
      type="password"
      autoComplete="new-password"
      error={errors.confirmPassword?.message}
      {...register('confirmPassword')}
    />
  </div>

  <div className="flex max-w-[440px] justify-end">
    <Button type="submit" loading={isSubmitting}>
      Actualizar contraseña
    </Button>
  </div>
</form>
```

- [ ] **Step 2.5: Migrar campo TOTP a `<OtpInput>` de `@iwana/ui`**

Reemplaza el bloque `{mfaState.pendingVerification && ...}`:

```tsx
{mfaState.pendingVerification && (
  <div className={securityInnerSectionClass}>
    <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
      Confirmar configuración inicial
    </h3>
    <p className={FORM_MICROCOPY_CLASS}>
      Ingresa el primer código generado por tu app autenticadora para completar la
      activación.
    </p>
    <OtpInput
      value={mfaSetupCode}
      onChange={setMfaSetupCode}
      length={6}
    />
    <div className="flex justify-end">
      <Button
        type="button"
        size="lg"
        onClick={onMfaVerifySetup}
        disabled={mfaSetupCode.length !== 6}
      >
        Verificar MFA
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 2.6: Migrar formulario de deshabilitar MFA a `<Input>` de `@iwana/ui`**

Reemplaza el bloque de los dos campos dentro de `{mfaState.enabled && ...}`:

```tsx
<div className="grid max-w-[640px] gap-3 md:grid-cols-2">
  <Input
    label="Contraseña actual"
    type="password"
    autoComplete="current-password"
    value={mfaDisablePassword}
    onChange={(e) => setMfaDisablePassword(e.target.value)}
  />
  <Input
    label="Código MFA"
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    value={mfaDisableCode}
    onChange={(e) => setMfaDisableCode(e.target.value)}
  />
</div>
```

- [ ] **Step 2.7: Mostrar spinner/texto de carga hasta confirmar estado MFA**

Envuelve la sección del estado MFA con una guarda de carga:

```tsx
{/* Estado actual del MFA */}
<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
  <div>
    <p className="text-sm text-gray-600 dark:text-gray-300">
      {isLoadingMfa
        ? 'Verificando estado MFA…'
        : `Estado actual: ${mfaState.enabled ? 'Habilitado' : 'Deshabilitado'}`}
    </p>
    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
      Gestiona el segundo factor para el acceso del administrador de plataforma.
    </p>
  </div>

  {!isLoadingMfa && !mfaState.enabled && !mfaState.pendingVerification && (
    <Button type="button" size="lg" onClick={onMfaSetup}>
      Configurar MFA
    </Button>
  )}
</div>
```

- [ ] **Step 2.8: Verificar tipado**

```bash
pnpm --filter @iwana/web typecheck 2>&1 | grep -i "SecuritySettings"
```
Expected: sin errores en SecuritySettings.tsx.

- [ ] **Step 2.9: Commit**

```bash
git add apps/web/src/components/settings/SecuritySettings.tsx
git commit -m "refactor(settings): migrate SecuritySettings inputs to @iwana/ui, fix ARIA, add MFA loading state"
```

---

## Task 3: Corregir `PlatformBrandingSettings` — carga, confirmación de eliminación y tokens

**Hallazgos que resuelve:** B-4 (éxito sin role="alert"), B-5 (shadow hardcodeada), I-4 (formulario operable durante carga con defaultValues hardcodeados), I-6 (eliminación sin confirmación), M-6 (overlay upload sin role="status"), M-9 (defaultValues con strings de producto reales)

**Files:**
- Modify: `apps/web/src/components/settings/PlatformBrandingSettings.tsx`

- [ ] **Step 3.1: Actualizar imports — añadir Dialog**

```typescript
// Antes:
import { Button, Input } from '@iwana/ui';

// Después:
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@iwana/ui';
```

- [ ] **Step 3.2: Limpiar `defaultValues` hardcodeados**

```typescript
// Antes:
defaultValues: {
  productName: 'iWana neXt',
  surfaceName: 'Portal administrativo',
  metadataTitle: 'iWana neXt — Portal Administrativo',
  metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
  logoUrl: '/brand/iwiso6.png',
  faviconUrl: '/brand/favicon-gecko.svg',
  loginBackgroundLightUrl: '',
  loginBackgroundDarkUrl: '',
},

// Después:
defaultValues: {
  productName: '',
  surfaceName: '',
  metadataTitle: '',
  metadataDescription: '',
  logoUrl: '',
  faviconUrl: '',
  loginBackgroundLightUrl: '',
  loginBackgroundDarkUrl: '',
},
```

- [ ] **Step 3.3: Deshabilitar el formulario completo durante la carga inicial**

Envuelve el `<form>` con una guarda, y añade un estado de error de carga:

```typescript
// Añadir estado de error de carga al bloque de useState:
const [loadError, setLoadError] = useState<string | null>(null);
```

Actualiza el `useEffect` de carga:

```typescript
const loadBranding = async () => {
  try {
    const branding = await platformBrandingApi.get();
    if (mounted) {
      reset(toFormValues(branding));
      setFeedback(null);
      setLoadError(null);
    }
  } catch (error) {
    if (mounted) {
      setLoadError(
        getErrorMessage(error, 'No fue posible cargar el branding de plataforma.')
      );
    }
  } finally {
    if (mounted) {
      setIsLoadingData(false);
    }
  }
};
```

Reemplaza el bloque de estado de carga en el JSX:

```tsx
{/* Estado de carga / error de carga */}
{isLoadingData && (
  <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
    Cargando branding…
  </p>
)}

{loadError && !isLoadingData && (
  <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <div className="flex items-start justify-between gap-3 flex-1">
      <p>{loadError}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setIsLoadingData(true);
          setLoadError(null);
          // Re-ejecuta la carga llamando al mismo efecto
          platformBrandingApi.get().then((branding) => {
            reset(toFormValues(branding));
            setIsLoadingData(false);
          }).catch((error) => {
            setLoadError(getErrorMessage(error, 'No fue posible cargar el branding de plataforma.'));
            setIsLoadingData(false);
          });
        }}
      >
        Reintentar
      </Button>
    </div>
  </div>
)}
```

Añade `disabled={isLoadingData || loadError !== null}` al botón de submit y al botón de restaurar:

```tsx
{/* ── Acciones ─────────────────────────────────────────────────── */}
<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
  <Button
    type="button"
    variant="outline"
    onClick={onResetDefaults}
    loading={isResetting}
    disabled={isLoadingData || loadError !== null}
  >
    <RotateCcw className="h-4 w-4" aria-hidden="true" />
    Restaurar base
  </Button>
  <Button
    type="submit"
    loading={isSubmitting}
    disabled={isLoadingData || loadError !== null}
  >
    <Save className="h-4 w-4" aria-hidden="true" />
    Guardar cambios
  </Button>
</div>
```

- [ ] **Step 3.4: Corregir bloque de éxito — añadir `role="alert"`**

```typescript
// Antes (línea ~576):
{feedback?.type === 'success' && (
  <div className={FORM_ALERT_SUCCESS_CLASS}>

// Después:
{feedback?.type === 'success' && (
  <div role="alert" className={FORM_ALERT_SUCCESS_CLASS}>
```

- [ ] **Step 3.5: Añadir Dialog de confirmación para "Eliminar imagen" en `BrandingSlotCard`**

Reemplaza el bloque del botón Eliminar imagen (líneas ~334–350) dentro de `BrandingSlotCard`:

```tsx
{value && onRemove ? (
  <div className="flex justify-end">
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading || Boolean(isRemoving)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Eliminar imagen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar {label.toLowerCase()}?</DialogTitle>
          <DialogDescription>
            Se aplicará el fallback base de la plataforma. Esta acción no se puede
            deshacer directamente — tendrás que subir una imagen nueva.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 mt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              type="button"
              variant="destructive"
              loading={Boolean(isRemoving)}
              onClick={() => {
                void onRemove();
              }}
            >
              Sí, eliminar
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  </div>
) : null}
```

- [ ] **Step 3.6: Normalizar shadow en `securityPanelClass` equivalente de Branding**

En el `<div className="space-y-6">` del return de `PlatformBrandingSettings`, no hay un panel propio (el comentario dice "el Card de la página settings ya lo provee"). Verificar que no haya `shadow-[...]` inline en el componente. Si existe, reemplazar con `shadow-iwana-soft`.

- [ ] **Step 3.7: Añadir `role="status"` al overlay de upload en `BrandingSlotCard`**

```tsx
// Antes (línea ~282):
{isUploading && (
  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 dark:bg-dark-surface-2/80">
    <span className="text-sm text-gray-500 dark:text-gray-400">Subiendo...</span>
  </div>
)}

// Después:
{isUploading && (
  <div
    role="status"
    aria-label="Subiendo imagen"
    className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 dark:bg-dark-surface-2/80"
  >
    <span className="text-sm text-gray-500 dark:text-gray-400" aria-hidden="true">
      Subiendo…
    </span>
  </div>
)}
```

- [ ] **Step 3.8: Verificar tipado**

```bash
pnpm --filter @iwana/web typecheck 2>&1 | grep -i "PlatformBranding"
```
Expected: sin errores en PlatformBrandingSettings.tsx.

- [ ] **Step 3.9: Commit**

```bash
git add apps/web/src/components/settings/PlatformBrandingSettings.tsx
git commit -m "fix(settings/branding): disable form during load, add delete confirm dialog, fix ARIA roles, clear hardcoded defaults"
```

---

## Task 4: Normalizar shadow y radio en `page.tsx`

**Hallazgos que resuelve:** B-5 (shadow hardcodeada en page.tsx), M-2 (Card-in-Card en tab General)

**Files:**
- Modify: `apps/web/src/app/(protected)/settings/page.tsx`

> **Nota:** Este task aplica después del Task 1 (tabs ya migrados). El tab General ya no tiene el `<div>` tipo Card-in-Card porque el `TabsContent` maneja el padding/layout. Solo queda verificar que el contenido del tab General no tenga borde propio innecesario.

- [ ] **Step 4.1: Verificar que el Tab General no tenga Card anidado después del Task 1**

Con la implementación del Task 1, el tab General es:
```tsx
<TabsContent value="general">
  <p className="text-sm text-gray-500 dark:text-gray-400">…</p>
</TabsContent>
```
Sin `div` con borde/sombra propio. Si la implementación anterior del Task 1 lo incluyó, eliminarlo ahora.

- [ ] **Step 4.2: Verificar que no queden `shadow-[...]` inline en `page.tsx`**

```bash
grep -n "shadow-\[" apps/web/src/app/'(protected)'/settings/page.tsx
```
Expected: sin matches.

- [ ] **Step 4.3: Commit si hubo cambios**

```bash
git add apps/web/src/app/'(protected)'/settings/page.tsx
git commit -m "fix(settings): remove inline shadow and nested Card in General tab"
```

---

## Task 5: Normalizar shadow en `SecuritySettings.tsx`

**Hallazgos que resuelve:** B-5 (shadow hardcodeada en SecuritySettings.tsx)

**Files:**
- Modify: `apps/web/src/components/settings/SecuritySettings.tsx`

- [ ] **Step 5.1: Reemplazar la shadow hardcodeada en `securityPanelClass`**

```typescript
// Antes (línea 28–29):
const securityPanelClass =
  'rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none';

// Después (usa token semántico + radio del sistema):
const securityPanelClass =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none';
```

- [ ] **Step 5.2: Verificar**

```bash
grep -n "shadow-\[" apps/web/src/components/settings/SecuritySettings.tsx
```
Expected: sin matches.

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/src/components/settings/SecuritySettings.tsx
git commit -m "fix(settings/security): normalize shadow to shadow-iwana-soft token, use rounded-2xl"
```

---

## Task 6: Crear `SecuritySettings.spec.tsx`

**Hallazgos que resuelve:** I-8 (sin tests de SecuritySettings)

**Files:**
- Create: `apps/web/src/components/settings/SecuritySettings.spec.tsx`

- [ ] **Step 6.1: Crear el archivo de tests**

```typescript
// apps/web/src/components/settings/SecuritySettings.spec.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettings } from './SecuritySettings';
import { authApi, platformUsersApi } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  platformUsersApi: {
    me: jest.fn(),
  },
  authApi: {
    changePassword: jest.fn(),
    mfaSetup: jest.fn(),
    mfaVerifySetup: jest.fn(),
    mfaDisable: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

const mockMe = platformUsersApi.me as jest.Mock;
const mockChangePassword = authApi.changePassword as jest.Mock;
const mockMfaSetup = authApi.mfaSetup as jest.Mock;
const mockMfaVerifySetup = authApi.mfaVerifySetup as jest.Mock;
const mockMfaDisable = authApi.mfaDisable as jest.Mock;

describe('SecuritySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Estado MFA inicial: deshabilitado
    mockMe.mockResolvedValue({ mfaEnabled: false });
  });

  describe('carga inicial', () => {
    it('muestra "Verificando estado MFA" durante la carga inicial', async () => {
      // La promesa queda pendiente
      mockMe.mockReturnValue(new Promise(() => {}));
      render(<SecuritySettings />);
      expect(screen.getByText(/verificando estado mfa/i)).toBeInTheDocument();
    });

    it('muestra "Deshabilitado" cuando MFA está apagado', async () => {
      mockMe.mockResolvedValue({ mfaEnabled: false });
      render(<SecuritySettings />);
      await waitFor(() => {
        expect(screen.getByText(/deshabilitado/i)).toBeInTheDocument();
      });
    });

    it('muestra "Habilitado" cuando MFA está activo', async () => {
      mockMe.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      await waitFor(() => {
        expect(screen.getByText(/habilitado/i)).toBeInTheDocument();
      });
    });
  });

  describe('cambio de contraseña', () => {
    it('envía el formulario con datos válidos y muestra mensaje de éxito', async () => {
      mockChangePassword.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      await userEvent.type(screen.getByLabelText(/contraseña actual/i), 'OldPass123!');
      await userEvent.type(screen.getByLabelText(/nueva contraseña/i), 'NewPass456!');
      await userEvent.type(screen.getByLabelText(/confirmar nueva contraseña/i), 'NewPass456!');
      await userEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith('OldPass123!', 'NewPass456!');
        expect(screen.getByRole('alert')).toHaveTextContent(/contraseña cambiada/i);
      });
    });

    it('muestra error de API cuando changePassword falla', async () => {
      mockChangePassword.mockRejectedValue(new ApiError('Contraseña actual incorrecta.'));
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      await userEvent.type(screen.getByLabelText(/contraseña actual/i), 'WrongPass');
      await userEvent.type(screen.getByLabelText(/nueva contraseña/i), 'NewPass456!');
      await userEvent.type(screen.getByLabelText(/confirmar nueva contraseña/i), 'NewPass456!');
      await userEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/contraseña actual incorrecta/i);
      });
    });

    it('no envía si las contraseñas no coinciden', async () => {
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      await userEvent.type(screen.getByLabelText(/contraseña actual/i), 'OldPass123!');
      await userEvent.type(screen.getByLabelText(/nueva contraseña/i), 'NewPass456!');
      await userEvent.type(screen.getByLabelText(/confirmar nueva contraseña/i), 'DifferentPass');
      await userEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      await waitFor(() => {
        expect(mockChangePassword).not.toHaveBeenCalled();
      });
    });
  });

  describe('flujo de configuración MFA', () => {
    it('muestra QR y campo TOTP al hacer clic en "Configurar MFA"', async () => {
      mockMfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /configurar mfa/i }));

      await userEvent.click(screen.getByRole('button', { name: /configurar mfa/i }));

      await waitFor(() => {
        expect(screen.getByAltText(/qr de configuración mfa/i)).toBeInTheDocument();
        // OtpInput debe estar visible
        expect(screen.getByRole('button', { name: /verificar mfa/i })).toBeInTheDocument();
      });
    });

    it('llama a mfaVerifySetup y muestra éxito al ingresar código válido', async () => {
      mockMfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      mockMfaVerifySetup.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /configurar mfa/i }));
      await userEvent.click(screen.getByRole('button', { name: /configurar mfa/i }));
      await waitFor(() => screen.getByRole('button', { name: /verificar mfa/i }));

      // OtpInput: llenar los 6 dígitos
      const digitInputs = screen.getAllByRole('textbox');
      const otpInputs = digitInputs.filter((_, i) => i < 6);
      for (let i = 0; i < 6; i++) {
        await userEvent.type(otpInputs[i], String(i + 1));
      }

      await userEvent.click(screen.getByRole('button', { name: /verificar mfa/i }));

      await waitFor(() => {
        expect(mockMfaVerifySetup).toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent(/mfa habilitado/i);
      });
    });
  });

  describe('deshabilitar MFA', () => {
    beforeEach(() => {
      mockMe.mockResolvedValue({ mfaEnabled: true });
    });

    it('muestra formulario de deshabilitación cuando MFA está activo', async () => {
      render(<SecuritySettings />);
      await waitFor(() => {
        expect(screen.getByLabelText(/contraseña actual/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /deshabilitar mfa/i })).toBeInTheDocument();
      });
    });

    it('llama a mfaDisable con los valores correctos', async () => {
      mockMfaDisable.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /deshabilitar mfa/i }));

      await userEvent.type(screen.getByLabelText(/contraseña actual/i), 'MyPass123!');
      await userEvent.type(screen.getByLabelText(/código mfa/i), '123456');
      await userEvent.click(screen.getByRole('button', { name: /deshabilitar mfa/i }));

      await waitFor(() => {
        expect(mockMfaDisable).toHaveBeenCalledWith('MyPass123!', '123456');
        expect(screen.getByRole('alert')).toHaveTextContent(/mfa deshabilitado/i);
      });
    });
  });
});
```

- [ ] **Step 6.2: Ejecutar los tests**

```bash
pnpm --filter @iwana/web test src/components/settings/SecuritySettings.spec.tsx --passWithNoTests
```
Expected: todos los tests pasan (o falla con mensajes claros sobre los mocks).

Si algún test falla por el `OtpInput` (los dígitos individuales no matchean `getByRole('textbox')`), ajustar para usar `getAllByRole('spinbutton')` o el selector correcto según la implementación real de `OtpInput`.

- [ ] **Step 6.3: Commit**

```bash
git add apps/web/src/components/settings/SecuritySettings.spec.tsx
git commit -m "test(settings/security): add SecuritySettings unit tests (password change, MFA setup/disable)"
```

---

## Task 7: Completar tests en `page.spec.tsx`

**Hallazgos que resuelve:** I-9 (tests faltantes en page.spec.tsx)

**Files:**
- Modify: `apps/web/src/app/(protected)/settings/page.spec.tsx`

- [ ] **Step 7.1: Leer el estado actual de `page.spec.tsx`**

```bash
cat "apps/web/src/app/(protected)/settings/page.spec.tsx"
```

- [ ] **Step 7.2: Añadir tests faltantes**

Añade los siguientes bloques de tests al archivo existente, después de los tests ya presentes:

```typescript
// Añadir a los mocks existentes si no están:
// jest.mock('@/components/settings/SecuritySettings', () => ({
//   SecuritySettings: () => <div data-testid="security-settings">Seguridad mock</div>,
// }));

describe('tab General', () => {
  it('muestra el texto informativo en el tab General por defecto', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/la configuración operativa/i)).toBeInTheDocument();
  });
});

describe('tab Seguridad', () => {
  it('muestra el componente SecuritySettings al activar el tab Seguridad', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: /seguridad/i }));
    expect(screen.getByTestId('security-settings')).toBeInTheDocument();
  });
});

describe('tab Branding — Restaurar base', () => {
  it('llama a platformBrandingApi.reset() al hacer clic en Restaurar base', async () => {
    const mockReset = platformBrandingApi.reset as jest.Mock;
    mockReset.mockResolvedValue({
      productName: 'iWana neXt', surfaceName: 'Portal administrativo',
      metadataTitle: 'iWana neXt', metadataDescription: 'Desc',
      logoUrl: null, faviconUrl: null,
      loginBackgroundLightUrl: null, loginBackgroundDarkUrl: null,
    });

    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: /branding/i }));
    await waitFor(() => screen.getByRole('button', { name: /restaurar base/i }));

    await userEvent.click(screen.getByRole('button', { name: /restaurar base/i }));

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });
});

describe('tab Branding — error de API en carga', () => {
  it('muestra error y botón Reintentar si la carga inicial falla', async () => {
    (platformBrandingApi.get as jest.Mock).mockRejectedValue(
      new Error('Error de red')
    );

    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: /branding/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });
  });
});

describe('tab Branding — estado isLoadingData', () => {
  it('muestra "Cargando branding…" mientras la API está pendiente', async () => {
    (platformBrandingApi.get as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: /branding/i }));

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.3: Ejecutar los tests**

```bash
pnpm --filter @iwana/web test "src/app/(protected)/settings/page.spec.tsx"
```
Expected: todos los tests pasan.

- [ ] **Step 7.4: Commit**

```bash
git add "apps/web/src/app/(protected)/settings/page.spec.tsx"
git commit -m "test(settings): add missing page tests (General tab, Security tab, reset, load error, loading state)"
```

---

## Task 8: Verificación final integral

- [ ] **Step 8.1: Typecheck completo del paquete web**

```bash
pnpm --filter @iwana/web typecheck
```
Expected: 0 errores nuevos introducidos por este plan.

- [ ] **Step 8.2: Lint**

```bash
pnpm --filter @iwana/web lint
```
Expected: 0 errores nuevos.

- [ ] **Step 8.3: Tests del módulo web**

```bash
pnpm --filter @iwana/web test --passWithNoTests
```
Expected: todos los tests pasan.

- [ ] **Step 8.4: Smoke test visual en el navegador**

Abrir http://localhost:3001/settings y verificar:
- Los tres tabs (General / Branding / Seguridad) son seleccionables con teclado (←/→)
- En Seguridad, los inputs de contraseña tienen toggle show/hide
- En Branding, el botón "Eliminar imagen" muestra un Dialog antes de ejecutar
- En Branding, mientras carga muestra el texto de estado con `role="status"`
- Sin errores en consola del navegador

- [ ] **Step 8.5: Actualizar informe vivo MOD00**

Registrar estos cambios en `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`:
- Fecha: 2026-06-12
- Tipo de cambio: correcciones UI/UX y accesibilidad (bloqueantes + importantes)
- Hallazgos resueltos: B-1 a B-5, I-1 a I-9 (según auditoría 2026-06-12)
- Deuda registrada: tab General pendiente de contenido funcional real (ver TODO inline)

---

## Self-review vs spec

| Hallazgo original | Task que lo resuelve | Cubierto |
|---|---|---|
| B-1 Tabs sin ARIA | Task 1 | ✅ |
| B-2 Inputs contraseña sin aria-invalid/describedby | Task 2 | ✅ |
| B-3 TOTP sin label/inputMode | Task 2 | ✅ |
| B-4 Éxito sin role="alert" (ambos componentes) | Task 2 + Task 3 | ✅ |
| B-5 Shadow hardcodeada (page.tsx + SecuritySettings) | Task 4 + Task 5 | ✅ |
| I-1 Duplicación class strings | Task 5 (SecuritySettings) | ✅ parcial — PlatformBranding no tiene este problema |
| I-2 Sin autoComplete | Task 2 | ✅ |
| I-3 Link directorio /brand/ | No incluido — requiere análisis de ruta de assets, escalar a EM-ARCH | ⚠️ Deuda documentada |
| I-4 Carga sin skeleton, formulario operable | Task 3 | ✅ |
| I-5 Estado carga MFA invisible | Task 2 | ✅ |
| I-6 Eliminar imagen sin confirmación | Task 3 | ✅ |
| I-7 Mezcla Input/@iwana/ui vs nativo | Task 2 | ✅ |
| I-8 SecuritySettings sin tests | Task 6 | ✅ |
| I-9 Tests faltantes page.spec.tsx | Task 7 | ✅ |
| M-1 CardTitle con color hardcodeado | No incluido — afecta @iwana/ui globalmente, escalar a EM-ARCH | ⚠️ Deuda documentada |
| M-2 Scroll de tabs en viewports medios | Task 1 (Tabs de @iwana/ui resuelve con overflow correcto) | ✅ |
| M-3 Input file oculto sin aria-label | Incluido en Task 3 | ✅ |
| M-4 details/summary sin aria-expanded explícito | No incluido — deuda menor, aceptable | ⚠️ Backlog |
| M-5 ProtectedLayout spinner sin role="status" | No incluido — fuera del scope de settings, deuda transversal | ⚠️ Deuda transversal |
| M-6 Overlay upload sin role="status" | Task 3 | ✅ |
| M-7 form-styles no usa tokens semánticos | No incluido — refactor mayor, requiere ADR de tokens | ⚠️ Escalar |
| M-8 h2 General sin id para aria-labelledby | Task 1 (TabsContent gestiona la asociación) | ✅ |
| M-9 defaultValues hardcodeados | Task 3 | ✅ |
| M-10 Tab General sin TODO documentado | Task 1 | ✅ |
