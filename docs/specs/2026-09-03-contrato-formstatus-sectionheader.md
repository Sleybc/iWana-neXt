# Contrato de componente — `FormStatus` y `SectionHeader`

**Versión:** 1.0
**Estado:** Congelado para la fase de consolidación de MOD04-Perfil
**Fecha:** 2026-09-03
**Autoría:** AI-DS-OWNER (contrato) · consolidado por AI-EM-ARCH
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — hallazgos P-08 y P-11
**Ubicación de destino:** `packages/ui/src/components/`
**Consumidor de la fase:** [PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0](../prompts/PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0.md)

---

## 0. Por qué existen estos dos contratos

La auditoría del perfil encontró **tres copias del par error/éxito** y **tres del encabezado de sección** dentro de cuatro archivos. No es descuido de un autor: es que el sistema **no expone** ninguna de las dos piezas, así que cada pantalla las reinventa. `apps/portal` tiene 21 banners de error y 10 de éxito inline; `apps/web` resolvió lo mismo con un archivo de constantes de clases (`lib/form-styles.ts`). Hay **tres sistemas de alerta paralelos** vivos: `Alert` de `@iwana/ui`, `PortalAlert` de `portal-ui.tsx` y `FORM_ALERT_*` de web.

Ambos contratos **componen tokens y primitivas existentes**. No introducen ningún token nuevo, y por eso entran por el carril rápido de UI (protocolo §3bis.3) sin gate de las siete etapas.

---

## 1. `FormStatus` — banner de resultado de formulario

### 1.1 El problema que resuelve, y que no es el obvio

El defecto visible es la duplicación. El defecto **real** es de accesibilidad, y sobrevive a la solución ingenua:

```tsx
{serverError && <div className="...">{serverError}</div>}   // hoy
{serverError && <Alert variant="error">{serverError}</Alert>} // NO lo arregla
```

En ambos casos la región viva **y su contenido entran al DOM en el mismo tick**. Los lectores de pantalla pierden ese anuncio de forma sistemática: solo vigilan regiones que ya existían cuando cambia su contenido. Cambiar el `div` por `Alert` deja el SC 4.1.3 (Status Messages, AA) igual de incumplido con mejor apariencia.

**La cláusula que lo hace funcionar es `status: 'idle'` renderizando el contenedor vacío, no `null`.** Esa es la razón de ser del contrato; sin ella, es un `Alert` con otro nombre.

### 1.2 API

| Prop | Tipo | Default | Notas |
| --- | --- | --- | --- |
| `status` | `'idle' \| 'success' \| 'error'` | requerido | `idle` **renderiza el contenedor vacío**, nunca `null`. Ver §1.1 |
| `message` | `ReactNode` | — | Ignorado en `idle` |
| `tone` | `'polite' \| 'assertive'` | derivado | `error` → `assertive`; `success` → `polite`. Solo se pasa para anular el default |
| `autoDismissMs` | `number \| false` | `false` | Cierra la divergencia 3000/4000 ms del perfil. **Prohibido con `status="error"`**: un error no se auto-oculta |
| `onDismiss` | `() => void` | — | Requerido si `autoDismissMs` es un número |
| `id` | `string` | — | Para enlazar con `aria-describedby` del `<form>` |
| `className` | `string` | — | Vía `cn()`, sin sobreescribir la paleta |

### 1.3 Estados requeridos

`idle` (contenedor montado y vacío) · `success` · `error` · `dismissed` → vuelve a `idle` **sin desmontar la región**.

**Estado prohibido:** desmontar el contenedor en `idle`. Un consumidor que escriba `{cond && <FormStatus …/>}` anula el contrato; la spec exige renderizarlo siempre y controlar por `status`.

`loading` no aplica: el estado de envío lo comunica `Button` con su prop `loading`.

### 1.4 Tokens

Delega íntegramente en `alertVariants` de `packages/ui/src/components/Alert.tsx`. **Cero valores nuevos.** Radio `rounded-2xl` (`--radius-2xl`), que es el que `Alert` ya usa — no `rounded-[20px]`.

Los contrastes de la paleta heredada están verificados: error claro 5,96:1 · éxito claro 5,23:1 · error oscuro 8,62:1 · éxito oscuro 10,39:1. Todos pasan AA.

### 1.5 Accesibilidad

- `role` y `aria-live` **en el contenedor externo**, presentes desde el primer render.
- `aria-atomic="true"`.
- Icono `aria-hidden="true"`.
- El botón de cierre, si se usa, hereda el `focus-visible` del `Button` del sistema.

### 1.6 Relación con lo existente

`PortalAlert` (`apps/portal/src/components/shared/portal-ui.tsx:1851`) sigue siendo el componente correcto para **alertas de página** (el estado de error de `ProfileClient`, por ejemplo) y no se retira. `FormStatus` cubre el caso distinto de **resultado de un envío dentro de un formulario**, donde la región debe preexistir. `PortalAlert` arrastra el mismo defecto de montaje condicional cuando se usa así, y por eso no se reutiliza tal cual.

---

## 2. `SectionHeader` — encabezado de sección de tarjeta

### 2.1 Anatomía

`[caja de icono] [eyebrow?] [título] [descripción?] [acciones?]`

Las tres copias del perfil difieren **solo** en icono, eyebrow, título y descripción; el resto es idéntico carácter a carácter, salvo la tercera (`PersonalInfoForm.tsx:213-224`), que es una variante degradada: caja de 44px, radio `[18px]`, paleta secundaria, `h3` y sin eyebrow. Esa variante es la que justifica los ejes `size` y `tone` — de lo contrario el contrato nacería incompleto y la copia volvería.

### 2.2 API

| Prop | Tipo | Default | Notas |
| --- | --- | --- | --- |
| `icon` | `LucideIcon` | requerido | Renderizado con `aria-hidden` |
| `eyebrow` | `string` | — | Se renderiza **vía `FormSectionTitle`**, no reimplementado. Fuente única |
| `title` | `ReactNode` | requerido | Envuelve, **no trunca** |
| `headingLevel` | `2 \| 3` | requerido | **Obligatorio y sin default.** Ver §2.3 |
| `description` | `ReactNode` | — | — |
| `size` | `'md' \| 'sm'` | `'md'` | `md`: caja 48px, título `text-lg`, icono `h-5 w-5`. `sm`: caja 44px, título `text-sm`, icono `h-4 w-4` |
| `tone` | `'primary' \| 'secondary'` | `'primary'` | `primary`: `bg-iwana-primary/10` + `text-iwana-primary`. `secondary`: `bg-iwana-secondary-100` + `text-iwana-secondary-700` |
| `actions` | `ReactNode` | — | — |
| `className` | `string` | — | Vía `cn()` |

### 2.3 Por qué `headingLevel` no lleva default

Un default silencioso reproduce el defecto que el contrato viene a cerrar. `PersonalInfoForm` necesita `h2` en su encabezado principal y `h3` en la subsección de email de acceso: con un default, el segundo saldría como `h2` y rompería el orden de encabezados de la página — SC 1.3.1. Obligar al consumidor a declararlo convierte una decisión de accesibilidad en una decisión explícita.

### 2.4 Estados requeridos

Default · sin eyebrow · sin descripción · título largo (envuelve) · `sm` y `md` · `primary` y `secondary` · dark.

No lleva hover, focus, active ni disabled: es no interactivo. Si se pasa `actions`, los estados los aporta el control anidado.

### 2.5 Tokens

- Radio de la caja de icono: **`rounded-xl` (`--radius-xl`, 16px)**. **No** `rounded-[20px]` ni `[18px]`: esos valores están escalados al CTO como lenguaje visual global y no se propagan desde aquí.
- Icono: `h-5 w-5` en `md`, `h-4 w-4` en `sm`. Se elimina el `h-4.5` — clase válida en Tailwind v4, pero singleton en todo el repo.
- Descripción: `text-gray-500 dark:text-gray-400` como **valor único**, resolviendo la divergencia `dark:text-gray-300` / `dark:text-gray-400` que hoy convive en un mismo archivo.
- Eyebrow: heredado de `FormSectionTitle`, sin redefinir.

### 2.6 Ubicación

`packages/ui`, no `portal-ui.tsx`: `apps/web` repite el mismo patrón en `UserCreateModal` (4 veces), `UserManagementModal` (7) y `TenantBrandingForm`. Un componente portal-local nacería con un gemelo pendiente.

`PortalSectionHeader` (`portal-ui.tsx:1801`) resuelve un caso distinto — encabezado de sección de página, sin caja de icono — y no se retira ni se fusiona en esta versión.

---

## 3. Lo que este contrato deja explícitamente fuera

- **Los 44 radios arbitrarios del repo.** Escalados al CTO. Este contrato usa la escala vigente y no añade escalones; parchear solo el perfil crearía una tercera isla.
- **La unificación de los tres eyebrows** (`.portal-eyebrow` 10px vs `FormSectionTitle` 11px vs las copias). Escalada: son unas 80 llamadas. Aquí solo se fija que el eyebrow **del contrato** delega en `FormSectionTitle`.
- **`Avatar` y `getInitials`.** Es un tercer contrato necesario (seis implementaciones divergentes, P-12) pero de alcance propio; se especifica en su turno para no inflar esta congelación.

---

## 4. Condición de congelación

Este artefacto queda **congelado en v1.0** al ser citado por ruta y versión en `PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0`. Un cambio de contrato posterior exige bump a v1.1, marcar esta versión como superada en el mismo acto, y una adenda de EM-ARCH al prompt nombrando los tracks afectados (protocolo §3bis regla 1). Un contrato cuya versión cambie sin esa adenda **no está congelado**: los tracks siguen contra la versión declarada en el prompt vigente.
