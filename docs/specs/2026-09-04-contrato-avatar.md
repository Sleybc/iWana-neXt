# Contrato DS — `Avatar` e identidad de persona en la UI

**Fecha:** 2026-09-04
**Versión:** v1.0 — CONGELADA
**Estado:** Congelado (desbloquea Acto 2 FE-PLATFORM)
**Dueño:** AI-DS-OWNER
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) hallazgo P-12 · [PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0](../prompts/PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0.md) Acto 1
**Alcance:** `packages/ui` (nuevo primitive), `packages/shared` (`formatFullName` + `getInitials`), 6 sitios de §3 del prompt + `DropdownUser` del portal
**No-alcance:** `components/profile/` (turno de perfil abierto — el prompt §6.4 lo prohíbe; Acto 2 coordina con EM-ARCH), `TenantSeal` / `TenantCreateSummary` como identidad de tenant (no son persona — ver §8), gravatar/P-13 (código muerto, dueño fe-platform)

---

## 1. Decisión ejecutiva

Un solo `Avatar` de persona en `@iwana/ui`, un solo `getInitials` canónico en `@iwana/shared`, un solo fallback (icono, nunca email), radio único `full`, tamaños contra la escala vigente. Las seis implementaciones de §3 del prompt se retiran en Acto 2.

## 2. Anatomía

```text
Avatar = contenedor circular (rounded-full) → [ <img avatarUrl> | iniciales (1–2 grafemas) | icono User ]
```

- Contenedor: `flex items-center justify-center overflow-hidden rounded-full shrink-0`.
- Contenido mutuamente excluyente, prioridad: imagen válida > iniciales > icono fallback.
- Sin punto de presencia ni badge acoplado (el punto verde de `ProfileHeader.tsx:30` está retirado por INFORME-MOD04 §3.4: dato inexistente, sin alternativa textual, contraste 1,74:1).

## 3. API pública (props)

| Prop | Tipo | Defecto | Regla |
| --- | --- | --- | --- |
| `name` | `string` (requerido) | — | Nombre visible completo, ya compuesto con `formatFullName`. Alimenta iniciales y nombre accesible. Nunca email (ver §5). |
| `avatarUrl` | `string \| null \| undefined` | `undefined` | Existe en el modelo (`UserProfile.avatarUrl`, `InternalUser`) y hoy no se renderiza en ningún sitio. `null`/`undefined`/`''`/solo-blancos → sin imagen. Error de carga → cae a iniciales/icono sin reintento. |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Escala cerrada, sin `className` de tamaño libre (ver §6). |
| `variant` | `'default' \| 'soft'` | `'default'` | `default`: fondo de marca para superficies claras. `soft`: fondo tintado para triggers y cabeceras donde el pleno vibra. Sin variante cuadrada: el avatar de persona es siempre circular. |
| `labelledById` | `string \| undefined` | — | Cuando el nombre visible ya está junto al avatar, el contenedor es decorativo (`aria-hidden`, ver §7). Solo cuando el avatar va solo se usa `role="img"` + `aria-label`. |

## 4. `getInitials(name)` canónico

Firma de contrato (implementa FE-PLATFORM en `@iwana/shared`, con `formatFullName` exportable que absorbe las 22 copias del patrón `[firstName, lastName].filter(Boolean).join(' ')`): `getInitials(name: string): string` — devuelve `''` cuando no hay nada computable; el icono fallback lo decide `Avatar`, no esta función.

Reglas (decisión, no promedio):

1. Normalizar: `trim`, colapsar `/\s+/`. Cadena vacía → `''`.
2. Palabras = segmentos no vacíos. Primera + última palabra (no primera + segunda: "María del Carmen Ruiz" → "MR", no "MD").
3. Un grafema de cada una (primera de la primera palabra + primera de la última), mayúsculas con `toLocaleUpperCase('es')`. Máximo 2 caracteres visibles.
4. Una sola palabra → sus 2 primeros grafemas ("Madonna" → "MA"; "Li" → "LI"; "Ø" → "Ø").
5. Segmentación por grafemas, nunca por unidades UTF-16: `firstName?.[0]` / `charAt(0)` / `slice(0,2)` rompen pares sustitutos (emoji, caracteres fuera del BMP). Exigir `Intl.Segmenter` (granularidad `grapheme`) con reserva a puntos de código, nunca a unidades UTF-16.
6. Dígitos y signos se conservan tal cual ("3M" es válido); no se inventa letra.

Tabla de verdad (fija los tests de Acto 2):

| Entrada | Salida |
| --- | --- |
| `"Ana Gómez"` | `"AG"` |
| `"Madonna"` | `"MA"` |
| `""` / `"   "` | `""` → icono |
| `null` (nombre ausente) | `""` → icono |
| `"María del Carmen Ruiz"` | `"MR"` |
| `"José"` (una palabra) | `"JO"` |
| `"A"` | `"A"` |
| `"😀 Pérez"` (fuera BMP primero) | grafema `"😀"` + `"P"`, sin sustituto roto |
| `"ana gÓmez"` | `"AG"` (mayúsculas) |

Fallback único: `getInitials` devuelve `''` y `Avatar` pinta el icono genérico `User` (lucide, `aria-hidden`). Retirados los cuatro fallbacks divergentes (`'?'`, `'iW'`, `'U'`, email). `'iW'` queda solo donde hoy vive con sentido de marca transitoria, fuera de persona.

## 5. Privacidad: el fallback nunca deriva del email

**Decisión: en ninguna superficie.** La implementación #2 (`ScheduleCalendar`, `email.slice(0,2)`) filtra la dirección de un tercero en vistas donde el email no se expone (un calendario operativo muestra técnicos ajenos). El avatar no es canal de identificación por correo.

- `Avatar` / `getInitials` jamás aceptan email como entrada. Si solo hay email (caso `UsersTable`: `firstName || lastName || email`), el nombre visible puede mostrarlo —esa es decisión de la tabla—, pero el avatar pinta el icono fallback.
- `formatFullName` cae a `''` (→ icono), nunca a email. El `formatPortalUserTitle` actual (cae a email) se mantiene solo como título textual del buscador, no como fuente de iniciales.

> `[CONSULTA → AI-PROD-UX]` Si el icono genérico en listados operativos (p. ej. `UsersTable`, calendario) degrada la identificación rápida de personas frente a una inicial: veredicto provisional DS-OWNER — no bloquea, porque el texto identificativo (nombre o email) permanece adyacente y el avatar es decorativo allí (§7). PROD-UX confirma o pide variante distinguible sin PII antes del verde de Acto 2.

## 6. Tokens y escala (sin valores nuevos)

- Forma: solo `rounded-full` (token `--radius-full`). Ningún radio nuevo ni arbitrario; este turno no toca los radios escalados al CTO (prompt §6.1).
- Fondos por token, nunca hex: `default` → `bg-iwana-primary` + `text-white` (contraste ~15:1, AA sobrado); `soft` → `bg-iwana-primary-100` + `text-iwana-primary-700` (oscuro sobre tintado claro, AA). Lima nunca como fondo de avatar (dirección Firma iWana: lima no es fondo base).
- Dark mode: mismos fondos de marca; borde de imagen si lo hay con `dark-border-2`; icono fallback hereda `dark-surface-4` solo como superficie del contenedor cuando `soft` no aplique. Nada de `dark:bg-gray-*` (norma ADR-056).
- Tamaños contra clases ya vigentes en el repo (sin inventar escala):

| `size` | Clases | Uso |
| --- | --- | --- |
| `sm` | `h-8 w-8 text-xs` | Tablas, calendarios, menús |
| `md` | `h-10 w-10 text-sm` | Triggers (`DropdownUser` ambos portales) |
| `lg` | `h-16 w-16 text-xl` | Resúmenes (ex-`TenantSeal lg`) |
| `xl` | `h-20 w-20 text-2xl` | `ProfileHeader` (medida actual conservada) |

- Si Acto 2 necesita una medida intermedia, escala a la más próxima de esta tabla — no la inventa en el componente.

## 7. Accesibilidad (WCAG 2.2, prevalece sobre identidad)

Avatar de iniciales = contenido no textual. Dos modos, sin tercera opción:

- **Con nombre visible adyacente** (caso `ProfileHeader`, `DropdownUser`, celdas con nombre): avatar **decorativo** — contenedor con `aria-hidden="true"`, sin `role`, sin `aria-label`. Esto retira el defecto actual: `aria-label` sobre `<div>` sin rol que ARIA descarta (`ProfileHeader.tsx:27-29`).
- **Avatar solo, sin texto adyacente** (trigger icónico, celda solo-avatar): `role="img"` + `aria-label="Avatar de {name}"`; si `name` vacío, `"Avatar de usuario sin nombre"`. Texto en español, sentence case.
- Imagen: `<img alt="">` en modo decorativo; `alt={name}` solo en modo solo-avatar. `onError` → fallback sin trampa de foco.
- Cuando el avatar vive dentro de un trigger, el foco visible lo aporta el trigger (`interactiveFocusClassName`), no un anillo propio.

## 8. Matriz de consolidación (los 6 sitios + 1)

| # | Sitio | Hoy | Acto 2 |
| --- | --- | --- | --- |
| 1 | `portal/.../profile/ProfileHeader.tsx:18-19` | `firstName[0]+lastName[0]`, fallback `'?'`, `aria-label` sin rol, `h-20 w-20` | `Avatar size="xl" name={fullName}` decorativo; retirar punto de presencia (§3.4 informe) |
| 2 | `portal/.../scheduling/ScheduleCalendar.tsx:143-153` | cae a `email.slice(0,2)` | `Avatar size="sm"`; **prohibida** la caída a email (§5) |
| 3 | `portal/.../layout/TenantSeal.tsx:22-29` | iniciales de tenant, fallback `'?'` | **Fuera de `Avatar`**: identidad de tenant, no de persona; conserva su contrato propio |
| 4 | `web/.../tenants/TenantCreateSummary.tsx:26-31` | copia de #3, fallback `'iW'` | Idem #3; unificar #3/#4 entre sí, no contra `Avatar` |
| 5 | `web/.../layout/DropdownUser.tsx:30-41` | `displayName[0]`, fallback `'U'`, `aria-hidden` correcto | `Avatar size="md" variant="soft"`; conservar `aria-hidden` |
| 6 | `web/.../users/UsersTable.tsx:77-80` | `charAt(0)`, rompe fuera BMP | `Avatar size="sm"`; sin nombre → icono aunque la celda muestre email |
| +1 | `portal/.../layout/DropdownUser.tsx:57-59` | icono genérico sin iniciales | `Avatar size="md" name={displayName}` (primera vez con identidad real) |

`@iwana/ui` no exporta `Avatar` (verificado `packages/ui/src/index.ts`): Acto 2 lo añade al barrel plano. Sin `Tooltip` en este turno.

## 9. Estados requeridos (contrato mínimo testeable)

Imagen ok · imagen rota → fallback · iniciales · icono (vacío) · `soft`/`default` en claro y oscuro · decorativo vs `role="img"` · skeleton de carga del contenedor padre (el avatar no parpadea entre estados). Un test por cada regla que hoy diverge: una palabra, vacío, apellido ausente, fallback único, no-email, fuera BMP (prompt §5.4).

## 10. Changelog DS

- `2026-09-04` v1.0 congelada: nace `Avatar` (persona) + `getInitials` + `formatFullName` exportable; retira 6 divergencias P-12; `TenantSeal` declarado fuera de alcance persona.

## 11. Handoff a Acto 2 (FE-PLATFORM)

Spec congelada: `docs/specs/2026-09-04-contrato-avatar.md` v1.0. Migración por aplicación (portal → verde → web). Gates: `pnpm --filter @iwana/ui exec jest --ci`, portal, web, `pnpm lint && pnpm typecheck` (jest directo, nunca script `test`). STOP y `[BLOQUEO]` a EM-ARCH si aparece un séptimo sitio con lógica distinta, si el contrato exigiera un token inexistente, o si la consulta PROD-UX §5 sale en contra.
