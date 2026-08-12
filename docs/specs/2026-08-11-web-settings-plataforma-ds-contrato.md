# Contrato DS · Plataforma / settings (`apps/web` `/settings`)

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.2 — **congelada / carril rápido**  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  

**Prompt:** [`PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md)  
**Plan:** [`2026-08-11-web-settings-alineacion.md`](../plans/2026-08-11-web-settings-alineacion.md)  
**Informe:** [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md)  
**UX hermana:** [`2026-08-11-web-settings-plataforma-ux-spec.md`](2026-08-11-web-settings-plataforma-ux-spec.md) **v1.1** Congelado  
**Firma:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**DS hermano Empresas:** [`2026-08-11-web-empresas-directorio-ds-contrato.md`](2026-08-11-web-empresas-directorio-ds-contrato.md) v1.0 (`Alert`, `rounded-2xl`, soft)  
**DS hermano Historial:** [`2026-08-11-web-audit-logs-historial-ds-contrato.md`](2026-08-11-web-audit-logs-historial-ds-contrato.md) (`Alert`, `interactiveFocusClassName`, `SkeletonBlock`)  
**Contrato padre Fase-1 (no se reescribe):** [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)  
**Referencia de composición viva (no importar):** `TenantSettingsForm` / `TenantCreateForm` — `Alert` + skeleton local

> Carril rápido (protocolo §3bis.3): receta de composición, **sin** tokens de marca nuevos, **sin** primitive nueva en `@iwana/ui`, **sin** importar `apps/portal`.  
> En conflicto de sombras / foco / dark, prevalece el contrato Fase-1.  
> El flujo (tabs Identidad|Seguridad, copy literal, URI `otpauth` fuera del camino feliz, CTAs) lo congela la UX hermana v1.0 + prompt ALINEACION-v1.0. Este contrato congela **piel y API visual**.

**Veredicto carril rápido:** **GO** — 0 primitives nuevas, 0 tokens de marca. Remedia Alert, una cáscara, pozos soft/2xl, foco de slot, loading y eyebrow con composición viva. No hay `[BLOQUEO]`.

### Changelog

| Ver | Fecha | Cambio |
| --- | --- | --- |
| **1.0** | 2026-08-11 | Congelación inicial Settings plataforma (alineación ALINEACION-v1.0; CA-SET-02…07 de piel). |
| **1.1** | 2026-08-11 | **DS-SET-SHELL:** tabs sobre el canvas (como Historial/Empresas). Cada sección operativa es panel `rounded-2xl` + `shadow-iwana-card`. **Prohibido** envolver tabs+contenido en un `Card` de página. Patrón canónico para settings/formularios de `apps/web`. |
| **1.2** | 2026-08-11 | Seguridad: grid 1 col / `lg:grid-cols-2` (contraseña \| verificación). |

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Receta |
| --- | --- | --- |
| DS-SET-SHELL | Cáscara de página | `PageHeader` + `Tabs` **sobre el canvas** (`bg-iwana-surface-soft`). **Sin** `Card` envolvente. Cada sección = panel blanco `rounded-2xl` + `border-gray-200` + `shadow-iwana-card` (misma piel que la tabla de Historial) |
| DS-SET-TABS | Tabs de sección | `Tabs` / `TabsList` / `TabsTrigger` de `@iwana/ui`; **dos** tabs: Identidad \| Seguridad; activo sin lima |
| DS-SET-ALERT | Feedback | `Alert` + `AlertDescription` de `@iwana/ui`; **prohibido** `FORM_ALERT_*` en esta superficie |
| DS-SET-WELL | Pozos de apoyo | `bg-iwana-surface-soft` (+ dark `dark-surface-3`) + `rounded-2xl`; dropzone / control de slot `rounded-xl` |
| DS-SET-SLOT | Slot de imagen (logo / favicon / fondos) | Botón de upload/preview + **`interactiveFocusClassName`**; target ≥ `min-h-11` donde sea control |
| DS-SET-LOAD | Carga remota | `SkeletonBlock` con forma **o** `fieldset`/`form` no editable + `aria-busy`; sin solo texto suelto |
| DS-SET-PREVIEW | Vista previa de nombres | Eyebrows con `.portal-eyebrow` / `.portal-eyebrow-muted`; sin `tracking-[…]` local |
| DS-SET-SEC | Bloques Seguridad | Cada bloque (contraseña, verificación) es un **panel de sección**; pozos solo como apoyo interno (slots). Sin `Card` de página |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Nueva primitive en `@iwana/ui` (p. ej. «SettingsPanel», «BrandingSlot») | Carril rápido: componer lo vivo |
| 2 | Importar `apps/portal/src/components/shared/portal-ui.tsx` desde web | Boundary de app |
| 3 | Tokens o hex de marca nuevos; `tailwind.config.*` | CSS-first; marca = CTO |
| 4 | `FORM_ALERT_*` / gradientes locales de `form-styles.ts` en `/settings` | Piel = `Alert` (CA-SET-02); consolidación transversal de auth = fuera de alcance |
| 5 | `Card` (u homólogo con `shadow-iwana-card`) envolviendo Tabs + todo el contenido | Rompe paridad con Historial/Empresas; el canvas ya es el fondo |
| 6 | Pozos `bg-gray-50` / `rounded-lg` como superficie operativa de apoyo | Soft + `rounded-2xl` (CA-SET-04) |
| 7 | Anillo/foco ad hoc distinto de `interactiveFocusClassName` en el slot | Un solo vocabulario de foco (Fase-1; CA-SET-05) |
| 8 | `animate-pulse` suelto / spinner de página / solo «Cargando…» como receta de carga | Skeleton o no-editable + `aria-busy` (CA-SET-06) |
| 9 | Eyebrow con `tracking-[0.12em]` u otra utilidad ad hoc | `.portal-eyebrow` (CA-SET-07) |
| 10 | Lima como urgencia, error o fondo de pozo (`iwana-secondary-50` de panel) | Firma §3 |
| 11 | `dark:bg-gray-{700-950}` | ADR-056 §2 |
| 12 | Portal settings · `tenants/[id]/settings` · API · OpenAPI · migraciones · sidebar | Fuera de alcance del prompt |

---

## 2. Tokens citados (existen en `globals.css`)

Verificados el 2026-08-11. Citar el token; no el hex.

| Token / utilidad | Dónde vive | Uso en este contrato |
| --- | --- | --- |
| `shadow-iwana-card` | `--shadow-iwana-card` (`@theme` sombras) | **Única** elevación de cáscara de página (`Card`) |
| `shadow-iwana-soft` | `--shadow-iwana-soft` | Base `Alert`; **no** segunda card anidada de Seguridad |
| `shadow-iwana-active` | `--shadow-iwana-active` | `hover:` solo si un control lo amerita (no sustituye foco) |
| `bg-white` / `dark:bg-dark-surface-2` | superficies | `Card` de página |
| `bg-iwana-surface-soft` | `--color-iwana-surface-soft` | Pozos de apoyo (identidad + secciones seguridad) |
| `dark:bg-dark-surface-3` | dark surfaces | Equivalente dark de pozo soft |
| `border-gray-200` / `dark:border-dark-border` | bordes | Cáscaras y pozos |
| `text-iwana-primary` / `text-iwana-primary-700` | texto de marca | Títulos de sección / H2 de tab |
| `interactiveFocusClassName` (`@iwana/ui`) | `packages/ui/src/focus.ts` | **Único** anillo de foco en slot upload y controles custom |
| `SkeletonBlock` (`@iwana/ui`) | `packages/ui/src/skeleton.tsx` | Carga con forma (grilla de slots / campos) |
| `Alert` / `AlertDescription` (`@iwana/ui`) | variantes `error` / `success` / `info` / `warning` / `neutral` | Feedback Identidad y Seguridad |
| `Button` (`@iwana/ui`) | `primary` / `secondary` / `outline` / `ghost` (no `lime` de urgencia) | CTAs Guardar / Actualizar / Activar / Confirmar |
| `Input` / `OtpInput` (`@iwana/ui`) | primitivas vivas | Campos de nombres / contraseña / código |
| Panel de sección (composición) | `rounded-2xl border-gray-200 bg-white p-5 shadow-iwana-card` | Cáscara de cada bloque (Identidad imágenes/nombres; Seguridad contraseña/MFA). Clase viva: `settingsSectionPanelClassName` |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | `packages/ui/src/components/Tabs.tsx` | Identidad \| Seguridad |
| `PageHeader` (patrón vivo web) | chrome de página | Título `Plataforma` + subtítulo (copy = UX) |
| `.portal-eyebrow` / `.portal-eyebrow-muted` | utilities en `globals.css` | `<dt>` / rótulos de preview |
| `rounded-2xl` superficie · `rounded-xl` control/dropzone · `rounded-lg` pozo de icono (si aplica) | radios `@theme` | Superficie 2xl; dropzone xl |
| `min-h-11` | utilidad (44 px) | Targets táctiles de botones / slot |

**Lima:** no entra en errores, warnings ni pozos de panel. `Badge variant="lime"` / `Button variant="lime"` **no** se usan como urgencia en esta superficie. Texto de acento lima, si aparece vía eyebrow del sistema, es el de `.portal-eyebrow` (`text-iwana-secondary-700` / dark `-400`) — nunca `text-iwana-secondary` suelto.

`--shadow-iwana-card` es visualmente idéntica a `--shadow-iwana` (Fase-1). Se elige **`shadow-iwana-card`** por semántica de sección/card, en paridad con Empresas e Historial.

---

## 3. Receta DS-SET-SHELL — cáscara de página

| Pieza | Receta |
| --- | --- |
| Chrome | `PageHeader` con título canónico de nav (`Plataforma`) + subtítulo orientado a tarea (copy = UX). |
| Tabs | Sobre el canvas, **fuera** de cualquier Card. Misma gramática que Historial (`overflow-x-auto` + `TabsList`). |
| Cáscara de contenido | **Cada sección** es un panel: `rounded-2xl border border-gray-200 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2`. |
| Título de página | H1 en PageHeader. **Sin** CardTitle de envoltorio. **Prohibido** «Gobierno y configuración global». |

**Patrón canónico `apps/web` (settings y formularios de módulo):** el canvas `iwana-surface-soft` es el fondo; tabs sueltas; bloques operativos = paneles `shadow-iwana-card`. **Nunca** un `Card` que envuelva tabs + todo el tab.

**Prohibido:** `Card` envolvente de página; `shadow-sm` / `shadow-lg` ad hoc; panel con sombra **dentro** de otro panel con sombra.

---

## 4. Receta DS-SET-TABS — Identidad | Seguridad

Primitive: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` de `@iwana/ui`.

| Pieza | Receta viva |
| --- | --- |
| Conjunto | **Dos** tabs: Identidad \| Seguridad. Tab General **retirado** (decisión EM-ARCH #1; deslinde a Empresas = subtítulo UX, no tercer tab). |
| `TabsList` | Track del CVA vivo (`rounded-xl bg-gray-100/80 …`). |
| Activo | Posición del sistema de tabs (`data-[state=active]:bg-white…`) — **sin** lima / `iwana-secondary-50`. |
| Foco | Ring del CVA (`focus-visible:ring-2 focus-visible:ring-iwana-primary`) o equivalente ya en primitive. |

Copy de triggers = UX / matriz. Piel no añade prosa bajo las tabs.

---

## 5. Receta DS-SET-ALERT — feedback

**Obligatorio** en Identidad (`PlatformBrandingSettings`) y Seguridad (`SecuritySettings`): `Alert` + `AlertDescription` de `@iwana/ui`.

| Caso | Variant |
| --- | --- |
| Error recuperable (carga / guardar / upload / MFA / contraseña) | `error` |
| Éxito breve (guardado / activada / desactivada / contraseña) | `success` |
| Info de setup (QR / instrucciones post-activar) | `info` o `neutral` |
| Aviso no bloqueante | `warning` o `neutral` |

Base viva: `rounded-2xl border px-4 py-3 text-sm shadow-iwana-soft`.  
`role` lo resuelve la primitive (`error` → `alert`; resto → `status`). Icono Lucide opcional vía prop `icon`.

**Prohibido en esta superficie:**

- `FORM_ALERT_*` / `AUTH_FORM_ALERT_*` / cajas con `linear-gradient(...)` o `rounded-[24px]` locales.
- Caja ad hoc `border-red-*` / `bg-red-50` suelta fuera de `Alert`/`Badge`.

Copy de mensajes = UX / `PLATFORM_UI_COPY.settings` (CA-SET-08…11). Este contrato solo congela la **piel**.

---

## 6. Receta DS-SET-WELL — pozos de apoyo

Unificar pozos de Identidad (secciones de nombres / assets) y Seguridad (bloques internos) a la misma gramática.

| Pieza | Receta |
| --- | --- |
| Pozo de sección | `rounded-2xl border border-gray-200 bg-iwana-surface-soft … dark:border-dark-border dark:bg-dark-surface-3` (opacidad `/70` aceptable si ya vive en General). |
| Dropzone / marco de slot | Contenedor de control: **`rounded-xl`** (radio de control, no `rounded-lg` ni `rounded-2xl` de superficie de página). |
| Iconos de sección | Sin `shadow-sm` ad hoc; reposo plano o, si hace falta elevación mínima, no competir con `shadow-iwana-card` del Card padre. |

**Prohibido:** `bg-gray-50` / `bg-gray-50/60` / `bg-gray-50/80` como pozo canónico; `rounded-lg` en superficie operativa de apoyo; `iwana-secondary-50` como fondo de pozo.

---

## 7. Receta DS-SET-SLOT — slot de imagen

Control primario de logo / favicon / fondos de acceso.

| Pieza | Receta |
| --- | --- |
| Interacción | `<button>` (o control nativo equivalente) de vista previa / subida. |
| Foco | **Obligatorio** `interactiveFocusClassName` de `@iwana/ui`. Prohibido depender solo de overlay `group-focus-visible:opacity-*` sin anillo. |
| Target | Área accionable ≥ `min-h-11` (44 px) en al menos un eje usable; no comprimir el hit-target a un icono solo. |
| Hover | Borde / overlay decorativos permitidos; **no** sustituyen el anillo de foco. |
| Summary avanzado | Si se conserva `<summary>` de «Opciones avanzadas…», también lleva `interactiveFocusClassName` (o ring equivalente del sistema). |
| Dialog de borrado | Patrón Dialog vivo de la página; copy = UX; no inventar primitive de confirmación. |

**Prohibido:** `ring-*` / `outline-*` ad hoc distintos del vocabulario Fase-1; slot sin foco teclado visible.

---

## 8. Receta DS-SET-LOAD — carga

| Superficie | Receta |
| --- | --- |
| Identidad (fetch inicial) | Preferido: `SkeletonBlock` con forma de grilla de slots + campos (`rounded-2xl` / alturas de fila). Alternativa aceptable: `fieldset` o formulario con controles no editables + `aria-busy={true}` en el contenedor mientras `isLoadingData`. |
| Seguridad (estado verificación en dos pasos) | Placeholder de estado con **altura fija** (skeleton corto o bloque soft) — no solo texto «Comprobando…» sin reserva de layout. |
| CTAs durante carga | `disabled` coherente; no dejar el formulario aparentar editable si la alternativa elegida es no-editable. |

**Prohibido:** solo string de carga sin skeleton ni `aria-busy`; spinner de página como receta primaria; `animate-pulse` suelto en `div` ad hoc cuando existe `SkeletonBlock` (el pulse encapsulado de `SkeletonBlock` sí es válido).

---

## 9. Receta DS-SET-PREVIEW — preview de nombres

| Pieza | Receta |
| --- | --- |
| Rótulos `<dt>` / eyebrows | `.portal-eyebrow` o `.portal-eyebrow-muted` de `globals.css`. |
| Tipografía | La utility del sistema define tracking/uppercase; **prohibido** `tracking-[0.12em]` u otros `tracking-[…]` locales. |
| Valores | Sentence case; copy de labels = UX (Nombre en la consola / Título de pestaña / …). |

---

## 10. Receta DS-SET-SEC — bloques Seguridad

| Pieza | Receta |
| --- | --- |
| Layout | `grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch`. Cada sección usa `settingsSectionPanelClassName` + `h-full`. Alertas fuera del grid, a ancho completo. |
| Pozos internos | DS-SET-WELL solo como apoyo **dentro** del panel (p. ej. slots de imagen), sin segunda sombra. |
| Feedback | DS-SET-ALERT. |
| Código | `OtpInput` de `@iwana/ui` (a11y interna del primitive; no re-auditar salvo regresión). |
| QR | Camino feliz = imagen QR; URI `otpauth` solo en opciones avanzadas u oculto (flujo = UX / CA-SET-12; piel no lo destaca). |

**Prohibido:** reintroducir un `Card` de página alrededor de Tabs + contenido; prohibido anidar paneles con `shadow-iwana-card`.

---

## 11. Matriz de estados

| Estado | Shell / Tabs | Slot / Wells | Alert / Load / Preview |
| --- | --- | --- | --- |
| hover | Trigger según CVA; CTAs Button vivos | Slot: borde/overlay; no lima filled | — |
| foco | Ring de Tabs / Button | **Solo** `interactiveFocusClassName` en slot y summary | — |
| activo / pressed | Tab activo = posición (blanco), sin lima | N/A | — |
| deshabilitado | CTAs `disabled` en submit/carga | Controles del form si `aria-busy` / fieldset | — |
| cargando | Tabs montados; contenido en skeleton o no-editable | Slots/campos = `SkeletonBlock` o disabled | `aria-busy` en contenedor |
| vacío | N/A (formulario, no listado) | Slot sin imagen = estado vacío del control (placeholder) | — |
| error | — | — | `Alert variant="error"` |
| success | — | — | `Alert variant="success"` |
| info / setup | — | — | `Alert variant="info"` \| `neutral` |
| readonly | Preview de nombres | Valores de preview no editables en el `<dd>` | Eyebrow sistema |

---

## 12. Checklist de cierre (FE / QA)

- [ ] **0 tokens nuevos** en `globals.css`.
- [ ] **0 primitives nuevas** en `@iwana/ui`.
- [ ] Feedback Identidad + Seguridad = `Alert` `@iwana/ui`; **0** `FORM_ALERT_*` en esta superficie (CA-SET-02).
- [ ] Tabs sobre canvas; **0** `Card` envolviendo Tabs+contenido. Secciones = `settingsSectionPanelClassName` (CA-SET-03). **0** panel con sombra anidado dentro de otro.
- [ ] Pozos = `iwana-surface-soft` (+ `dark-surface-3`); superficies `rounded-2xl`; dropzone `rounded-xl` (CA-SET-04).
- [ ] Botón de slot con `interactiveFocusClassName` (CA-SET-05).
- [ ] Carga: `SkeletonBlock` con forma **o** no-editable + `aria-busy` (CA-SET-06).
- [ ] Preview: `.portal-eyebrow` / muted; **0** `tracking-[…]` local (CA-SET-07).
- [ ] Tabs = Identidad \| Seguridad; activo sin lima; General retirado (piel; copy = UX).
- [ ] Lima nunca urgencia; **0** `iwana-secondary-50` de pozo; **0** `dark:bg-gray-{700-950}`.
- [ ] 0 imports desde `apps/portal`.
- [ ] `audit-ui.mjs` sobre `apps/web/src/app/(protected)/settings` + `apps/web/src/components/settings` → P0/P1 deterministas = 0.
- [ ] CA-SET-01, 08–12 (copy / tests / otpauth) = UX + FE + QA; este contrato no los redefine.

---

## 13. Relación con contratos padre / hermanos

- **Empresas / Historial:** se reutiliza `Alert`, `rounded-2xl` + `shadow-iwana-card`, `interactiveFocusClassName`, `SkeletonBlock`. Settings **no** copia chips KPI ni tabla.
- **Fase-1:** sombras duales, `dark-surface-*` e `interactiveFocusClassName` **no se reabren**.
- **Firma:** lima = avance; posición de tabs = sistema blanco/gris; errores = escala `error` vía `Alert`.
- **Auth / `form-styles.ts`:** consolidación transversal de `FORM_ALERT_*` queda **fuera** de este carril; solo se prohíbe su uso en `/settings`.
- Un cambio post-congelación se versiona **v1.1+** y se notifica a FE-PLATFORM y SR-QA vía AI-EM-ARCH.
