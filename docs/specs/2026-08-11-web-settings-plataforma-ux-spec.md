# UX spec — Plataforma · settings (apps/web)

**Versión:** 1.2  
**Estado:** Congelado  
**Fecha:** 2026-08-11  
**Propietario:** AI-PROD-UX  
**Alcance:** `/settings` de `apps/web`. **No aplica a** `apps/portal` ni a `/tenants/[id]/settings`.  
**Prompt:** [`PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md)  
**Plan:** [`2026-08-11-web-settings-alineacion.md`](../plans/2026-08-11-web-settings-alineacion.md)  
**Informe:** [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md)  
**Contrato DS hermano:** [`2026-08-11-web-settings-plataforma-ds-contrato.md`](2026-08-11-web-settings-plataforma-ds-contrato.md) (track B en paralelo)  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Copy vivo:** [`apps/web/src/lib/platform-ui-copy.ts`](../../apps/web/src/lib/platform-ui-copy.ts) → crear bloque `settings`; nav `Plataforma` no cambia (`navigation.settings`)  
**Forma de referencia (estructura, no copy):** [`2026-08-11-web-audit-logs-historial-ux-spec.md`](2026-08-11-web-audit-logs-historial-ux-spec.md) · [`2026-08-11-web-empresas-directorio-ux-spec.md`](2026-08-11-web-empresas-directorio-ux-spec.md)  
**Vocabulario:** skill `system-vocabulary-review` (MFA → verificación en dos pasos; errores `No pudimos… Reintenta…`)

### Changelog

| Ver | Estado | Cambio |
| --- | --- | --- |
| 1.0 | Congelado (superado en §2 cáscara) | Alineación post-auditoría: 2 tabs Identidad \| Seguridad; sin General ni CardTitle «Gobierno…»; copy literal; CA-SET-01…12. |
| **1.1** | Congelado (superado en layout Seguridad) | Cáscara = Historial/Empresas: tabs sobre el canvas; cada sección es panel blanco con sombra de card. Sin `Card` envolvente. CA-SET-03 reescrito. |
| **1.2** | **Congelado** | Seguridad en dos columnas `lg+` (contraseña \| verificación); apilado en viewport estrecho. |

---

## 1. Persona / tarea

**Persona:** operador de plataforma (`SYSTEM_ADMIN`) en `apps/web`.

**Tarea (un ciclo, sin wizard):**

1. **Ajusta** la identidad visual de la consola (logo, fondos de acceso, nombres públicos).
2. **Protege** su propio acceso: cambiar contraseña y activar / desactivar verificación en dos pasos.
3. **No confunde** esta pantalla con la configuración de cada empresa (eso vive en Empresas).

Esta spec **alinea** chrome, copy, Alert, loading y a11y del slot. **No rediseña** la tarea ni pide contratos API nuevos: branding + MFA/contraseña se quedan; solo cambia piel, vocabulario y estados de experiencia.

---

## 2. Arquitectura de página

Sin wireframe ornamental. Cáscara: `PageHeader` + `Tabs` **sobre el canvas**. Cada bloque operativo es un panel blanco (`rounded-2xl` + `shadow-iwana-card`), igual que la tabla de Historial. **Sin** `Card` que envuelva tabs + contenido.

```text
375 / 768 (1 col)                  1280
─────────────────                  ────────────────────────────
B0 PageHeader                      B0 PageHeader
T  Tabs (sobre canvas)             T  Tabs (sobre canvas)
   Paneles de sección                 Paneles de sección
```

### B0 · PageHeader

| Pieza | Valor |
| --- | --- |
| H1 | `Plataforma` (leer de `PLATFORM_UI_COPY.navigation.settings`) |
| Subtítulo | `Identidad de la consola y seguridad de tu acceso.` |
| Deslinde (misma zona B0) | `La configuración de cada empresa está en Empresas.` |
| CTA primario en header | Ninguno |

Un solo H1. **Sin** H2 instructivo de hero. **Sin** CardTitle «Gobierno y configuración global». **Sin** CardTitle «Configuración» (H1 basta; evita chrome redundante).

El deslinde a Empresas vive en el PageHeader (segunda frase / línea secundaria del subtítulo), **no** como tab ni como prosa triple.

### T · Tabs (sobre canvas, sin Card envolvente)

| Pieza | Valor |
| --- | --- |
| CardTitle | **Ninguno** |
| Tab 1 | `Identidad` |
| Tab 2 | `Seguridad` |
| Tab General | **Retirado** |

Default tab: `Identidad` (salvo deep-link / hash que FE ya tenga; no inventar query nueva en esta fase).

### Panel Identidad

Orden de bloques (tarea → apoyo):

1. H2 + ayuda corta (§3).
2. Feedback `Alert` (éxito / error / info) cuando aplique.
3. Carga: skeleton con forma (§5) **o** formulario no editable (`fieldset`/`disabled` + `aria-busy`).
4. Sección «Imágenes de la consola» (slots: logo, favicon, fondos de acceso).
5. Sección nombres (Producto, Nombre en la consola, Título de pestaña, Descripción corta) + vista previa.
6. CTAs: Restaurar valores por defecto · Guardar cambios.

### Panel Seguridad

Cada sección es un **panel de card**. En `lg+`: **dos columnas** (contraseña | verificación). Bajo `lg`: una columna (contraseña encima).

1. Feedback `Alert` a ancho completo cuando aplique.
2. Columna izquierda: panel «Cambiar contraseña».
3. Columna derecha: panel «Verificación en dos pasos» (estado → activar QR → confirmar código → desactivar).

Camino feliz MFA: QR + campo de código. URI `otpauth` **fuera** del camino feliz (opciones avanzadas u oculto).

---

## 3. Copy canónico (literal — matriz del informe)

Congelado tal cual desde [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md) § Matriz. Sentence case. Fuente: bloque `PLATFORM_UI_COPY.settings` (+ nav existente). Cero strings sueltos nuevos en JSX.

| Zona | Texto exacto |
| --- | --- |
| **Nav** | Plataforma |
| **PageHeader title** | Plataforma |
| **PageHeader subtitle** | Identidad de la consola y seguridad de tu acceso. |
| **Deslinde Empresas (B0)** | La configuración de cada empresa está en Empresas. |
| **CardTitle** | *(ninguno — H1 basta)* |
| **Tab Identidad** | Identidad |
| **Tab Seguridad** | Seguridad |
| **Identidad H2** | Identidad de la consola |
| **Identidad help** | Logo, fondos de acceso y nombres públicos. No cambia la identidad de cada empresa. |
| **Carga identidad** | Cargando identidad de la consola… |
| **Sección assets** | Imágenes de la consola |
| **Logo** | Logo de consola |
| **Favicon help** | …pestañas del navegador y pantalla de acceso. |
| **Fondos** | Fondo de acceso — modo claro / Fondo de acceso — modo oscuro |
| **Producto** | Producto |
| **Nombre consola** | Nombre en la consola |
| **Título pestaña** | Título de pestaña |
| **Descripción** | Descripción corta |
| **Preview dt** | Nombre en la consola / Título de pestaña |
| **Opciones avanzadas imagen** | Opciones avanzadas de la imagen |
| **Dialog eliminar body** | Se usará la imagen por defecto de la plataforma. |
| **CTA eliminar** | Eliminar imagen / Sí, eliminar |
| **Restaurar** | Restaurar valores por defecto |
| **Guardar** | Guardar cambios |
| **Éxito guardar** | Identidad guardada. |
| **Éxito reset** | Valores por defecto restaurados. |
| **Éxito upload** | Imagen aplicada. |
| **Éxito remove** | Imagen eliminada. Se usa la imagen por defecto. |
| **Error carga** | No pudimos cargar la identidad de la consola. Reintenta en unos minutos. |
| **Error guardar** | No pudimos guardar la identidad. Reintenta en unos minutos. |
| **Error upload** | No pudimos subir la imagen. Reintenta en unos minutos. |
| **Error eliminar** | No pudimos eliminar la imagen. Reintenta en unos minutos. |
| **Ayuda MIME (slots)** | PNG, JPG o WEBP · máx. 1 MB · mín. 240×60. |
| **Seguridad H2 password** | Cambiar contraseña |
| **Help password** | Cambia la contraseña con la que entras a la consola. |
| **CTA password** | Actualizar contraseña |
| **Éxito password** | Contraseña actualizada. |
| **Error password** | No pudimos cambiar la contraseña. Reintenta en unos minutos. |
| **Seguridad H2 MFA** | Verificación en dos pasos |
| **Help MFA** | Añade un código de tu teléfono al iniciar sesión. |
| **Estado MFA on** | Activada |
| **Estado MFA off** | Desactivada |
| **Estado MFA loading** | Comprobando verificación en dos pasos… |
| **CTA setup** | Activar verificación en dos pasos |
| **Mensaje post-setup** | Escanea el código QR con tu app de autenticación e ingresa el primer código. |
| **QR title / alt** | Código QR para la app de autenticación |
| **URI otpauth** | Solo en opciones avanzadas · o ocultar (no en camino feliz) |
| **Confirmar** | Confirmar código |
| **Disable H3 / CTA** | Desactivar verificación en dos pasos |
| **Label código** | Código de verificación |
| **Help disable** | Confirma tu contraseña y un código de tu app de autenticación. |
| **Éxito MFA on** | Verificación en dos pasos activada. |
| **Éxito MFA off** | Verificación en dos pasos desactivada. |
| **Errores MFA** | No pudimos… Reintenta en unos minutos. (misma gramática; sin «MFA» en el mensaje) |

### Prohibido en UI visible de `/settings`

`MFA` · `TOTP` · `Authenticator` · `branding` (crudo) · `Gobierno y configuración global` · `parámetros` · `Superficie` · `metadata` · `slot` · `fallback` · `tenant` · «No fue posible…» · «…correctamente» · MIME IANA crudo al usuario · URI `otpauth` en el camino feliz.

Nav permanece **Plataforma** (no se renombra a Settings ni a Configuración).

---

## 4. Flujos

### 4.1 Identidad — guardar

1. Operador edita imágenes y/o nombres.
2. Guarda → `Alert` success: `Identidad guardada.`
3. Fallo → `Alert` error con copy §3 + reintento implícito (vuelve a editar / Guardar).

### 4.2 Identidad — restaurar / eliminar imagen

- Restaurar: confirma impacto → éxito `Valores por defecto restaurados.`
- Eliminar imagen de un slot: Dialog con body canónico → éxito `Imagen eliminada. Se usa la imagen por defecto.`

### 4.3 Seguridad — contraseña

1. Completa campos → Actualizar contraseña.
2. Éxito breve: `Contraseña actualizada.`
3. Error recuperable: copy §3.

### 4.4 Seguridad — verificación en dos pasos (activar)

1. Estado Desactivada → CTA `Activar verificación en dos pasos`.
2. Muestra QR + mensaje post-setup + campo código → `Confirmar código`.
3. Éxito: `Verificación en dos pasos activada.` Estado → Activada.
4. **No** mostrar URI `otpauth` salvo opciones avanzadas / oculto.

### 4.5 Seguridad — verificación en dos pasos (desactivar)

1. Estado Activada → sección desactivar.
2. Contraseña + código de verificación → CTA `Desactivar verificación en dos pasos`.
3. Éxito: `Verificación en dos pasos desactivada.`

---

## 5. Empty / loading / feedback

No hay empty de «primera vez» de parque (siempre hay consola). Distinguir:

| Condición | Qué se ve |
| --- | --- |
| **Carga identidad** | Skeleton con forma (grilla de slots + campos) **o** formulario no editable (`disabled` / `aria-busy`). Texto de apoyo opcional: `Cargando identidad de la consola…`. Prohibido solo texto suelto con campos editables. |
| **Carga MFA** | Placeholder de estado con altura fija: `Comprobando verificación en dos pasos…`. Sin layout shift. |
| **Éxito / error / info** | `Alert` de `@iwana/ui` (`variant` success \| error \| info). **Prohibido** `FORM_ALERT_*` en esta superficie. |
| **Error de carga identidad** | `Alert` + copy error carga §3. No fingir formulario vacío «sin datos» como empty de producto. |
| **Dialog eliminar** | Copy §3; CTAs Eliminar imagen / Sí, eliminar. |

Slots sin imagen: estado vacío del control de subida (dropzone), no empty de página. Ayuda MIME amigable (§3), sin IANA.

---

## 6. Accesibilidad (WCAG 2.2 AA)

- **Un H1:** `Plataforma`. Sin CardTitle que compita.
- Tabs con nombre accesible de ámbito (p. ej. configuración de plataforma); textos visibles = Identidad / Seguridad.
- Slot de imagen: botón con **`interactiveFocusClassName`** (foco visible teclado). Targets ≥ 44 px en CTAs.
- Preview: eyebrows con `.portal-eyebrow` / muted; **sin** `tracking-[…]` local (detalle visual → DS).
- Color no es la única señal de `Alert` (icono + texto).
- Si identidad y a11y chocan, prevalece a11y y se documenta en el contrato DS.

---

## 7. Estados de la pantalla

| Estado | Qué se ve |
| --- | --- |
| **Idle Identidad** | Formulario operable; sin Alert. |
| **Carga Identidad** | Skeleton / no editable (§5). |
| **Idle Seguridad** | Contraseña + bloque verificación (Activada o Desactivada). |
| **Carga MFA** | Estado «Comprobando…» con altura fija. |
| **Setup MFA** | QR + confirmar código; otpauth no visible en camino feliz. |
| **Feedback** | `Alert` success/error según §3. |
| **Submitting** | CTAs disabled; no doble envío. |

---

## 8. Criterios de aceptación (CA-SET)

Transcritos del informe. Todos deben PASS en G6. No reenumerar.

| ID | Criterio |
| --- | --- |
| **CA-SET-01** | Cero «MFA», «TOTP», «Authenticator» y «branding» crudo en copy visible de `/settings`. |
| **CA-SET-02** | Feedback success/error/info usa `Alert` de `@iwana/ui` (no `FORM_ALERT_*` en esta superficie). |
| **CA-SET-03** | Tabs sobre el canvas. Secciones = paneles `shadow-iwana-card`. **Sin** `Card` envolvente de página. **Sin** panel con sombra dentro de otro. |
| **CA-SET-04** | Pozos de apoyo = `iwana-surface-soft` (+ dark-surface); superficies `rounded-2xl`; controles `rounded-xl`. |
| **CA-SET-05** | Botón de slot de activo con `interactiveFocusClassName` (foco visible teclado). |
| **CA-SET-06** | Carga inicial de branding: skeleton con forma o formulario no editable (`disabled`/`aria-busy`); sin solo texto suelto. |
| **CA-SET-07** | Eyebrows de preview con `.portal-eyebrow` / muted; sin `tracking-[…]` local. |
| **CA-SET-08** | Copy de pantalla en `PLATFORM_UI_COPY` (o helper settings); nav permanece «Plataforma». |
| **CA-SET-09** | Cero «Gobierno y configuración global»; subtítulo sin «parámetros»/«branding»; tab General retirado o sin prosa triple. *(En esta spec: tab General **retirado**; deslinde en B0.)* |
| **CA-SET-10** | Cero «Superficie», «metadata», «slot», «fallback» en labels/mensajes de producto; tab sin anglicismo Branding. |
| **CA-SET-11** | Errores recuperables: `No pudimos… Reintenta en unos minutos.`; éxitos breves sin «correctamente». |
| **CA-SET-12** | Tests unitarios de settings esperan el vocabulario nuevo (CA-SET-01, 09–11); URI `otpauth` fuera del camino feliz. |

---

## 9. Fuera de alcance

| Fuera | Motivo |
| --- | --- |
| `apps/portal` settings | Superficie distinta |
| `/tenants/[id]/settings` | Fuera; solo referencia viva de `Alert` + skeleton |
| Sidebar / shell / nav rename | Nav «Plataforma» intacta |
| API, OpenAPI, migraciones, endpoints nuevos | Contrato intacto (prompt §1.3) |
| Refactor transversal `form-styles.ts` / auth fuera de `/settings` | Carril acotado |
| Tokens de marca nuevos · primitives nuevas en `@iwana/ui` | Carril rápido DS (0 primitives) |
| Reabrir 2 tabs / General / CardTitle Gobierno | Decisiones EM-ARCH congeladas |

---

## Decisiones no reabiertas (EM-ARCH)

| # | Decisión |
| --- | --- |
| 1 | **Dos tabs:** `Identidad` \| `Seguridad`. **Retirar** tab General; deslinde a Empresas en PageHeader. |
| 2 | **Sin CardTitle** «Gobierno…». H1 `Plataforma` basta (sin título de Card). |
| 3 | Copy = matriz del informe (literal). Canon MFA → «verificación en dos pasos». |
| 4 | `Alert` de `@iwana/ui` en Seguridad e Identidad (no `FORM_ALERT_*` aquí). |
| 5 | Tabs sobre canvas; paneles por sección (paridad Historial/Empresas). Sin Card envolvente. |
| 6 | Pozos soft + `rounded-2xl`; dropzone `rounded-xl`; foco slot con `interactiveFocusClassName`. |
| 7 | Loading: skeleton o fieldset/`aria-busy` no editable. |
| 8 | URI `otpauth` fuera del camino feliz. |
| 9 | Tests Jest al vocabulario nuevo. |

---

*Congelado 2026-08-11 por AI-PROD-UX · v1.0. Track A del prompt ALINEACION-v1.0 (protocolo §3bis). Cita matriz + CA-SET del informe; no inventa API ni tokens. Sin `[BLOQUEO]`.*
