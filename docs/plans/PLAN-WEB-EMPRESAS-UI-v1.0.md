# PLAN-WEB-EMPRESAS-UI

**Version:** 1.0  
**Estado:** Borrador  
**Fecha:** 2026-04-30  
**Modo activo:** Sr. Developer Fullstack  
**Alcance:** `apps/web` — creación, listado y configuración de empresas

## 1. Objetivo

Normalizar la jerarquía visual de acciones en el sistema de empresas para evitar decisiones ad hoc en botones, cierres, menús, tabs, alertas y modales. Este plan es la primera semilla del futuro manual de diseño del sistema UI de iWana neXt.

## 2. Decisión de jerarquía de botones

La consistencia no significa que todos los botones midan igual. Todos deben usar la misma escala del sistema (`Button` de `@iwana/ui`), pero el tamaño y la variante dependen del rol de la acción.

| Rol de acción | Patrón | Uso esperado |
|---|---|---|
| Acción primaria de formulario | `Button primary lg` | Crear empresa, guardar configuración, guardar datos de empresa |
| Acción destructiva irreversible | `Button destructive lg` | Eliminar empresa permanentemente |
| Acción secundaria reversible | `Button secondary default` | Ver acceso inicial, regenerar credenciales, copiar contraseña |
| Cierre de modal o header | `Button ghost sm` o `Button ghost icon` | Cerrar modal sin competir con acciones finales |
| Acción de menú contextual | Item de menú | Suspender, reactivar, reintentar provisioning, ver configuración |
| Tab o segmento | Tabs/segmented control | Navegación interna de formularios |

## 3. Fase 1 ejecutada

Se aplicó una corrección de bajo riesgo sin crear nuevas primitives:

- `CredentialsModal`: el cierre pasa a acción terciaria de header (`ghost sm`) y deja de competir con la acción de copiar credencial.
- `TenantCreateForm`: `Crear empresa` pasa a `size="lg"` como CTA principal de formulario.
- `TenantSettingsForm`: `Guardar configuración`, `Guardar datos de empresa` y `Eliminar empresa permanentemente` pasan a `size="lg"`.
- `TenantsTable`: el trigger de menú de acciones usa `Button variant="ghost" size="icon"` en lugar de un botón HTML con clases custom.

## 4. Deuda técnica identificada

Estas piezas deben migrar a primitives del sistema antes de cerrar el manual UI completo:

- `Menu/ContextMenu` para acciones por empresa en tablas. **Estado:** Fase 2 implementó `DropdownMenu` base y migró `TenantsTable`.
- `Tabs` para secciones de creación/configuración de empresa. **Estado:** Fase 2 implementó `Tabs`; cierre posterior migró creación/configuración a `TabsContent`.
- `Modal/Dialog` para cierres, headers, footers y foco accesible. **Estado:** Fase 2 migró `CredentialsModal` a `Dialog` existente.
- `Alert` para mensajes informativos, advertencias y errores repetidos. **Estado:** Fase 2 implementó `Alert` base y migró alertas del flujo.
- `CheckboxCard` para booleanos con descripción en formularios. **Estado:** cierre posterior implementó la primitive y migró las políticas de seguridad.

## 4.1. Fase 2 ejecutada

Se incorporaron primitives compartidas en `@iwana/ui` y se consumieron de inmediato en el flujo de empresas:

- `Alert`: variante `neutral`, `info`, `success`, `warning` y `error`, con rol accesible por defecto y soporte opcional de icono.
- `Tabs`: raíz controlada/no controlada, `TabsList`, `TabsTrigger` con indicador de error y `TabsContent` para futuras migraciones de paneles.
- `DropdownMenu`: trigger, contenido en portal con posición fija para no quedar recortado por tablas con overflow, e items con variantes `default`, `danger`, `success` y `warning`.
- `CredentialsModal`: reemplaza overlay/card manual por `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` y `DialogClose`.
- `TenantCreateForm`: reemplaza alertas y navegación por tabs ad hoc por `Alert` y `Tabs`.
- `TenantSettingsForm`: reemplaza alertas globales, navegación por tabs y zona destructiva por primitives compartidas.
- `TenantsTable`: reemplaza menú contextual con estado/posición manual por `DropdownMenu`.

## 4.2. Fase 3 ejecutada

Se consolidó la estructura visual de formularios del flujo de empresas con primitives de `@iwana/ui`:

- `Input`: se fortaleció para soportar `label`, `helperText`, `error`, `requiredIndicator` y `containerClassName`.
- `FormPanel`: centraliza la superficie de panel de formulario con borde, fondo y sombra del sistema.
- `FormSectionTitle`: centraliza los subtítulos de sección usados dentro de formularios.
- `FormFieldset`: centraliza agrupaciones internas con `fieldset`, `legend` accesible y título visible.
- `TenantCreateForm`: reemplaza inputs, labels, hints y errores ad hoc por `Input`; reemplaza paneles manuales por `FormPanel` y títulos por `FormSectionTitle`.
- `TenantSettingsForm`: reemplaza constantes locales de input, label, error y fieldset por `Input`, `FormPanel`, `FormSectionTitle` y `FormFieldset`.

## 4.3. Cierre de deuda natural

Se resolvió la deuda explícita de Fase 3 y se completó la semántica de tabs:

- `CheckboxCard`: primitive dedicada para booleanos con texto descriptivo; migró `mfaRequiredAll`, `billing` y `mfa_required_all`.
- `Input`: se extendió con `startIcon` y `startIconClassName`; migró el buscador de `TenantsTable`.
- `TabsContent`: se integró en `TenantCreateForm` y `TenantSettingsForm`, de modo que los triggers tienen paneles reales vinculados por `aria-controls`.
- `TenantCreateSummary`: sus superficies laterales usan `FormPanel` y `FormSectionTitle`.
- Copy visible: se retiró lenguaje técnico `tenant` de mensajes de error/estado del flujo de empresa y se normalizó `Billing habilitado` a `Facturación habilitada`.

Con esto, el arreglo visual de empresas queda cerrado a nivel de código. Para cierre operativo previo a merge quedan solo validaciones de interacción visual/E2E si se requiere evidencia de navegador.

## 5. Archivos de referencia

- `packages/ui/src/components/Button.tsx`
- `packages/ui/src/components/Input.tsx`
- `packages/ui/src/components/CheckboxCard.tsx`
- `packages/ui/src/components/FormSection.tsx`
- `packages/ui/src/components/Alert.tsx`
- `packages/ui/src/components/Tabs.tsx`
- `packages/ui/src/components/DropdownMenu.tsx`
- `packages/ui/src/components/Dialog.tsx`
- `apps/web/src/components/tenants/CredentialsModal.tsx`
- `apps/web/src/components/tenants/TenantCreateForm.tsx`
- `apps/web/src/components/tenants/TenantSettingsForm.tsx`
- `apps/web/src/components/dashboard/TenantsTable.tsx`
- `docs/identity/Manual_Implementacion_Identidad_Iwana.md`

## 6. Criterios de validación

- El usuario distingue claramente acciones principales, secundarias, destructivas y cierres.
- Los cierres no compiten visualmente con acciones de guardado o eliminación.
- Todo botón interactivo conserva foco visible y nombre accesible.
- Los CTAs principales del flujo de empresas tienen tamaño consistente.
- El futuro manual UI puede derivar estas reglas sin reinterpretar decisiones.
