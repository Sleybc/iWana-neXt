# Review UI — Plataforma / settings (`apps/web` `/settings`)

**Versión:** 1.0  
**Estado:** Activo — auditoría pre-G2 reconciliada A+B (2026-08-11)  
**Fecha:** 2026-08-11  
**Emite:** protocolo v1.5 · Track A AI-PROD-UX · Track B AI-DS-OWNER  
**Prompt:** [`PROMPT-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../prompts/PROMPT-WEB-SETTINGS-AUDITORIA-UI-v1.0.md)  
**Supersede:** cierre de remediación 2026-06-12 (tabs `@iwana/ui`, `Input`/`OtpInput`, `role="alert"`, Dialog de borrado). Ese trabajo sigue en código; esta revisión mide alineación Firma iWana / vocabulario / DS frente al baseline vivo (Empresas, Historial, centro de control).  
**Reconciliación:** Track B fijó formato DS + hallazgos Identidad/Primitives/Accesibilidad (puntaje 67). Track A enriquece matriz copy, separa P1/P2 de vocabulario y completa CA-SET-09…12 **sin borrar** hallazgos DS de B.

---

## Resumen ejecutivo

Pantalla de **configuración** (settings): el operador administra identidad visual de la consola y su propia seguridad de acceso (contraseña + verificación en dos pasos). La cáscara (`PageHeader` + `Card` + `Tabs` de `@iwana/ui`) y el dark (`dark-surface-*`) están en regla; el script mecánico sale limpio. El daño combinado es **vocabulario técnico** (MFA/TOTP/Authenticator; chrome «Gobierno»; «Superficie»/metadata/slot/fallback; errores «No fue posible…»), **doble cáscara** Seguridad dentro del Card de página, **Alert ad hoc** (`FORM_ALERT_*`) frente a `Alert` ya usado en Empresas/tenant forms, y **foco / loading** del slot de activos.

**Modo:** código  
**Script:** `audit-ui.mjs` sobre `apps/web/src/app/(protected)/settings` + `apps/web/src/components/settings` → **0 deterministas, 0 heurísticos**. No cubre copy, Alert vs FORM_ALERT, card-in-card ni foco custom.  
**Puntaje:** **44/100** (P0: 0, P1: 4, P2: 5, P3: 1)  
**Banda:** &lt; 50 — no cumple calidad mínima de vocabulario + identidad hasta remediación; carril rápido sigue viable (0 primitives nuevas).  
**Delta vs B solo-DS (67):** −23 por 2 P1 vocab + 1 P2 copy añadidos en reconciliación A (fórmula skill).

---

## Hallazgos críticos (P0)

Ninguno.

---

## Hallazgos

### [P1][Vocabulario] Jerga MFA / TOTP / Authenticator en UI

- **Evidencia:** `SecuritySettings.tsx:206-210` («Autenticación de dos factores (MFA)», «código TOTP»); `:86` («app Authenticator»); `:99-115` / `:230` / `:239` / `:269` / `:278-303` (rótulos, estados y CTAs con «MFA»); `:220` («Verificando estado MFA…»). Canon vivo: `platform-ui-copy.ts:141,161-165,197-201` («Verificación en dos pasos» en Historial).
- **Impacto:** El operador recibe jerga de implementación en la tarea de seguridad personal; rompe el canon y la continuidad con el historial de cambios.
- **Recomendación:** Matriz copy → `PLATFORM_UI_COPY.settings.security*`. Título «Verificación en dos pasos»; «aplicación autenticadora»; «código de verificación»; CTAs Activar / Confirmar / Desactivar. (Branding/chrome → hallazgos P1 siguientes.)
- **Esfuerzo:** S–M  
- **Track:** A (PROD-UX)

### [P1][Vocabulario] Chrome «Gobierno…» + subtítulo branding/parámetros

- **Evidencia:** `page.tsx:21-22` — H1 `Plataforma` (coherente con `PLATFORM_UI_COPY.navigation.settings`) + subtítulo «Administra branding, seguridad global y parámetros compartidos de la consola interna.»; `:27` — CardTitle `Gobierno y configuración global`; `:40-52` — tab General: prosa «decisiones globales de plataforma», «branding», «parámetros compartidos» sin controles.
- **Impacto:** Tono de control plane interno; el subtítulo y el CardTitle no describen la tarea (identidad + seguridad de acceso). El tab General añade carga cognitiva sin acción.
- **Recomendación:** Subtítulo corto orientado a tarea (ej. «Identidad de la consola y seguridad de tu acceso.»). Quitar o reemplazar CardTitle («Configuración» / solo H1). Preferir **dos tabs** (Identidad | Seguridad) y absorber el deslinde a Empresas en el subtítulo; si se mantiene General, una frase + enlace, no tres párrafos.
- **Esfuerzo:** S  
- **Track:** A

### [P1][Vocabulario] «Superficie», metadata y anglicismos del formulario de identidad

- **Evidencia:**
  - Tab `Branding` — `page.tsx:34`; H2 `Branding de plataforma` — `PlatformBrandingSettings.tsx:616-620`.
  - Label + preview `Superficie` — `:759-761`, `:784-787`; Zod `:51` («La superficie debe…»).
  - Help favicon «metadata pública» — `:695`; help nombres «superficies públicas del navegador» — `:748`.
  - Feedback «Branding…», «activo de branding», «fallback base», «slot» — `:428,493,497,508,512,543,547,584,589`.
- **Impacto:** «Superficie» / «metadata» / «slot» / «fallback» / «activo» / «branding» son jerga DS o anglicismos; el operador necesita nombres de consola y pestaña.
- **Recomendación:** Tab/H2 `Identidad` (o «Identidad visual»). Labels: `Producto` (ok), `Nombre en la consola`, `Título de pestaña`, `Descripción corta`. Feedback sin branding/slot/fallback.
- **Esfuerzo:** S–M  
- **Track:** A

### [P1][Accesibilidad] Slot de activo sin anillo de foco visible

- **Evidencia:** `PlatformBrandingSettings.tsx:270-274` — `<button>` de vista previa/subida con hover de borde y overlay `group-focus-visible:opacity-100`, **sin** `interactiveFocusClassName` ni `focus-visible:ring-*`.
- **Impacto:** Control primario del flujo de logo/favicon/fondos: el teclado no recibe anillo de foco (regla dura iWana / WCAG 2.4.7).
- **Recomendación:** Añadir `interactiveFocusClassName` de `@iwana/ui` al botón del slot (y, si se mantiene, al `<summary>` de opciones avanzadas `:323-325`).
- **Esfuerzo:** S  
- **Track:** B → remediación FE

### [P2][Copy] Errores «No fue posible…» y éxitos «…correctamente»

- **Evidencia:**
  - Seguridad: `SecuritySettings.tsx:71,88,101,115` — «No fue posible…»; `:99,113` — «MFA habilitado/deshabilitado correctamente.»; `:69` — éxito de contraseña con recomendación larga.
  - Branding: `PlatformBrandingSettings.tsx:428,497,512,547,589,652` — «No fue posible cargar/guardar/…».
  - Canon vivo: `PLATFORM_UI_COPY` Empresas/Historial — `No pudimos… Reintenta en unos minutos.`; éxitos breves (`Empresa suspendida.`).
- **Impacto:** Misma consola, dos gramáticas de fallo; «No fue posible» no orienta el siguiente paso.
- **Recomendación:** Fallbacks en `PLATFORM_UI_COPY.settings`; éxitos `Contraseña actualizada.` / `Verificación en dos pasos activada.` / `Identidad guardada.` Primitive visual → hallazgo Alert (B).
- **Esfuerzo:** S  
- **Track:** A

### [P2][Identidad] Card dentro de card en Seguridad (sombra dual duplicada)

- **Evidencia:** `page.tsx:25-28` — `Card` (trae `shadow-iwana-card` + `rounded-2xl`); `SecuritySettings.tsx:25-26` / `:141` — `securityPanelClass` = otro `rounded-2xl` + `border` + `shadow-iwana-soft` + `bg-white` anidado.
- **Impacto:** Doble profundidad en la misma vista; diluye la sombra dual como única técnica de elevación y densifica sin ganar tarea.
- **Recomendación:** Una sola cáscara. Quitar panel exterior de Seguridad (solo `space-y` + secciones) **o** montar Seguridad sin Card de página en ese tab. Iconos de sección: sustituir `shadow-sm` (`:144`, `:198`) por reposo sin sombra o `shadow-iwana-soft` si hace falta elevación.
- **Esfuerzo:** S  
- **Track:** B

### [P2][Primitives] Feedback con `FORM_ALERT_*` en vez de `Alert`

- **Evidencia:** `SecuritySettings.tsx:128-138` + `FORM_ALERT_*` desde `form-styles.ts:18-25` (gradientes `linear-gradient(...)`, `rounded-[24px]`); `PlatformBrandingSettings.tsx:600-610`, `:633`. Canónico vivo: `TenantSettingsForm.tsx` / `TenantCreateForm.tsx` / dashboard usan `Alert` de `@iwana/ui` (`rounded-2xl`, tokens semánticos, sin gradiente local).
- **Impacto:** Dos pieles de alerta en la misma consola; radios y fondos arbitrarios fuera del set de superficie.
- **Recomendación:** `Alert` + `variant="error|success|info"` + icono Lucide. No crear primitive nueva. (Copy de mensajes → Track A / matriz.)
- **Esfuerzo:** S  
- **Track:** B

### [P2][Identidad] Superficies de apoyo `gray-50` / `rounded-lg` vs `iwana-surface-soft` / `rounded-2xl`

- **Evidencia:** `PlatformBrandingSettings.tsx:266` (`BrandingSlotCard`: `rounded-lg … bg-gray-50/80`); `:742` (sección «Nombres e identidad», mismo patrón); `SecuritySettings.tsx:27-28` (`securityInnerSectionClass`: `bg-gray-50/60`). Contraste positivo en la misma página: tab General `page.tsx:41` ya usa `rounded-2xl` + `bg-iwana-surface-soft/70` + `dark:bg-dark-surface-3/70`.
- **Impacto:** Misma familia settings, dos gramáticas de pozo; radios `lg` en superficie operativa (canon: `2xl` superficie / `xl` control).
- **Recomendación:** Unificar a `iwana-surface-soft` (o `FORM_SECTION_CARD_CLASS` alineado a soft + `rounded-2xl`) y dark `dark-surface-3`. Controles de dropzone: `rounded-xl`.
- **Esfuerzo:** S  
- **Track:** B

### [P2][Estados] Carga sin skeleton con forma; campos editables durante fetch

- **Evidencia:** `PlatformBrandingSettings.tsx:625-628` — solo texto «Cargando branding…»; el `<form>` (`:664+`) permanece montado con campos editables (solo CTAs `disabled={isLoadingData}` en `:813-821`). `SecuritySettings.tsx:219-221` — «Verificando estado MFA…» sin reserva de layout. Referencia viva: `TenantSettingsForm.tsx` ~`:241` skeleton `h-11 animate-pulse`.
- **Impacto:** Layout shift y sensación de formulario vacío editable; no es spinner bloqueante (P3), pero incumple “skeleton con forma” en vista con datos remotos.
- **Recomendación:** Skeleton de grilla de slots + campos (o `fieldset disabled` / `aria-busy` mientras `isLoadingData`); MFA: placeholder de estado con altura fija. Sin primitive nueva.
- **Esfuerzo:** S–M  
- **Track:** B

### [P3][Identidad] Eyebrow ad hoc en vista previa

- **Evidencia:** `PlatformBrandingSettings.tsx:778-798` — `text-xs uppercase tracking-[0.12em] text-gray-400` en `<dt>` de preview.
- **Impacto:** Letter-spacing arbitrario; el sistema ya expone `.portal-eyebrow` / `.portal-eyebrow-muted` en `globals.css`.
- **Recomendación:** Clase de eyebrow del sistema; sin `tracking-[…]` local.
- **Esfuerzo:** S  
- **Track:** B

**Agregado (fuera de presupuesto P2/P3 detallado):** URI `otpauth` visible en camino feliz (`SecuritySettings.tsx:245-247`); ayudas MIME/`Reglas:` en slots (`PlatformBrandingSettings.tsx:87-106`, `:319`); help contraseña con «credencial»/«política» (`SecuritySettings.tsx:154-156`) — cubiertos en matriz + CA-SET-09/10/12.

---

## Hallazgos de identidad / DS (Track B — AI-DS-OWNER)

| Tema | Veredicto | Notas |
| --- | --- | --- |
| Script `audit-ui.mjs` | OK | 0 hallazgos; dark sin `dark:bg-gray-{700-950}` |
| Tokens de marca | OK | Sin hex de marca en settings; `text-iwana-primary` en títulos |
| Dark | OK | `dark-surface-*` / `dark-border` en page, branding y seguridad |
| PageHeader + Tabs `@iwana/ui` | OK | Cáscara alineada post-remediación 2026-06 |
| Lima / urgencia | OK | Sin lima como alerta |
| Shadow dual | Deuda P2 | Bien en Card; mal duplicada en panel Seguridad; `shadow-sm` en iconos |
| Superficies | Deuda P2 | General = soft; branding/seguridad interna = `gray-50` + `rounded-lg` |
| Alert | Deuda P2 | `FORM_ALERT_*` paralelo a `Alert` |
| Foco | Deuda P1 | Slot de upload sin ring |
| Loading | Deuda P2 | Texto plano; sin skeleton |
| Primitives nuevas | **0 esperadas** | Remediación = composición de `Alert`, `interactiveFocusClassName`, tokens soft/2xl, skeleton local |
| Contrato DS congelado | **No** en este prompt | G2 siguiente |

**ui-ux-pro-max (subordinada):** se adoptan foco visible, target ≥44px (`min-h-11` vía `Button`/`size="lg"`) y feedback de carga; se descartan paletas/estilos genéricos ajenos a Firma iWana.

---

## Quick wins

1. `interactiveFocusClassName` en botón de `BrandingSlotCard` (+ summary si aplica).
2. Sustituir `FORM_ALERT_*` → `Alert` en Seguridad y Branding.
3. Eliminar `securityPanelClass` anidado (una cáscara).
4. Pozos branding/MFA → `iwana-surface-soft` + `rounded-2xl`.
5. Copy MFA / chrome / Superficie / errores → matriz A / `PLATFORM_UI_COPY.settings`.

---

## Mejoras estratégicas

- Consolidar `FORM_ALERT_*` de `apps/web/src/lib/form-styles.ts` hacia `Alert` en auth y settings (transversal; no bloquea carril rápido de `/settings`).
- No promover primitive nueva de “settings panel”: sobra con `Card` + secciones soft.
- Decidir tab General (preferencia A: retirar; deslinde en subtítulo).
- **No** congelar contrato DS en este informe (prompt: solo auditoría).

---

## Matriz de copy (Track A — reconciliada)

| Zona | Actual (evidencia) | Propuesto | Notas |
| --- | --- | --- | --- |
| **Nav** | Plataforma (`platform-ui-copy.ts:7`) | Sin cambio | Ya canónico |
| **PageHeader title** | Plataforma (`page.tsx:21`) | Plataforma (leer de `navigation.settings`) | OK vs nav |
| **PageHeader subtitle** | Administra branding, seguridad global y parámetros compartidos… (`page.tsx:22`) | Identidad de la consola y seguridad de tu acceso. | Quitar branding/parámetros |
| **CardTitle** | Gobierno y configuración global (`page.tsx:27`) | Configuración · o eliminar (H1 basta) | «Gobierno» = jerga interna |
| **Tab General** | General (`page.tsx:33`) + prosa `:42-52` | Retirar tab · o «Resumen» solo con acciones | Preferencia A: 2 tabs |
| **Tab Branding** | Branding (`page.tsx:34`) | Identidad | Evitar anglicismo crudo |
| **Tab Seguridad** | Seguridad (`page.tsx:35`) | Seguridad | OK |
| **General body** | Decisiones globales… branding… parámetros… (`page.tsx:42-52`) | Absorber: «La configuración de cada empresa está en Empresas.» | Sin «tenant» |
| **Branding H2** | Branding de plataforma (`PlatformBrandingSettings.tsx:616`) | Identidad de la consola | |
| **Branding help** | …sin mezclar este branding… (`:618-620`) | Logo, fondos de acceso y nombres públicos. No cambia la identidad de cada empresa. | |
| **Carga branding** | Cargando branding… (`:627`) | Cargando identidad de la consola… | + skeleton (B) |
| **Sección assets** | Activos visuales principales (`:669`) | Imágenes de la consola | |
| **Logo** | Logo de consola (`:679`) | Logo de consola | OK |
| **Favicon help** | …login y metadata pública. (`:695`) | …pestañas del navegador y pantalla de acceso. | Sin «metadata» |
| **Fondos** | Fondo de login — modo claro/oscuro (`:709-725`) | Fondo de acceso — modo claro/oscuro | Preferir «acceso» |
| **Producto** | Producto (`:754`) | Producto | OK |
| **Superficie** | Superficie (`:759`, preview `:784`, Zod `:51`) | Nombre en la consola | Evitar «superficie» técnico |
| **Título público** | Título público (`:764`) | Título de pestaña | |
| **Descripción pública** | Descripción pública (`:769`) | Descripción corta | |
| **Preview dt** | Superficie / Título en navegador (`:784-791`) | Nombre en la consola / Título de pestaña | Sentence case; eyebrow sistema (B) |
| **Opciones avanzadas** | Opciones avanzadas del activo (`:326`) | Opciones avanzadas de la imagen | |
| **Dialog eliminar** | …fallback base de la plataforma… (`:355-356`) | Se usará la imagen por defecto de la plataforma. | |
| **CTA eliminar** | Eliminar imagen / Sí, eliminar (`:348,374`) | Sin cambio de sentido | OK |
| **Restaurar** | Restaurar base (`:816`) | Restaurar valores por defecto | |
| **Guardar** | Guardar cambios (`:824`) | Guardar cambios | OK |
| **Éxito guardar** | Branding de plataforma actualizado. (`:493`) | Identidad guardada. | Sin «correctamente» |
| **Éxito reset** | Branding base restaurado. (`:508`) | Valores por defecto restaurados. | |
| **Éxito upload** | Activo subido y aplicado al branding. (`:543`) | Imagen aplicada. | |
| **Éxito remove** | …fallback base… (`:584`) | Imagen eliminada. Se usa la imagen por defecto. | |
| **Error carga** | No fue posible cargar el branding… (`:428`, `:652`) | No pudimos cargar la identidad de la consola. Reintenta en unos minutos. | Patrón Empresas |
| **Error guardar** | No fue posible guardar el branding… (`:497`) | No pudimos guardar la identidad. Reintenta en unos minutos. | |
| **Error upload** | No fue posible subir el activo… (`:547`) | No pudimos subir la imagen. Reintenta en unos minutos. | |
| **Error slot** | …imagen del slot. (`:589`) | No pudimos eliminar la imagen. Reintenta en unos minutos. | Sin «slot» |
| **Ayuda MIME** | Reglas: PNG/JPG… + MIME en error (`:87-106`, `:178`, `:319`) | PNG, JPG o WEBP · máx. 1 MB · mín. 240×60. | Sin MIME IANA al usuario |
| **Seguridad H2 password** | Cambiar contraseña (`:152`) | Cambiar contraseña | OK |
| **Help password** | credencial… política… primer ingreso (`:154-156`) | Cambia la contraseña con la que entras a la consola. | |
| **CTA password** | Actualizar contraseña (`:188`) | Actualizar contraseña | OK |
| **Éxito password** | Contraseña cambiada. Se recomienda… (`:69`) | Contraseña actualizada. | Breve |
| **Error password** | No fue posible cambiar la contraseña. (`:71`) | No pudimos cambiar la contraseña. Reintenta en unos minutos. | |
| **Seguridad H2 MFA** | Autenticación de dos factores (MFA) (`:206`) | Verificación en dos pasos | Canon |
| **Help MFA** | segundo factor… TOTP (`:208-210`) | Añade un código de tu teléfono al iniciar sesión. | Una sola ayuda |
| **Estado MFA** | Habilitado / Deshabilitado / Verificando estado MFA (`:219-221`) | Activada / Desactivada / Comprobando verificación en dos pasos… | |
| **CTA setup** | Configurar MFA (`:230`) | Activar verificación en dos pasos | |
| **Mensaje post-setup** | Authenticator… TOTP (`:86`) | Escanea el código QR con tu app de autenticación e ingresa el primer código. | |
| **QR title / alt** | …MFA (`:239,242`) | Código QR para la app de autenticación | |
| **URI otpauth** | Visible en claro (`:245-247`) | Solo en opciones avanzadas · o ocultar | Camino feliz = QR |
| **Confirmar** | Verificar MFA (`:269`) | Confirmar código | |
| **Disable H3 / CTA** | Deshabilitar MFA (`:278,303`) | Desactivar verificación en dos pasos | |
| **Label código** | Código MFA (`:293`) | Código de verificación | |
| **Help disable** | Para deshabilitar MFA… (`:280-282`) | Confirma tu contraseña y un código de tu app de autenticación. | |
| **Éxito MFA on/off** | MFA … correctamente. (`:99,113`) | Verificación en dos pasos activada. / …desactivada. | |
| **Errores MFA** | No fue posible … MFA (`:88,101,115`) | No pudimos… Reintenta en unos minutos. | |

---

## Criterios de aceptación (si se remedia)

| ID | Criterio |
| --- | --- |
| **CA-SET-01** | Cero «MFA», «TOTP», «Authenticator» y «branding» crudo en copy visible de `/settings`. |
| **CA-SET-02** | Feedback success/error/info usa `Alert` de `@iwana/ui` (no `FORM_ALERT_*` en esta superficie). |
| **CA-SET-03** | Una sola cáscara con sombra: sin panel `shadow-iwana-*` anidado bajo el `Card` de página. |
| **CA-SET-04** | Pozos de apoyo = `iwana-surface-soft` (+ dark-surface); superficies `rounded-2xl`; controles `rounded-xl`. |
| **CA-SET-05** | Botón de slot de activo con `interactiveFocusClassName` (foco visible teclado). |
| **CA-SET-06** | Carga inicial de branding: skeleton con forma o formulario no editable (`disabled`/`aria-busy`); sin solo texto suelto. |
| **CA-SET-07** | Eyebrows de preview con `.portal-eyebrow` / muted; sin `tracking-[…]` local. |
| **CA-SET-08** | Copy de pantalla en `PLATFORM_UI_COPY` (o helper settings); nav permanece «Plataforma». |
| **CA-SET-09** | Cero «Gobierno y configuración global»; subtítulo sin «parámetros»/«branding»; tab General retirado o sin prosa triple. |
| **CA-SET-10** | Cero «Superficie», «metadata», «slot», «fallback» en labels/mensajes de producto; tab sin anglicismo Branding. |
| **CA-SET-11** | Errores recuperables: `No pudimos… Reintenta en unos minutos.`; éxitos breves sin «correctamente». |
| **CA-SET-12** | Tests unitarios de settings esperan el vocabulario nuevo (CA-SET-01, 09–11); URI `otpauth` fuera del camino feliz. |

---

## Deslinde

| Superficie | En alcance |
| --- | --- |
| `apps/web` `/settings` | **Sí** |
| `apps/portal` settings | **No** |
| `apps/web` `/tenants/[id]/settings` | **No** (salvo mención: `TenantSettingsForm` es referencia de `Alert` + skeleton) |
| Sidebar / shell | **No** |

---

## Por verificar

1. Contraste runtime del overlay `bg-black/40` + texto blanco en slot (AA en hover/focus) — no medido en browser en este track.
2. ~~Si Track A añade P1 de jerarquía / vocabulario: recalcular puntaje~~ — **hecho** en reconciliación A (44/100); hallazgos DS de B intactos.
3. `OtpInput`: a11y interna de `@iwana/ui` — no re-auditar si el primitive ya cubre label/ARIA.

---

## Veredicto

**Aprobada con cambios.**

No requiere rediseño de información: la tarea (identidad + seguridad personal) está en el lugar correcto. Bloqueantes de cierre: **CA-SET-01**, **CA-SET-05**, **CA-SET-09**, **CA-SET-10**, **CA-SET-11**; resto quick wins del mismo ajuste.

### Remediación posterior viable por carril rápido: **SÍ**

- No altera alcance de producto, contrato de datos, boundaries ni tokens de marca.
- **0 primitives nuevas esperadas** — solo composición: `Alert`, `interactiveFocusClassName`, tokens `iwana-surface-soft` / `rounded-2xl`, skeleton local ya visto en tenant settings.
- Copy → Track A (matriz arriba); implementación → FE-PLATFORM bajo prompt G2→G4 (contrato DS aún **no** congelado).
- Sin `[BLOQUEO]`.

---

## Tracks

| Rol | Dictamen |
| --- | --- |
| AI-PROD-UX (A) | Owner INFORME + matriz copy. Reconciliación: +2 P1 vocab (chrome, Superficie) + 1 P2 copy (errores); MFA P1 acotado; CA-SET-09…12. DS de B **intacto**. |
| AI-DS-OWNER (B) | GO carril rápido. Firma no rota (dark/script OK). Deuda: Alert, card-in-card, soft vs gray-50, foco slot, loading. |
| Siguiente (EM-ARCH) | Tras score: prompt alineación G2→G4 si se exige; congelar UX/DS specs **después** de este informe. |

## Puntaje (fórmula skill)

`Puntaje = max(0, 100 − 20·P0 − 10·P1 − 3·P2 − 1·P3)`

| Conteo | Valor |
| --- | --- |
| P0 | 0 |
| P1 | 4 (MFA · chrome Gobierno · Superficie/branding form · foco slot) |
| P2 | 5 (errores copy · card-in-card · FORM_ALERT · gray-50/lg · loading) |
| P3 | 1 (eyebrow preview) |

`100 − 0 − 40 − 15 − 1` = **44/100**

| Referencia | Puntaje |
| --- | --- |
| B solo-DS (prev reconciliación) | 67/100 (P0:0, P1:2, P2:4, P3:1) |
| A+B reconciliado | **44/100** (P0:0, P1:4, P2:5, P3:1) |

---

## Adenda G6 — GO/NO-GO alineación (Track D · AI-SR-QA)

**Fecha:** 2026-08-11  
**Agente:** AI-SR-QA  
**Prompt:** [`PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md)  
**Specs:** UX Settings v1.0 Congelado · DS Settings v1.0 Congelado (carril rápido GO)  
**Alcance:** solo `apps/web` `/settings`. Sin portal/API. Sin commit.  
**Código contrastado:** `page.tsx` · `SecuritySettings.tsx` · `PlatformBrandingSettings.tsx` · `PLATFORM_UI_COPY.settings`

> Conserva la auditoría pre-remediación (44/100) intacta arriba. Esta adenda dictamina **solo** el cierre G6 de CA-SET-01…12 tras implementación Track C.

### Matriz CA-SET ↔ evidencia

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-SET-01** | Cero MFA / TOTP / Authenticator / branding crudo en copy visible | Jest `SecuritySettings` vocabulario · `page.spec` `queryByText(/branding/i)` · grep fuente: solo claves/imports internos (`mfa*`, `branding` var, path `@/components/branding`) · valores `PLATFORM_UI_COPY.settings` sin esos términos | **PASS** |
| **CA-SET-02** | Feedback con `Alert` `@iwana/ui` (no `FORM_ALERT_*`) | `SecuritySettings` + `PlatformBrandingSettings` importan `Alert`/`AlertDescription`; grep `FORM_ALERT_` en `components/settings` = **0** | **PASS** |
| **CA-SET-03** | Una sola cáscara con sombra | `page.tsx`: un `Card`; `SecuritySettings` sin `securityPanelClass` / sin `shadow-iwana-*` anidado; iconos sin `shadow-sm` | **PASS** |
| **CA-SET-04** | Pozos soft + `rounded-2xl`; dropzone `rounded-xl` | `settingsWellClass` / `securityWellClass` = `bg-iwana-surface-soft` + `rounded-2xl` + dark-surface-3; slot button `rounded-xl`; grep `bg-gray-50`/`rounded-lg` en settings = **0** | **PASS** |
| **CA-SET-05** | Slot con `interactiveFocusClassName` | `BrandingSlotCard` botón upload + `<summary>` avanzadas usan `interactiveFocusClassName` | **PASS** |
| **CA-SET-06** | Carga: skeleton / no editable + `aria-busy` | `IdentityLoadingSkeleton` (`SkeletonBlock` + `aria-busy`) · form `disabled`/`aria-busy` · Jest «skeleton mientras API pendiente» | **PASS** |
| **CA-SET-07** | Eyebrows `.portal-eyebrow(-muted)`; sin `tracking-[…]` | Preview `<dt className="portal-eyebrow-muted">`; grep `tracking-[` en settings = **0** | **PASS** |
| **CA-SET-08** | Copy en `PLATFORM_UI_COPY.settings`; nav «Plataforma» | Bloque `settings` en `platform-ui-copy.ts`; H1 = `navigation.settings` = «Plataforma»; `page.tsx` lee `copy.*` | **PASS** |
| **CA-SET-09** | Sin «Gobierno…»; subtítulo sin parámetros/branding; General retirado | `page.tsx`: 2 tabs Identidad\|Seguridad; subtítulo canónico + deslinde Empresas; Jest chrome + `queryByRole('tab', { name: 'General' })` ausente | **PASS** |
| **CA-SET-10** | Sin Superficie / metadata / slot / fallback en labels; tab ≠ Branding | Labels `Nombre en la consola` / `Título de pestaña`; tab `Identidad`; Jest `superficie`/`metadata` ausentes; claves Zod `metadataTitle` no renderizadas como label | **PASS** |
| **CA-SET-11** | Errores `No pudimos… Reintenta…`; éxitos sin «correctamente» | Copy `settings.identity`/`security` alineado a matriz; Jest éxito guardar/reset/MFA/password; MFA swallows ApiError message → copy canónica | **PASS** |
| **CA-SET-12** | Tests vocabulario nuevo; `otpauth` fuera del camino feliz | Suites abajo; `SecuritySettings` «otpauth queda oculto»; `otpauthUri` del API no se pinta en DOM | **PASS** |

### Evidencia de comandos (fresca · 2026-08-11)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Jest settings | `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern="settings/page.spec\|SecuritySettings\|PlatformBranding" --no-coverage` | **2 suites · 29/29 PASS** · exit **0** (`page.spec` + `SecuritySettings.spec`; Branding cubierto vía page) |
| audit-ui | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs "apps/web/src/app/(protected)/settings" "apps/web/src/components/settings"` | **sin hallazgos** · exit **0** |
| Grep sample | MFA/TOTP/Authenticator/branding/Gobierno/Superficie en fuentes settings (excl. specs) | Solo internos no renderizados (vars/API keys/import path). `Gobierno` vive en `navigationGroups.governance` (fuera de esta superficie). |

### Hallazgos / residuales (no bloquean)

| Sev | Hallazgo | Dictamen |
| --- | --- | --- |
| — | Ningún CA-SET en FAIL | — |
| Observación | Warnings `act(...)` en `page.spec` al resolver `platformBrandingApi.get` (ruido React 19; no fallan assertions) | **Aceptable** · no NO-GO |
| Residual | `getErrorMessage` / `changePassword` pueden reenviar `ApiError.message` del backend si no es genérico; MFA setup/verify/disable ya fuerza copy canónica | Follow-up FE opcional · no bloquea G6 |
| Fuera de CA | Contraste overlay `bg-black/40` + texto blanco del slot — no medido en browser (ítem «Por verificar» de la auditoría) | Fuera de CA-SET · no NO-GO |

### Skills aplicadas (lectura)

`verification-before-completion` · `testing-patterns` (+ `iwana-identity-ui-review` vía `audit-ui.mjs`).

### Dictamen

**GO.** CA-SET-01…12 **PASS** con evidencia Jest + audit-ui + contraste de código/copy. Specs UX/DS Congeladas respetadas. Sin tests de barrera adicionales requeridos. Sin commit. Sin portal/API.
