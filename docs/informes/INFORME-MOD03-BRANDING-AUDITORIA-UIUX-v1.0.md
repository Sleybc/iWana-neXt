# INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.1

## Auditoría de identidad, a11y, copy y seguridad — `/dashboard/settings/branding` del portal

**Versión:** 1.1 (v1.0 + actualización de cierre §8, 2026-08-18)
**Estado:** Vigente
**Fecha:** 2026-08-17 (actualizado 2026-08-18)
**Modo activo:** Orchestrator ([perfil AI-EM-ARCH v2.4](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) Parte II)
**Autor consolidación:** AI-EM-ARCH
**Etapa:** 6 — review de experiencia ([protocolo v1.5](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3bis)
**Superficie:** `apps/portal/src/app/dashboard/settings/branding` + shared settings + primitives `@iwana/ui` tocadas + paridad `apps/web` (divergencias)
**Agentes:** AI-FE-PLATFORM · AI-PROD-UX · AI-SR-QA · AI-SEC-ENG · AI-DS-OWNER
**Skills:** `iwana-identity-ui-review` (modo review) · `senior-ui-systems-designer` · `ui-ux-pro-max` (subordinada) · `docs-architect`

**Relación:** sucede a [INFORME-PORTAL-MARCA-AUDITORIA-v1.md](INFORME-PORTAL-MARCA-AUDITORIA-v1.md) (2026-05-28, En revisión). Estado de sus 3 críticos: 3.2 (URL oculta) **resuelto** — las URLs HTTPS son campo visible por slot; 3.3 (Restaurar base sin confirmación) **resuelto** — hay diálogo de confirmación (validado en vivo); 3.1 (grilla plana de 8 cards) **parcial** — mantiene estructura por slots con acciones por card, persiste como P2-UX-1/P3.

---

## 1. Resumen ejecutivo

El módulo de Marca del portal es funcional y completo: 8 slots de activos (sello/logo/favicon/fondo × claro/oscuro), URLs HTTPS visibles, previews en vivo claro/oscuro, guardado incremental, diálogo de confirmación para Restaurar base y toasts de éxito (verificado en vivo con sesión ADMIN `localhost:3002`, tenant `iwana`). El flujo principal no tiene P0 y el contrato visual fue verificado por DS-OWNER con veredicto **"Cumple con desviaciones"**.

Sin embargo, la auditoría en vivo con evidencia de computed styles confirma **4 P1, 3 de ellos de accesibilidad**:

1. Contraste AA del texto de error en el primitivo compartido `Input` (`#EF4444` 12 px ≈ **3.76:1** < 4.5:1) — afecta a **todo formulario** de web y portal que use `Input` con error.
2. `aria-describedby` roto: el input referencia `sealLightUrl-helper` que **no existe** en el DOM; el mensaje real `sealLightUrl-error` queda sin asociar (los lectores de pantalla no anuncian el error).
3. Anillo de foco del subtab (`SettingsSubTabs.tsx:69`) en lima ≈ **2.0:1** — falla WCAG 2.4.11 (3:1) y está fuera del contrato de foco (`interactiveFocusClassName`).
4. Hover de enlace en dark (`BrandingForm.tsx:755`, `dark:hover:text-iwana-primary` ≈ **1.1:1**) — se corrige con `dark:hover:text-iwana-primary-300` (≈6.2:1, verificado contra `globals.css:38`).

**Pregunta de gate:** ¿el módulo se reconoce como Marca iWana con contraste y anuncios a11y correctos? **Funcionalmente sí; a11y/identidad no aún.**

**Puntaje consolidado (deduplicado):** `100 − 10·4 − 3·7 − 1·8` = **31/100** (banda <70: no apto hasta remediar P1). El puntaje refleja los P1 de accesibilidad comprobados en vivo y las desviaciones de contrato; no refleja fallos de flujo (0 P0).

**Veredicto consolidado:** **GO condicionado** — funcionalidad y flujo aprobados (0 P0, 0 fallos de guardado); **no** se declara el módulo conforme a identidad/a11y hasta cerrar los 4 P1 + P2-S del plan [`2026-08-17-mod03-branding-audit-remediation.md`](../plans/2026-08-17-mod03-branding-audit-remediation.md). Sin ejecución de fixes en esta fase (auditoría read-only).

---

## 2. Método

### 2.1 Preguntas por agente (no se promedian)

| Agente | Pregunta | Puntaje | Veredicto |
| --- | --- | --- | --- |
| **AI-FE-PLATFORM** | ¿El código del módulo respeta tokens, primitives y patrones Firma? | **67/100** | 0 P0 · 1 P1 · 7 P2 · 2 P3 |
| **AI-PROD-UX** | ¿El flujo del administrador sostiene la tarea de marca y la comunica? | — | 0 P0 · 0 P1 · 6 P2 · 8 P3 (flujo OK) |
| **AI-SR-QA** | ¿El módulo pasa criterios a11y y de testing? | — | 2 P1 (contraste error + aria) · P2/P3 |
| **AI-SEC-ENG** | ¿La superficie de marca expone riesgos? | — | 1 P2 (URLs externas directas) · 2 P3 |
| **AI-DS-OWNER** | ¿La UI cumple el contrato del design system? | — | **Cumple con desviaciones** · 3 P1 · 12 P2/P3 |

Puntaje consolidado (deduplicado por causa raíz): P0: 0 · P1: 4 · P2: 7 · P3: ~8.

### 2.2 Evidencia

| Fuente | Resultado |
| --- | --- |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` (objetivos) | Hallazgos deterministas **0** |
| Sesión viva Playwright ADMIN (`localhost:3002`, tenant `iwana`) | Light/dark/mobile/error capturados en `.playwright-mcp/audit-branding/` |
| Computed styles en vivo | Pill preview `rgb(23,22,58)` (`#17163A`) en light **y** dark; sidebar real dark `oklab(0.325 0.02 -0.06 / 0.3)`; error `rgb(239,68,68)` 12 px; `sealLightUrl-helper` inexistente; "Subir imagen" ≈ gray-400 |
| Código (5 tracks) | Rutas y líneas citadas por hallazgo; tokens verificados contra `packages/ui/src/styles/globals.css` |
| Consola navegador | 1 issue Chrome (campo de formulario sin id/name, Next Dev Tools) — no bloqueante |

### 2.3 Conflicto no sintetizado

| Fuente | Dice |
| --- | --- |
| Estrella Polar (ADR-056) | Tokens y primitives de `@iwana/ui` como única fuente; navegación vigente = surface clara / surface oscura translúcida |
| Código vivo | La **preview** de navegación pinta `bg-iwana-primary` (navy `#17163A`, patrón Superado) en light y dark, mientras la sidebar real usa surface-soft / oklab translúcido |
| Decisión | No sintetizar: el preview debe replicar la navegación **vigente**, no el navy Superado (P2-IDENT-1, decisión EM-ARCH §4) |

---

## 3. Hallazgos consolidados

### P0

Ninguno.

### [P1][A11y] Contraste AA del texto de error en el primitivo compartido `Input`

- **Evidencia:** `packages/ui/src/components/Input.tsx:150` — `text-xs text-iwana-error` → computed en vivo `rgb(239, 68, 68)` (`#EF4444`) a 12 px sobre blanco ≈ **3.76:1** (< 4.5:1 AA). Confirmado en vivo: `role="alert"` "Ingresa una URL válida." (`BrandingForm.tsx:774`).
- **Impacto:** Cualquier formulario web o portal que use `Input` con error falla contraste; el token `--color-iwana-error` (`globals.css:88`) queda comprometido para texto de error.
- **Recomendación (congelada por DS-OWNER antes de Task 1):** añadir `--color-iwana-error-700` (`#DC2626`, 4.83:1) y usarlo para texto de error en `Input`; no tocar el token actual para otros usos (bordes, iconos) si el contrato lo conserva.
- **Esfuerzo:** S · **Dueño:** FE tras consulta de contrato DS-OWNER.

### [P1][A11y] `aria-describedby` roto: el error no está asociado al input

- **Evidencia:** `BrandingForm.tsx:774` pasa `aria-describedby="{id}-helper {id}-description {id}-guidance"`; en vivo el input tiene `aria-describedby="sealLightUrl-helper seal-description seal-guidance"` y `sealLightUrl-helper` **no existe** en el DOM; el mensaje real `sealLightUrl-error` (`role=alert`) queda sin referenciar. `Input.tsx:88-91` sobrescribe el `aria-describedby` interno, impidiendo que el error se asocie.
- **Impacto:** Screen readers no anuncian el error de validación (se pierde la causa del estado `aria-invalid`).
- **Recomendación:** en `Input`, mergear `aria-describedby` externo con el interno (respetar ids pasados por el consumidor); en `BrandingForm`, pasar el id real del mensaje de error.
- **Esfuerzo:** S · **Dueño:** FE.

### [P1][A11y] Anillo de foco del subtab fuera de contrato y bajo contraste

- **Evidencia:** `apps/portal/src/components/settings/SettingsSubTabs.tsx:69` — `focus-visible:ring-iwana-secondary` (lima) sobre surface clara ≈ **2.0:1**; falla WCAG 2.4.11 (non-text 3:1) y no usa el contrato de foco del DS (`packages/ui/src/focus.ts:5-6`, `interactiveFocusClassName`).
- **Recomendación:** sustituir por `interactiveFocusClassName` (verificado en `portal-ui.tsx` y adoptado en el resto de settings).
- **Esfuerzo:** S · **Dueño:** FE (decisión DS-OWNER ya congelada en consulta).

### [P1][Identidad] Hover de enlace en dark rompe contraste (`dark:hover:text-iwana-primary`)

- **Evidencia:** `BrandingForm.tsx:755` — `dark:hover:text-iwana-primary` (`#17163A`) sobre `dark-surface-2` ≈ **1.1:1** (el texto desaparece). Verificado contra tokens: `dark:hover:text-iwana-primary-300` (`#A8A4C8`, `globals.css:38`) ≈ **6.2:1**.
- **Recomendación:** `dark:hover:text-iwana-primary-300` (mismo patrón aprobado en el resto del portal).
- **Esfuerzo:** S · **Dueño:** FE.

### [P2][Identidad] Preview de navegación con pill navy (patrón Superado)

- **Evidencia:** `BrandingForm.tsx:818-830` — preview "Vista previa de navegación y pestaña" pinta `bg-iwana-primary` (`#17163A`, navy) con `rounded-2xl`. **Confirmado en vivo en light y dark** (computed `rgb(23, 22, 58)`); la sidebar real en dark usa `oklab(0.325 0.02 -0.06 / 0.3)` (translúcida) y en light surface-soft.
- **Impacto:** El preview muestra una navegación que ya no existe en el producto (ADR-056 retiró el navy sólido); refuerza el patrón Superado en la superficie más visible del módulo.
- **Recomendación:** replicar la navegación vigente (surface-soft en light / `dark:bg-dark-surface-3` translúcido en dark), con texto `iwana-secondary-700`/`dark:text-white` según el patrón del sidebar real.
- **Esfuerzo:** S · **Dueño:** FE.

### [P2][A11y] "Subir imagen" y textos secundarios en gray-400 a 12 px

- **Evidencia:** `BrandingForm.tsx:706-708` (y patrones análogos en slots) — `text-gray-400` 12 px ≈ **2.5:1** sobre blanco. Confirmado en vivo (computed ≈ gray-400) en light y dark.
- **Recomendación:** `text-gray-500 dark:text-gray-400` (≥4.5:1 en light) o token secundario del DS para textos de 12 px.
- **Esfuerzo:** S · **Dueño:** FE.

### [P2][Seguridad] URLs externas renderizadas directo sin proxy

- **Evidencia:** 7 puntos: `BrandingForm.tsx:699-703` (preview `img`), `LoginBrandPanel.tsx:38-41`, `TenantSeal.tsx:71-78`, `LoginExperience.tsx:144-146`, `TenantFavicon.tsx:51-58`, `AuthPremiumShell.tsx:38-46`, `AuthBrandHeader.tsx:44-46`. Backend valida `https://` (cualquier host) en `tenant-self-update.dto.ts:170-275` y **bloquea SVG** (`media.service.ts`).
- **Impacto:** Un tenant puede cargar una URL que sirva tracking/pixel en login público y previews (privacidad del visitante); riesgo moderado (P2), no P1: exige configuración del propio tenant, sin escalada de privilegios.
- **Recomendación:** validar `Content-Type` de la URL al guardar (imagen real) y/o servir activos de marca por proxy del API; backlog de seguridad, no bloquea este lote.
- **Esfuerzo:** M · **Dueño:** SEC-ENG + SR-BACKEND (fuera de lote UI).

### [P2][DS] Desviaciones de contrato visual: gradientes inline (web) y hex en accordion

- **Evidencia:** `apps/web/src/components/tenants/TenantBrandingForm.tsx:543,550` — gradientes inline arbitrarios (divergencia de paridad web/portal); `packages/ui/src/components/SectionAccordion.tsx` — hex directo fuera de tokens. Verificados por DS-OWNER (D2, D3).
- **Recomendación:** reemplazar gradientes por tokens liberados por DS-OWNER (o `PortalAlert`/patrón de preview aprobado); hex del accordion → token.
- **Esfuerzo:** S · **Dueño:** FE (consulta contrato DS-OWNER).

### [P2][DS] Checkbox de slot fuera de primitive

- **Evidencia:** `BrandingForm.tsx:875` — checkbox custom; el portal ya tiene `portalCheckboxClassName` como contrato.
- **Recomendación:** adoptar `portalCheckboxClassName`.
- **Esfuerzo:** S · **Dueño:** FE.

### [P2][UX] Feedback débil en estados de imagen y readonly

- **Evidencia:** `BrandingForm.tsx:697-710` — fallo de carga de URL en preview no se distingue del estado vacío; lectura de un slot como readonly (admin sin permiso de edición) sin aviso previo.
- **Recomendación:** estado de error de imagen explícito en la card del slot; readonly → `PortalAlert variant="info"` (`portal-ui.tsx:1524`) arriba del panel.
- **Esfuerzo:** M · **Dueño:** FE.

### [P2][UX] Semántica híbrida URL/upload subcomunicada

- **Evidencia:** pain de PROD-UX (convergente con el crítico 3.2 de la auditoría previa, ahora resuelto en forma pero no en mensaje): el usuario no sabe qué fuente gana (URL vs archivo), ni cuándo "Guarda la marca" aplica URLs.
- **Recomendación:** copy de estado por slot que declare la fuente activa y la precedencia; validar con `system-vocabulary-review`.
- **Esfuerzo:** S · **Dueño:** FE + PROD-UX (copy congelado antes de Task 8).

### P3 (agrupados, no exhaustivos)

- Eyebrows de sección con peso/color pesado → `.portal-eyebrow-muted` (6 ocurrencias, `BrandingForm`).
- Jerarquía de headings: `h1` → `h3` (salta `h2`) en paneles; confirmado en vivo (`h1` Marca → `h3` Identidad visual).
- `shadow-iwana-card` en `SettingsSectionPanel` vs `shadow-card` de `@iwana/ui` + promoción de primitive (deuda de primitives transversal a settings).
- `details` de URLs: el foco no se mueve al input al expandir.
- Alt de imágenes de marca en previews genérico ("Sello compacto Variante clara") — aceptable, mejorar con el nombre real del tenant.
- 1 issue Chrome (form field sin id/name) en la página — heredado de Next Dev Tools, no bloqueante.
- Vocabulario: sin términos técnicos bloqueantes; sugerencias menores de copy (v1.1 del informe previo quedan cerradas).

---

## 4. Decisión EM-ARCH

```
[DESEMPATE] Área RACI: A11y + DS + Identidad (superficie Marca del portal)
Posiciones: preview navy Superado (código vivo) vs navegación vigente ADR-056.
Decisión: el preview replica la navegación VIGENTE (surface clara / oscura
  translúcida); el navy sólido queda prohibido en previews de marca. Token de
  error: DS-OWNER decide `--color-iwana-error-700` (#DC2626) o variante
  semántica; el texto de error de Input usa ≥4.5:1. Foco de subtabs adopta
  `interactiveFocusClassName` sin excepción. Hover dark de enlaces =
  `text-iwana-primary-300`.
Justificación: tracks A+C+E confirman los 3 P1 a11y en vivo (computed styles) y
  la desviación de contrato; el flujo no tiene P0.
Registro: este informe + plan de remediación 2026-08-17.
```

**Carril rápido:** NO (hay cambios de primitivo compartido y consulta DS-OWNER pendiente).

**Siguiente acto:** plan [`2026-08-17-mod03-branding-audit-remediation.md`](../plans/2026-08-17-mod03-branding-audit-remediation.md) — **no ejecutado** en esta fase (auditoría read-only).

---

## 5. Contratos y estado

| Artefacto | Estado |
| --- | --- |
| Tokens `@iwana/ui` (`--color-iwana-error`) | **En revisión** — decisión DS-OWNER pendiente (P1-A11y-1) |
| Contrato de foco (`interactiveFocusClassName`) | Aprobado — aplicar en `SettingsSubTabs` |
| Previews de marca | Decisión EM-ARCH §4 — replicar navegación vigente |
| Copy del módulo | Congelado por PROD-UX en plan (Tasks 8-9) |
| Deuda de seguridad (URLs externas) | Backlog SEC-ENG (P2, no bloquea) |

## 6. Evidencia visual (sesión viva)

Capturas en `C:\appiw\.playwright-mcp\audit-branding\`: `branding-light-full.png` (light), `branding-dark-full.png` (dark), `branding-mobile-390.png` (390×844), `branding-error-state.png` (estado de error). Computed styles citados en §3 verificados con `getComputedStyle` sobre la sesión ADMIN.

## 7. Cierre

Sin PII, secretos ni tokens en logs/código citado (verificado por SEC-ENG). La credencial de la sesión de auditoría es dev-only y no aparece en este documento. Tests: la cobertura unitaria de `BrandingForm`/`branding-validation` existe; el plan incluye tests de regresión a11y (Task 2) y de copy.

---

## 8. Actualización v1.1 — cierre del ciclo de remediación (2026-08-18)

Ejecutado el prompt [`PROMPT-MOD03-BRANDING-AUDITORIA-REMEDIACION-v1.0.md`](../prompts/PROMPT-MOD03-BRANDING-AUDITORIA-REMEDIACION-v1.0.md) y el plan [`2026-08-18-mod03-branding-auditoria-remediacion.md`](../plans/2026-08-18-mod03-branding-auditoria-remediacion.md) (absorbed tasks 0-10 del plan 2026-08-17 + B12). Fase A (verificación multiagente), Fase B (implementación FE-PLATFORM, 9 archivos, TDD en Tasks 1-2-9) y Fase C (G6) completadas.

### 8.1 Veredicto consolidado

| Pilar | Veredicto | Evidencia |
| --- | --- | --- |
| Contrato DS (DS-OWNER, C6) | **Cumple** — sin desviaciones del contrato A5 | Tabla file:line en §8.3 |
| Copy/UX (PROD-UX, C6) | **GO** — copy congelado A2 implementado literal; 0 restos de vocabulario viejo | `BrandingForm.tsx` + `BRANDING_SETTINGS_COPY` |
| A11y (SR-QA, C3-C4) | **GO** — smoke E2E 6/6 + regresión upload 3/3; axe 0 violaciones por vista; greps C4 en 0; `audit-ui.mjs` sin hallazgos | `portal-settings-branding-smoke.spec.ts` |

**Puntaje v1.1:** 100 − 0·20 − 0·10 − 6·3 − 3·1 = **79/100** (aceptable; deuda residual diferida y registrada, §8.4). Estructura: P0: 0 · P1: **0** (4 P1 cerrados) · P2: 6 · P3: 3.

**Veredicto final del módulo Marca:** Aprobado con deuda registrada (no bloqueante). El `h1`→`h3` y el foco de `details` (P3 v1.0) quedan como deuda documental compartida, sin tocar `SettingsSectionPanel`/`details` en este ciclo.

### 8.2 Hallazgos v1.0 cerrados

| Hallazgo | Cierre |
| --- | --- |
| P1-A11y-1 contraste texto de error | `text-iwana-error-700 dark:text-red-300` (token `--color-iwana-error-700: #DC2626`, 4.83:1 light; dark 7.56:1); color computed verificado en E2E `rgb(220, 38, 38)` |
| P1-A11y-2 `aria-describedby` perdido por spread | Merge deduplicado en `Input.tsx` (`mergeAriaDescribedBy`, id interno primero); E2E aserta `sealLightUrl-error` ∈ `aria-describedby` + `aria-invalid` |
| P1-A11y-3 foco lima de subtabs | `interactiveFocusClassName` (`SettingsSubTabs.tsx:70`); `ring-iwana-secondary` = 0 |
| P1-IDENT-1 hover navy `dark:hover:text-iwana-primary` | `text-iwana-primary-300` (`BrandingForm.tsx:814`); grep = 0 |
| P2-IDENT-1 preview navy | Pill replica sidebar vigente `bg-white dark:bg-dark-surface-2` (`Sidebar.tsx:289`); `bg-iwana-primary` en `BrandingForm` = 0 |
| P2-A11Y-1 gris-400 en textos 12 px | Textos de soporte en `gray-500`/`gray-400`; axe 0 color-contrast en todas las vistas |
| P2-UX-1 readonly | `PortalAlert variant="info"` "Consulta sin edición" + controles deshabilitados; E2E NOC 0 violaciones |
| P2-UX-2 precedencia URL/upload | Copy por slot: fuente actual + hint de precedencia + helper de URL (literal en §8.5) |
| P3 eyebrows pesados | `.portal-eyebrow-muted` en 6 ocurrencias (`BrandingForm.tsx:873, 892, 1014, 1020, 1026, 1032`) |

### 8.3 Recetas de diseño aplicadas (contrato A5 → diff)

1. Token `--color-iwana-error-700: #DC2626` solo en `@theme` (`globals.css:92`); `--color-iwana-error` intacto (`:88`) para bordes/iconos; icono hereda `currentColor`.
2. `interactiveFocusClassName` desde `packages/ui/src/focus.ts` (anillo `ring-iwana-primary`).
3. `portalCheckboxClassName` con `cn(...)` (`BrandingForm.tsx:936`).
4. Eyebrows con `.portal-eyebrow-muted` (preexistente, sin cambios en el diff).
5. **Task 7b (gradientes web) tachada/diferida** por decisión DS-OWNER A5(b); `apps/web` sin cambios. **Shadow tachada** (SettingsSectionPanel ya no usa sombra; no se inventó variante).
6. Estado de error de imagen con `ImageOff` + copy (sin probing de URLs, decisión SEC-ENG); label de upload operable por teclado (tabIndex 0, Enter/Space, foco del contrato).

### 8.4 Deuda residual registrada (diferida, no bloqueante)

- **P2-SEC-1:** proxy de URLs externas de marca — backlog SEC-ENG (sin cambios en este ciclo; el renderizado sigue directo, Task 8 sin probing).
- **P2:** patrón de texto de error con token base en primitivos fuera del backlog — `Select.tsx:668`, `MultiSelect.tsx:279`, `DatePicker.tsx:120`, `FormField.tsx:54`, `OtpInput.tsx:90` (`text-iwana-error` como texto) → próximo ciclo: `-700 dark:text-red-300` conservando base en bordes/iconos.
- **P2:** `SettingsSubTabs` remediada pero sin montaje productivo en la ruta (contrato cubierto por unit `SettingsClient.spec.tsx` y por el label de upload que comparte `interactiveFocusClassName`).
- **P2:** overlay de foco del label de upload — caption blanco ≈2.99:1 < 4.5:1 en light (P2 conocido, fuera del backlog; control operable con doble señal).
- **P2:** N2 (red-500 crudos en `Input`: asterisco/borde — cumplen 3:1 no-texto), N3 (red-* crudos en diálogo Restaurar), N5 (tab activo navy en `SettingsSubTabs` — control compartido).
- **P3:** copy R1 (`BrandingForm.tsx:1062`, verbo "limpiar" vs "Restaurar marca base" en el diálogo) y R2 (`:1055`, "metadata" → "textos públicos" en pasada posterior).
- **P3:** `h1`→`h3` y `shadow-iwana-card`/foco `details` (v1.0 §3) — deuda transversal de settings, fuera del alcance.

### 8.5 Copy congelado A2 (registro documental literal — requisito PROD-UX R3)

`BRANDING_SETTINGS_COPY` (+11 claves): `slotSourcePrefix` **"Fuente actual: "**; `slotSourceUploaded` **"Activo subido"**; `slotSourceExternalUrl` **"Enlace externo"**; `slotSourceNone` **"Sin configurar"**; `slotPrecedenceHint` **"El archivo subido tiene prioridad sobre la URL. Subir un archivo lo aplica de inmediato; escribir una URL HTTPS lo aplica al guardar la marca."**; `slotUrlHelperText` **"Déjalo vacío para conservar el archivo subido. Escribe una URL HTTPS y guarda la marca para aplicarla."**; `readOnlyNoticeTitle` **"Consulta sin edición"**; `readOnlyNoticeDescription` **"Tu perfil puede consultar la marca de la empresa, pero no modificarla. Una persona administradora puede actualizar los activos y los textos públicos."**; `slotImageLoadErrorTitle` **"La imagen no está disponible"**; `slotImageLoadErrorDescription` **"Revisa la URL de esta variante o sube un archivo nuevo."**

Ajustes 9b: Producto→**Nombre comercial**; Superficie→**Nombre del portal**; Título público→**Título en navegador**; Fondo del login→**Fondo del inicio de sesión**; Limpiar variante→**Eliminar imagen**; Restaurar base→**Restaurar marca base** (unificado en toolbar, título y botón del diálogo); `Subiendo...`→**Subiendo…** (U+2026); aria-label "Abrir directorio del recurso"→**"Abrir el enlace en el navegador"**. Blindado por `BrandingForm.spec.tsx` (13 tests nuevos).

### 8.6 Evidencia de verificación

- Unit: portal **1472 suites** / **189 targeted** (FE-PLATFORM Fase B), web **36 suites** (regresión `packages/ui` Input — cubre la nota de riesgo del primitivo compartido), coverage `BrandingForm.tsx` 96/88/100/96 y `BrandingSettingsClient.tsx` 100 (≥80 en 4 métricas).
- E2E: `portal-settings-branding-smoke.spec.ts` **6/6** (light/error-light/error-dark/mobile-light con foco/mobile-dark/readonly, axe wcag2a/wcag2aa 0 violaciones por vista); regresión `portal-branding-upload.spec.ts` **3/3**. Capturas en `.playwright-mcp/audit-branding-v1-1/` (7 PNG).
- Greps C4: `dark:hover:text-iwana-primary` sin sufijo = 0 · `bg-iwana-primary` en `BrandingForm` = 0 · `ring-iwana-secondary` en `SettingsSubTabs` = 0 · `text-iwana-error` crudo en `Input.tsx` = 0. `audit-ui.mjs`: sin hallazgos.
- Sin commit (pendiente del equipo). Sin PII/secretos; diff limitado a los 9 archivos de la Fase B.