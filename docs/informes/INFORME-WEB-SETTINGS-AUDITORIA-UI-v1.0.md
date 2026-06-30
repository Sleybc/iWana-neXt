# INFORME — Auditoria UI/UX y Accesibilidad — `/settings` apps/web

**Version:** 1.0  
**Estado:** Activo  
**Fecha:** 2026-06-12  
**Modo activo:** Mixto (AI-SR-UI-SYS + AI-EM-ARCH)  
**Modulo:** MOD00 Configuracion Control Plane — superficie web `/settings`  
**ADR rector:** ADR-040, ADR-045  
**PRD rector:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.5)  
**HLD rector:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.6)  
**Plan de correccion:** `docs/plans/2026-06-12-web-settings-ui-audit-fixes.md`  
**Informe vivo MOD00:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.52)

---

## 1. Contexto

Auditoria visual, de accesibilidad y de deuda tecnica de la pagina de configuracion de la consola administrativa (`apps/web`, ruta `/settings`). La auditoria se realizo en dos capas:

1. **Capa visual (AI-SR-UI-SYS):** analisis contra el perfil Senior UI Systems Designer y los principios de diseno de iWana neXt (minimalismo funcional, consistencia sistemica, WCAG 2.2 AA).
2. **Capa arquitectonica (AI-EM-ARCH):** analisis de profundidad de codigo, inconsistencias en el uso del design system `@iwana/ui`, cobertura de tests y deuda tecnica estructural.

**Metodo:** navegacion en browser autenticado + snapshot a11y + analisis de codigo fuente de `page.tsx`, `SecuritySettings.tsx`, `PlatformBrandingSettings.tsx`, `form-styles.ts` y componentes de `@iwana/ui` (Tabs, Input, OtpInput, Dialog, Card).

---

## 2. Alcance auditado

| Archivo | Descripcion |
|---|---|
| `apps/web/src/app/(protected)/settings/page.tsx` | Shell de la pagina: tabs, layout y tab General |
| `apps/web/src/components/settings/SecuritySettings.tsx` | Cambio de contrasena + setup/disable MFA |
| `apps/web/src/components/settings/PlatformBrandingSettings.tsx` | Subida de activos, nombres e identidad de plataforma |
| `apps/web/src/lib/form-styles.ts` | Constantes de estilos de formularios |
| `apps/web/src/app/(protected)/settings/page.spec.tsx` | Tests de la pagina |
| `packages/ui/src/components/` (Tabs, Input, OtpInput, Dialog, Card) | Referencia del design system |

---

## 3. Resumen de hallazgos

| Severidad | ID | Descripcion | Archivo | Lineas |
|---|---|---|---|---|
| **Bloqueante** | B-1 | Tabs custom sin ARIA: sin `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"` — lectores de pantalla no anuncian la estructura | `page.tsx` | 34–52 |
| **Bloqueante** | B-2 | Inputs de contrasena en SecuritySettings sin `aria-invalid` ni `aria-describedby` vinculado al mensaje de error | `SecuritySettings.tsx` | 167–209 |
| **Bloqueante** | B-3 | Campo TOTP sin `id`, sin `<label>`, sin `aria-label`, sin `inputMode="numeric"` — uso incorrecto del `<OtpInput>` disponible en `@iwana/ui` | `SecuritySettings.tsx` | 286–293 |
| **Bloqueante** | B-4 | Bloques de exito sin `role="alert"` en ambos componentes — los lectores de pantalla no anuncian el exito de operaciones criticas (cambio de contrasena, guardado de branding) | `SecuritySettings.tsx:135`, `PlatformBrandingSettings.tsx:576` | |
| **Bloqueante** | B-5 | Shadow hardcodeada `shadow-[0_4px_24px_rgba(0,0,0,0.06)]` en lugar del token `shadow-iwana-soft` — sombra inconsistente con el sistema (negra pura vs azul noche del token) | `page.tsx:57`, `SecuritySettings.tsx:29` | |
| **Importante** | I-1 | Duplicacion de class strings equivalentes a `FORM_PANEL_CLASS` (radio 24px vs token 28px, shadow distinta) | `page.tsx:57`, `SecuritySettings.tsx:28` | |
| **Importante** | I-2 | Inputs de contrasena sin `autoComplete` — gestores de contrasenas no pueden distinguir contrasena actual de nueva | `SecuritySettings.tsx` | 167–208 |
| **Importante** | I-3 | Link a directorio `/brand/` en BrandingSlotCard expone ruta interna sin valor practico para URLs locales | `PlatformBrandingSettings.tsx` | 307–320 |
| **Importante** | I-4 | Formulario de branding operable durante carga inicial con `defaultValues` hardcodeados — el usuario puede guardar valores del codigo fuente en vez de los datos reales | `PlatformBrandingSettings.tsx` | 383–412, 371–380 |
| **Importante** | I-5 | Carga del estado MFA inicial sin indicador visible — el boton "Configurar MFA" aparece antes de confirmar que MFA no esta activo | `SecuritySettings.tsx` | 41–52 |
| **Importante** | I-6 | Eliminacion de imagen de branding sin dialogo de confirmacion — accion destructiva irreversible sin advertencia | `PlatformBrandingSettings.tsx` | 334–350 |
| **Importante** | I-7 | Mezcla sistematica de `<Input>` de `@iwana/ui` con `<input>` nativo en SecuritySettings — los inputs nativos no heredan toggle de contrasena, estados de error integrados ni accesibilidad del design system | `SecuritySettings.tsx` | 167–209, 286–347 |
| **Importante** | I-8 | `SecuritySettings` sin archivo de tests — cero cobertura para cambio de contrasena, MFA setup, MFA disable, validacion de formulario y estado inicial | — | — |
| **Importante** | I-9 | Tests faltantes en `page.spec.tsx`: Restaurar base, error de API en carga, tab Seguridad, tab General, estado de carga | `page.spec.tsx` | — |
| **Menor** | M-1 | `CardTitle` en `@iwana/ui` usa color hardcodeado `text-[#17163A]` en lugar del token `text-iwana-primary` | `packages/ui/src/components/Card.tsx:40` | |
| **Menor** | M-2 | Tres valores de radio de borde distintos (8px, 16px, 24px, 28px) sin sistema semantico de tres niveles | multiple | |
| **Menor** | M-3 | `<input type="file">` oculto en `BrandingSlotCard` sin `aria-label` ni `id` | `PlatformBrandingSettings.tsx` | 290–301 |
| **Menor** | M-4 | `<details>`/`<summary>` para URL alternativa sin indicador de estado abierto/cerrado accesible en AT limitados | `PlatformBrandingSettings.tsx` | 323–332 |
| **Menor** | M-5 | `ProtectedLayout` spinner "Validando sesion..." sin `role="status"` ni `aria-live` | `layout.tsx` | 27–31 |
| **Menor** | M-6 | Overlay de upload "Subiendo..." sin `role="status"` — lectores de pantalla no anuncian el estado de carga | `PlatformBrandingSettings.tsx` | 282–286 |
| **Menor** | M-7 | `form-styles.ts` no usa tokens semanticos de `@iwana/ui/tokens` — duplicacion de valores de color literales | `form-styles.ts` | — |
| **Menor** | M-8 | `<h2>` del tab General sin `id` para `aria-labelledby` en la seccion | `page.tsx` | 58 |
| **Menor** | M-9 | `defaultValues` de branding con strings de producto reales como fallback — riesgo de guardar valores del codigo fuente | `PlatformBrandingSettings.tsx` | 371–380 |
| **Menor** | M-10 | Tab General placeholder sin `// TODO` ni referencia a issue o ADR — deuda silenciosa | `page.tsx` | 56–66 |

---

## 4. Aciertos a preservar

| ID | Descripcion |
|---|---|
| A-1 | Vista previa en vivo de identidad de branding (`productName`, `surfaceName`) — feedback inmediato excelente para herramientas operativas |
| A-2 | Validacion de assets del lado del cliente (`validateFileAgainstRule`) con dimensiones, peso, aspecto ratio y MIME — evita uploads fallidos de forma preventiva |
| A-3 | Feedback de error con `role="alert"` e icono + color — correcto en el bloque de error (falta aplicar el mismo patron al bloque de exito) |
| A-4 | Estados `isUploading` e `isRemoving` en `BrandingSlotCard` con overlay contextual — feedback operativo claro durante acciones asincronas |

---

## 5. Checklist de review visual (Perfil AI-SR-UI-SYS, Seccion 13)

| Criterio | Estado | Notas |
|---|---|---|
| Patrones aprobados, sin estilos aislados | ⚠️ Parcial | SecuritySettings no usa `<Input>` de `@iwana/ui` |
| Accion primaria clara | ✅ | Guardar cambios / Actualizar contrasena son las CTA primarias claras |
| Estados loading/empty/error/disabled definidos | ⚠️ Parcial | Branding: carga sin deshabilitar formulario; Seguridad: carga MFA invisible |
| Responsive sin romper jerarquia ni acciones | ⚠️ Parcial | Tabs con scroll horizontal indeseado en viewports medios sin @iwana/ui |
| Contraste WCAG 2.2 AA | ✅ | Tokens `iwana-primary` son accesibles |
| Foco visible en controles interactivos | ⚠️ Parcial | Present en Tabs de @iwana/ui; inputs nativos de SecuritySettings tienen `focus:ring-2` pero no `focus-visible:ring-2` |
| Texto visible en espanol, sentence case | ✅ | Correcto en toda la pagina |
| Sin enums crudos ni labels tecnicos internos | ✅ | Correcto |
| Sin PII innecesaria | ✅ | Correcto |
| Densidad visual escaneable | ⚠️ Parcial | Tab General desperdicia espacio vertical con solo texto informativo |
| Diseno no depende de decoracion para comunicar estructura | ⚠️ Parcial | Tres radios de borde distintos introducen inconsistencia decorativa |

---

## 6. Analisis documental — documentos a actualizar o crear

### 6.1 Documentos existentes a actualizar

| Documento | Version actual | Accion requerida | Prioridad |
|---|---|---|---|
| `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | 1.51 → 1.52 (hecho) | Registro de auditoria y hallazgos — entrada v1.52 agregada | Alta |
| `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | 1.5 | Actualizar seccion de criterios UI/frontend: documentar que los tabs deben usar `@iwana/ui/Tabs` con ARIA completo; documentar el tab General como deuda funcional pendiente de contenido real con referencia al TODO inline | Media |
| `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | 1.6 | Verificar y actualizar la lista de componentes de `@iwana/ui` usados en la superficie web; añadir `OtpInput` y `Dialog` como componentes activos; actualizar seccion de accesibilidad si existe | Media |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md` | 1.1 | Agregar criterios de accesibilidad UI especificos: tabs con ARIA correcto, inputs con aria-describedby, role="alert" en feedbacks, role="status" en cargas, confirmacion de acciones destructivas | Media |

### 6.2 Documentos nuevos a crear

| Documento propuesto | Tipo | Justificacion | Prioridad | Requiere aprobacion |
|---|---|---|---|---|
| `docs/plans/2026-06-12-web-settings-ui-audit-fixes.md` | Plan | Plan ejecutable con 8 tasks y ~30 pasos para corregir todos los hallazgos bloqueantes e importantes — **creado** | Alta | No (plan de ejecucion) |
| `docs/informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md` | Informe | Este documento — trazabilidad standalone de la auditoria | Alta | No |
| `docs/adrs/ADR-046-Normalizacion-Tokens-Visuales-Settings.md` | ADR (propuesto) | Formalizar: (1) uso de tokens de sombra semanticos (`shadow-iwana-*`) en toda la codebase; (2) radio de borde semantico de tres niveles en `@iwana/ui` y `form-styles.ts`; (3) decision sobre `CardTitle` con color hardcodeado. Requiere escalacion EM-ARCH → CTO | Media | Si — EM-ARCH / CTO |
| `docs/quality/CHECKLIST-TRANSVERSAL-WEB-UI-ACCESIBILIDAD-v1.0.md` | Checklist | Checklist reutilizable para auditorias de accesibilidad WCAG 2.2 AA en `apps/web` y `apps/portal`: ARIA, contraste, foco, navegacion por teclado, estados de carga, feedbacks accesibles | Media | No |

### 6.3 Documentos que NO requieren accion en este ciclo

| Documento | Justificacion |
|---|---|
| `docs/adrs/ADR-040` y `ADR-045` | No hay conflicto con lo auditado; la auditoria es coherente con sus decisiones |
| `docs/specs/2026-05-30-mod00-settings-hub-redesign-design.md` | El rediseno del hub de configuracion empresarial es del portal (`apps/portal`), no de `apps/web` |
| `docs/prompts/PROMPT-MOD00-*` | Los prompts de ejecucion de fases anteriores no se modifican — son artefactos historicos de fases ya cerradas |
| `docs/prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md` | Aplica al portal, no a la superficie web auditada |

---

## 7. Deuda documentada — pendiente de proxima fase o ADR

| ID | Hallazgo | Accion recomendada | Escala |
|---|---|---|---|
| D-1 | Link a directorio `/brand/` en BrandingSlotCard | Analizar si aplica solo a rutas locales; si hay CDN, mostrar URL completa sin enlace | EM-ARCH |
| D-2 | `CardTitle` con `text-[#17163A]` hardcodeado en `@iwana/ui` | Incluir en ADR-046 de normalizacion de tokens | EM-ARCH / CTO |
| D-3 | `form-styles.ts` sin tokens semanticos | Incluir en ADR-046; refactor coordinado con @iwana/ui | EM-ARCH / CTO |
| D-4 | `<details>`/`<summary>` del campo URL alternativa | Backlog de UX — deuda aceptable, no bloquea funcionalidad | Backlog |
| D-5 | `ProtectedLayout` spinner sin `role="status"` | Deuda transversal — afecta todos los modulos, no solo settings | Siguiente sprint transversal |
| D-6 | Tab General sin contenido real | Definir en proxima fase de MOD00 (perfil del usuario administrador, preferencias operativas) | EM-ARCH — PRD-MOD00 seccion 4.3 |

---

## 8. Estado final del plan de correccion

| Task | Descripcion | Estado |
|---|---|---|
| Task 1 | Migrar tabs a `@iwana/ui/Tabs` con ARIA completo | **Completado** |
| Task 2 | Migrar SecuritySettings inputs + TOTP + role="alert" + carga MFA | **Completado** |
| Task 3 | PlatformBrandingSettings: deshabilitar durante carga, Dialog confirmacion, role="alert", tokens | **Completado** |
| Task 4 | Normalizar shadow y Card-in-Card en `page.tsx` | **Completado** |
| Task 5 | Normalizar shadow en `SecuritySettings.tsx` | **Completado** |
| Task 6 | Crear `SecuritySettings.spec.tsx` (16 tests) | **Completado** |
| Task 7 | Completar `page.spec.tsx` (11 tests, incluye Dialog de confirmacion) | **Completado** |
| Task 8 | Verificacion final (typecheck limpio, lint limpio, 27/27 tests, smoke visual browser) | **Completado** |

**Evidencia de cierre (2026-06-12):**
- `pnpm --filter @iwana/web typecheck` — 0 errores
- `pnpm --filter @iwana/web lint` — 0 errores
- Tests settings: 27/27 en verde (11 page.spec + 16 SecuritySettings.spec)
- Smoke visual: tabs con role="tab" + selected confirmados en a11y tree; Dialog de confirmacion activo con focus trap; inputs de contrasena con toggle show/hide; sin errores en consola del browser

**Estado del informe:** Cerrado v1.0 — 2026-06-12
