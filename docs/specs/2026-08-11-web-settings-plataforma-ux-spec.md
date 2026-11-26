# UX spec — Plataforma · settings (apps/web)

**Versión:** 1.4  
**Estado:** Congelado — v1.3 aprobada por el CTO el 2026-11-25; v1.4 (AI-PROD-UX, 2026-11-25): activación manual de pestañas y aviso de cambios sin guardar en Identidad (plan 2026-11-25, T2–T3)  
**Fecha:** 2026-08-11  
**Propietario:** AI-PROD-UX  
**Alcance:** `/settings` de `apps/web`. **No aplica a** `apps/portal` ni a `/tenants/[id]/settings`.  
**Prompt:** [`PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md)  
**Plan:** [`2026-08-11-web-settings-alineacion.md`](../plans/2026-08-11-web-settings-alineacion.md)  
**Informe:** [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md)  
**Contrato DS hermano:** [`2026-08-11-web-settings-plataforma-ds-contrato.md`](2026-08-11-web-settings-plataforma-ds-contrato.md) v1.3  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Copy vivo:** [`apps/web/src/lib/platform-ui-copy.ts`](../../apps/web/src/lib/platform-ui-copy.ts) → crear bloque `settings`; nav `Plataforma` no cambia (`navigation.settings`)  
**Forma de referencia (estructura, no copy):** [`2026-08-11-web-audit-logs-historial-ux-spec.md`](2026-08-11-web-audit-logs-historial-ux-spec.md) · [`2026-08-11-web-empresas-directorio-ux-spec.md`](2026-08-11-web-empresas-directorio-ux-spec.md)  
**Vocabulario:** skill `system-vocabulary-review` (MFA → verificación en dos pasos; errores `No pudimos… Reintenta…`)

### Changelog

| Ver | Estado | Cambio |
| --- | --- | --- |
| 1.0 | Congelado (superado en §2 cáscara) | Alineación post-auditoría: 2 tabs Identidad \| Seguridad; sin General ni CardTitle «Gobierno…»; copy literal; CA-SET-01…12. |
| **1.1** | Congelado (superado en layout Seguridad) | Cáscara = Historial/Empresas: tabs sobre el canvas; cada sección es panel blanco con sombra de card. Sin `Card` envolvente. CA-SET-03 reescrito. |
| 1.2 | Congelado (superado) | Seguridad en dos columnas `lg+` (contraseña \| verificación); apilado en viewport estrecho. |
| **1.3** | **Congelado** | 2026-11-25. Tres pestañas con `?seccion=`; Nombres antes de Imágenes; Seguridad enlaza a Mi cuenta; la consola no ofrece desactivar la verificación en dos pasos. CA-SET-02, 09, 11 y 12 ajustados; CA-SET-13…16 nuevos. |

---

## 1. Persona / tarea

**Persona:** operador de plataforma (`SYSTEM_ADMIN`) en `apps/web`.

**Tarea (un ciclo, sin wizard):**

1. **Ajusta** la identidad visual de la consola (logo, fondos de acceso, nombres públicos).
2. **Llega** a la seguridad de su cuenta, que vive en Mi cuenta (`/profile`), y decide qué ve Soporte iWana.
3. **No confunde** esta pantalla con la configuración de cada empresa (eso vive en Empresas).

Esta spec **alinea** chrome, copy, Alert, loading y a11y del slot. **No rediseña** la tarea ni pide contratos API nuevos. La verificación en dos pasos es obligatoria en plataforma y la ruta de desactivación es solo de empresa: la consola no la ofrece.

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
| Subtítulo | `Identidad de la consola y visibilidad para soporte.` |
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
| Tab 3 | `Visibilidad para soporte` |
| Tab General | **Retirado** |

La pestaña vive en `?seccion=`: `identidad` · `seguridad` · `equipo`. Ausente o inválida = `Identidad`. Cambiar de pestaña usa `router.replace` (sin scroll ni entradas en el historial) y conserva los demás parámetros. Flechas, Inicio y Fin mueven el foco; Enter o Espacio activan la pestaña (activación manual, 2026-11-25). Con cambios sin guardar en Identidad, la pestaña muestra un punto ámbar y «(cambios sin guardar)» para lectores de pantalla; cambiar de pestaña no pregunta porque el borrador se conserva. Salir de la página por un enlace interno o con Atrás pide confirmación: «¿Salir sin guardar?», con «Seguir editando» (foco inicial, también Esc) y «Salir sin guardar». Límite conocido: la navegación programática (buscador global, cerrar sesión) no pasa por este diálogo; cerrar o recargar usan el aviso nativo del navegador.

### Panel Identidad

Orden de bloques (tarea → apoyo):

1. H2 + ayuda corta (§3).
2. Feedback `Alert` (éxito / error / info) cuando aplique.
3. Carga: skeleton con forma (§5) **o** formulario no editable (`fieldset`/`disabled` + `aria-busy`).
4. Sección nombres (Producto, Nombre en la consola, Título de pestaña, Descripción corta) + vista previa + CTAs: Restaurar valores por defecto · Guardar cambios.
5. Sección «Imágenes de la consola» (logo, favicon, fondos de acceso).

El borrador se conserva al cambiar de pestaña y al actualizar una imagen. Con cambios pendientes, cerrar o recargar la página pide confirmación del navegador.

### Panel Seguridad

Un panel con título, ayuda y enlace a `/profile#profile-security-heading`, cuyo encabezado recibe el foco. Sin formularios de contraseña ni verificación en dos pasos.

### Panel Visibilidad para soporte

Un panel con enlace a Usuarios internos y el interruptor de uso por empresa (ADR-114). Solo lectura para quien no es `SYSTEM_ADMIN`.

---

## 3. Copy canónico (literal — matriz del informe)

Matriz v1.0 desde [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md) § Matriz, con los cambios de v1.3. Sentence case. Fuente: bloque `PLATFORM_UI_COPY.settings` (+ nav existente). Cero strings sueltos nuevos en JSX.

| Zona | Texto exacto |
| --- | --- |
| **Nav** | Plataforma |
| **PageHeader title** | Plataforma |
| **PageHeader subtitle** | Identidad de la consola y visibilidad para soporte. |
| **Deslinde Empresas (B0)** | La configuración de cada empresa está en Empresas. |
| **CardTitle** | *(ninguno — H1 basta)* |
| **Tab Identidad** | Identidad |
| **Tab Seguridad** | Seguridad |
| **Tab Visibilidad** | Visibilidad para soporte |
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
| **Confirmar restaurar** | ¿Restaurar la identidad de la consola? · Se aplicarán los valores por defecto a toda la consola y se descartarán los cambios pendientes. |
| **Ayuda imágenes** | Subir o eliminar una imagen aplica el cambio de inmediato. Si editas una dirección en Opciones avanzadas, usa Guardar cambios. |
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
| **Seguridad H2** | Seguridad de tu cuenta |
| **Seguridad ayuda** | Gestiona tu correo de acceso, contraseña y verificación en dos pasos en Mi cuenta. |
| **Seguridad enlace** | Abrir seguridad en Mi cuenta |
| **Visibilidad H2** | Qué ve Soporte iWana |
| **Visibilidad enlace** | Usuarios internos |
| **Visibilidad interruptor** | Mostrar uso por empresa a Soporte iWana |
| **Visibilidad error carga / guardado** | No pudimos cargar esta preferencia. / No pudimos guardar el cambio. (ambos: Reintenta en unos minutos.) |
| **Visibilidad solo lectura** | Solo el administrador de plataforma puede cambiar esta opción. |

### Prohibido en UI visible de `/settings`

`MFA` · `TOTP` · `Authenticator` · `branding` (crudo) · `Gobierno y configuración global` · `parámetros` · `Superficie` · `metadata` · `slot` · `fallback` · `tenant` · «No fue posible…» · «…correctamente» · MIME IANA crudo al usuario.

Nav permanece **Plataforma** (no se renombra a Settings ni a Configuración).

---

## 4. Flujos

### 4.1 Identidad — guardar

1. Operador edita imágenes y/o nombres.
2. Guarda → `Alert` success: `Identidad guardada.`
3. Fallo → `Alert` error con copy §3 + reintento implícito (vuelve a editar / Guardar).

### 4.2 Identidad — restaurar / eliminar imagen

- Restaurar: Dialog de confirmación con copy §3 → éxito `Valores por defecto restaurados.`
- Eliminar imagen de un slot: Dialog con body canónico → éxito `Imagen eliminada. Se usa la imagen por defecto.`

### 4.3 Seguridad

`Abrir seguridad en Mi cuenta` → Mi cuenta, con foco en el encabezado de seguridad. Activar la verificación en dos pasos, el correo y la contraseña se gestionan allí. No hay flujo de desactivación.

### 4.4 Visibilidad para soporte

Alternar el interruptor guarda al instante y anuncia el resultado; si falla, vuelve al valor anterior.

---

## 5. Empty / loading / feedback

No hay empty de «primera vez» de parque (siempre hay consola). Distinguir:

| Condición | Qué se ve |
| --- | --- |
| **Carga identidad** | Skeleton con forma (grilla de slots + campos) **o** formulario no editable (`disabled` / `aria-busy`). Texto de apoyo opcional: `Cargando identidad de la consola…`. Prohibido solo texto suelto con campos editables. |
| **Carga Visibilidad** | Skeleton con `role="status"`. |
| **Éxito / error / info (Identidad)** | `Alert` de `@iwana/ui` (`variant` success \| error \| info). **Prohibido** `FORM_ALERT_*` en esta superficie. |
| **Error de carga identidad** | `Alert` + copy error carga §3. No fingir formulario vacío «sin datos» como empty de producto. |
| **Visibilidad** | Error de carga: `ErrorState` con reintento. Guardado: texto con `aria-live`. |
| **Dialog eliminar** | Copy §3; CTAs Eliminar imagen / Sí, eliminar. |

Slots sin imagen: estado vacío del control de subida (dropzone), no empty de página. Ayuda MIME amigable (§3), sin IANA.

---

## 6. Accesibilidad (WCAG 2.2 AA)

- **Un H1:** `Plataforma`. Sin CardTitle que compita.
- Tabs con nombre accesible de ámbito (p. ej. configuración de plataforma); textos visibles = Identidad / Seguridad / Visibilidad para soporte.
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
| **Seguridad** | Enlace a Mi cuenta; sin estados de carga ni feedback. |
| **Visibilidad para soporte** | Interruptor operable o de solo lectura; carga, error y guardado (§5). |
| **Feedback** | `Alert` success/error según §3. |
| **Submitting** | CTAs disabled; no doble envío. |

---

## 8. Criterios de aceptación (CA-SET)

CA-SET-01…12 del informe, con los ajustes de v1.3; CA-SET-13…16 nuevos. Los PASS del informe de 2026-08-11 no cubren v1.3. No reenumerar.

| ID | Criterio |
| --- | --- |
| **CA-SET-01** | Cero «MFA», «TOTP», «Authenticator» y «branding» crudo en copy visible de `/settings`. |
| **CA-SET-02** | En Identidad, el feedback success/error/info usa `Alert` de `@iwana/ui` (no `FORM_ALERT_*` en esta superficie). Visibilidad: `ErrorState` y `aria-live`. |
| **CA-SET-03** | Tabs sobre el canvas. Secciones = paneles `shadow-iwana-card`. **Sin** `Card` envolvente de página. **Sin** panel con sombra dentro de otro. |
| **CA-SET-04** | Pozos de apoyo = `iwana-surface-soft` (+ dark-surface); superficies `rounded-2xl`; controles `rounded-xl`. |
| **CA-SET-05** | Botón de slot de activo con `interactiveFocusClassName` (foco visible teclado). |
| **CA-SET-06** | Carga inicial de branding: skeleton con forma o formulario no editable (`disabled`/`aria-busy`); sin solo texto suelto. |
| **CA-SET-07** | Eyebrows de preview con `.portal-eyebrow` / muted; sin `tracking-[…]` local. |
| **CA-SET-08** | Copy de pantalla en `PLATFORM_UI_COPY` (o helper settings); nav permanece «Plataforma». |
| **CA-SET-09** | Cero «Gobierno y configuración global»; subtítulo sin «parámetros»/«branding»; tab General retirado o sin prosa triple. *(En esta spec: tab General **retirado**; deslinde en B0; tabs Identidad, Seguridad y Visibilidad para soporte.)* |
| **CA-SET-10** | Cero «Superficie», «metadata», «slot», «fallback» en labels/mensajes de producto; tab sin anglicismo Branding. |
| **CA-SET-11** | Errores recuperables: `No pudimos… Reintenta en unos minutos.`; éxitos breves sin «correctamente». Aplica a Identidad y Visibilidad. |
| **CA-SET-12** | Tests unitarios de settings esperan el vocabulario nuevo (CA-SET-01, 09–11). `/settings` no muestra URI `otpauth` ni formularios de seguridad. |
| **CA-SET-13** | La pestaña se refleja en `?seccion=`; cambiarla usa replace, no suma entradas al historial y conserva los demás parámetros. Valor ausente o inválido = Identidad. |
| **CA-SET-14** | Seguridad enlaza a `/profile#profile-security-heading`. La consola no ofrece desactivar la verificación en dos pasos. |
| **CA-SET-15** | Nombres antes de Imágenes. El borrador se conserva al cambiar de pestaña o de imagen. |
| **CA-SET-16** | Restaurar valores por defecto pide confirmación y se puede cancelar. |

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
| Reabrir General / CardTitle Gobierno | Decisiones EM-ARCH congeladas |
| Flujos de Mi cuenta (`/profile`) | Otra superficie; aquí solo el enlace |

---

## Decisiones no reabiertas (EM-ARCH)

| # | Decisión |
| --- | --- |
| 1 | **Tres tabs** (v1.3, CTO 2026-11-25): `Identidad` \| `Seguridad` \| `Visibilidad para soporte`. Tab General **retirado**; deslinde a Empresas en PageHeader. |
| 2 | **Sin CardTitle** «Gobierno…». H1 `Plataforma` basta (sin título de Card). |
| 3 | Copy = §3 (matriz del informe con los cambios de v1.3). Canon MFA → «verificación en dos pasos». |
| 4 | `Alert` de `@iwana/ui` en Identidad (no `FORM_ALERT_*` aquí). |
| 5 | Tabs sobre canvas; paneles por sección (paridad Historial/Empresas). Sin Card envolvente. |
| 6 | Pozos soft + `rounded-2xl`; dropzone `rounded-xl`; foco slot con `interactiveFocusClassName`. |
| 7 | Loading: skeleton o fieldset/`aria-busy` no editable. |
| 8 | Seguridad personal en Mi cuenta; sin desactivar la verificación en dos pasos (v1.3, CTO 2026-11-25). |
| 9 | Tests Jest al vocabulario nuevo. |

---

*v1.0 congelada 2026-08-11 por AI-PROD-UX; v1.3 aprobada por el CTO. Track A del prompt ALINEACION-v1.0 (protocolo §3bis). Cita matriz + CA-SET del informe; no inventa API ni tokens. Sin `[BLOQUEO]`.*
