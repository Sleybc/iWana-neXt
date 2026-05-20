# Profile Settings Card Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Reestructurar las pantallas de perfil y configuración del dashboard para que cada bloque funcional tenga su propia card con acciones visibles y alineación consistente con el header de página.

**Architecture:** Se mantendrá la lógica funcional existente y se cambiará solo la composición visual. `PageHeader` y el contenido principal compartirán el mismo ancho útil, mientras que `ProfileForm` y `SecuritySettings` se reorganizarán en subsecciones autocontenidas con header, body y footer de acciones, evitando que los botones queden ocultos o fuera de contexto.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, `@iwana/ui`, React Hook Form, Zod.

---

### Task 1: Alinear el header de página con el contenido

**Files:**

- Modify: `apps/web/src/components/layout/PageHeader.tsx`
- Modify: `apps/web/src/app/(protected)/profile/page.tsx`
- Modify: `apps/web/src/app/(protected)/settings/page.tsx`

**Step 1: Inspeccionar el layout actual**

Revisar cómo `PageHeader` aplica `mx-6`/`px-6` y cómo las páginas envuelven las cards.

**Step 2: Ajustar `PageHeader` para reutilizar un contenedor consistente**

Cambiar la estructura para que el ancho útil del header coincida con las cards debajo. Evitar sumar márgenes laterales duplicados dentro del propio componente.

**Step 3: Ajustar las páginas para usar el mismo gutter**

Hacer que `profile/page.tsx` y `settings/page.tsx` apliquen el contenedor lateral una sola vez y que tanto header como cards hereden esa misma referencia visual.

**Step 4: Verificar visualmente en código**

Confirmar que el borde izquierdo del banner y el de las cards arrancan desde la misma coordenada lógica.

### Task 2: Convertir perfil en card autocontenida con footer de acciones

**Files:**

- Modify: `apps/web/src/components/profile/ProfileForm.tsx`
- Modify: `apps/web/src/app/(protected)/profile/page.tsx`

**Step 1: Mantener la lógica del formulario existente**

No cambiar validaciones, payloads ni comportamiento de guardado.

**Step 2: Reestructurar `ProfileForm` con layout de card interna**

Separar:

- header de sección,
- body con campos,
- footer con acción primaria visible a la derecha.

**Step 3: Hacer que el botón quede siempre visible al final del bloque**

Usar un contenedor de footer con borde superior sutil o separación clara para que `Guardar cambios` no quede mezclado con el grid de inputs.

**Step 4: Simplificar la página contenedora**

Evitar duplicar header de sección en `profile/page.tsx` si `ProfileForm` ya lo renderiza como card completa.

### Task 3: Convertir configuración en varias cards funcionales

**Files:**

- Modify: `apps/web/src/components/settings/SecuritySettings.tsx`
- Modify: `apps/web/src/app/(protected)/settings/page.tsx`

**Step 1: Mantener la lógica actual de contraseña y MFA**

No cambiar requests ni estados de negocio; solo redistribuir el layout.

**Step 2: Crear una card autónoma para `Cambiar contraseña`**

La card debe tener:

- título,
- inputs,
- footer con botón `Actualizar contraseña` alineado a la derecha.

**Step 3: Crear una card autónoma para `MFA`**

La card debe contener:

- estado actual,
- CTA principal (`Configurar MFA`) cuando aplique,
- bloque de QR/verificación,
- bloque de deshabilitación,
- acciones alineadas a la derecha dentro de su contexto.

**Step 4: Evitar grids que empujen botones fuera del viewport**

Si hace falta, separar inputs y botones en filas distintas para mantener legibilidad en desktop y mobile.

**Step 5: Simplificar la página contenedora**

Si `SecuritySettings` ya renderiza cards completas, quitar la card padre de `settings/page.tsx` para evitar una caja dentro de otra sin valor visual.

### Task 4: Verificación

**Files:**

- Verify: `apps/web/src/components/profile/ProfileForm.tsx`
- Verify: `apps/web/src/components/settings/SecuritySettings.tsx`
- Verify: `apps/web/src/components/layout/PageHeader.tsx`

**Step 1: Ejecutar typecheck web**

Run: `pnpm --filter @iwana/web typecheck`

Expected: PASS sin errores TS.

**Step 2: Verificar layout funcionalmente**

Si hay servidor disponible, comprobar que:

- el botón `Guardar cambios` aparece en perfil,
- el botón `Actualizar contraseña` aparece en configuración,
- las acciones MFA son visibles,
- header y cards quedan alineados en el eje izquierdo.

**Step 3: Actualizar informe documental**

Modificar `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md` para dejar trazabilidad del ajuste UI de perfil/configuración.
