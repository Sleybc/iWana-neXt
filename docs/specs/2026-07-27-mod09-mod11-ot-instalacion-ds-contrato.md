# Contrato de Design System para OT de instalacion

**Version:** 1.1  
**Estado:** G2 aprobado — listo para congelacion G4  
**Fecha:** 2026-07-27  
**Owner:** AI-DS-OWNER  
**Consumidor:** AI-FE-PLATFORM  
**Spec UX:** `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-coordinador-design.md`  
**Direccion visual:** `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`  
**ADR rector:** `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` (Aprobado por CTO el 2026-07-27)  
**Contrato API:** `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`  
**Tokens vivos:** `packages/ui/src/styles/globals.css`

---

## 0. Changelog de esta spec

| Version | Cambio | Motivo |
| --- | --- | --- |
| 1.0 | Version inicial | Entrega para revision G2 |
| 1.1 | Anatomia completa de `OperationalSidePeek`; API de `ExecutionOrderSummary` reescrita en terminos de props semánticas; tokens contrastados y verificados; badge `info` corregido a `primary`; vocabulario sentence case ampliado; ProgressMeter declarado usable sin extension; estado promovido a G2 aprobado | Cierre de observaciones DS-OWNER para congelacion G4 |

---

## 1. Ownership y decision

Se reutilizan tokens y primitivas reales de `@iwana/ui`. No se crean colores, sombras, tipografias ni escalas paralelas.

| Contrato | Naturaleza | Owner | Destino |
| --- | --- | --- | --- |
| `OperationalSidePeek` | Primitive generica de superficie lateral | AI-DS-OWNER; implementa AI-FE-PLATFORM | `@iwana/ui` |
| `ExecutionOrderSummary` | Componente de dominio presentacional | MOD11; DS gobierna anatomia, tokens y variantes | dominio Operaciones compartido en `apps/portal` |

`OperationalSidePeek` no conoce Agenda, OT, estados ni comandos de negocio. `ExecutionOrderSummary` no ejecuta llamadas de red y, cuando se consume desde Agenda, solo emite la intencion de navegacion `onOpen`.

---

## 2. Contrato `OperationalSidePeek`

### 2.1 Anatomia

La superficie esta compuesta por cinco regiones fijas. Ninguna puede omitirse en la implementacion; el contenido es el unico area variable.

| Region | Proposito | Tokens / primitivas |
| --- | --- | --- |
| `Overlay` | Foco en el panel; cierra al hacer clic | `bg-black/40 dark:bg-black/60` |
| `Panel` | Superficie lateral deslizable | `bg-white dark:bg-dark-surface-2`, `border-l border-gray-200 dark:border-dark-border`, `shadow-iwana-soft` |
| `Header` | Titulo, descripcion, eyebrow y cierre | Sticky, `border-b border-gray-100 dark:border-dark-border` |
| `Body` | Contenido de dominio | `overflow-y-auto`, sin scroll anidado |
| `Footer` | Acciones de la superficie consumidora | Opcional, `border-t`, se renderiza solo si el consumidor lo provee |
| `CloseButton` | Cierre explicito | `Button variant="ghost" size="icon"` |

### 2.2 API publica

| Prop/slot | Tipo conceptual | Regla |
| --- | --- | --- |
| `open` | boolean | Control explícito de visibilidad |
| `onOpenChange` | `(open: boolean) => void` | Informa abrir/cerrar; el consumidor es dueño del estado |
| `title` | string | Nombre accesible principal (heading del dialogo) |
| `description?` | ReactNode | Contexto adicional; ligado al titulo via `aria-describedby` |
| `eyebrow?` | string | Categoria corta en mayusculas con tracking (`portal-eyebrow`) |
| `size` | `'default' \| 'wide'` | En escritorio: `default` = max 32 rem; `wide` = max 48 rem. En movil siempre viewport completo |
| `busy?` | boolean | Bloquea cierre destructivo, muestra indicador y anuncia operacion en curso |
| `initialFocusRef?` | RefObject<HTMLElement> | Foco inicial controlado; si no se provee, foco en primer elemento enfocable del panel |
| `footer?` | ReactNode | Acciones de la superficie consumidora |
| `onBeforeClose?` | `() => boolean \| Promise<boolean>` | Permite al consumidor cancelar el cierre (borrador/cambio pendiente) |
| `children` | ReactNode | Contenido de dominio |
| `className?` | string | Extension puntual de estilo, nunca para alterar anatomia |

### 2.3 Estados y variantes obligatorios

**Interaccion:**

| Estado | Comportamiento esperado |
| --- | --- |
| `closed` | No renderiza nada; restaura el foco al elemento que abrio la superficie |
| `open` | Renderiza overlay + panel; fija `overflow-hidden` en body; aplica foco inicial |
| `hover` | CloseButton y elementos interactivos del footer resaltan segun su propia variante |
| `focus` | CloseButton y primer focable muestran anillo firma (`focus-visible:ring-iwana-primary`) |
| `active` | CloseButton y botones del footer hunden ligeramente |
| `disabled` | Controles del footer o el cierre se deshabilitan; no se usa como autorizacion |
| `busy` | Cierre bloqueado, CloseButton deshabilitado, overlay persistente; anuncio `aria-busy` |
| `readonly` | Superficie de solo lectura; no presenta controles operativos; Escape cierra |

**Contenido:**

| Estado | UI esperada |
| --- | --- |
| `loading` | Skeleton con silueta del contenido esperado; nunca spinner solitario en el body |
| `empty` | Empty state con icono neutro, explicacion y, si aplica, accion primaria del consumidor |
| `error` | Alerta inline con mensaje recuperable; no cierra la superficie automaticamente |
| `success` | Banner/alerta no intrusiva tras operacion exitosa; no bloquea la vista |
| `warning` | Alerta inline amarilla para condiciones que requieren atencion sin ser error |

**Comportamiento:**

- Foco atrapado dentro del panel mientras este abierto.
- `Escape` dispara `requestClose` salvo que `busy === true`.
- Cierre condicionado por `onBeforeClose`; si devuelve `false`, el panel permanece abierto.
- Restauracion de foco al elemento que abrio.
- Solo un consumidor con borrador o cambio pendiente puede usar `onBeforeClose`.

### 2.4 Tokens y medidas

| Elemento | Token | Valor real | Uso |
| --- | --- | --- | --- |
| Fondo panel | `iwana-background` / `dark-surface-2` | `#FFFFFF` / `#222222` | Superficie principal |
| Fondo overlay | `black/40` / `black/60` | negro al 40%/60% | Desenfoque de fondo |
| Borde izquierdo | `gray-200` / `dark-border` | `#E5E7EB` / `#2E2E2E` | Separacion del viewport |
| Separador header/footer | `gray-100` / `dark-border` | `#F3F4F6` / `#2E2E2E` | Lineas internas |
| Sombra panel | `shadow-iwana-soft` | `0 10px 40px -10px rgba(23,22,58,0.08)` | Profundidad de reposo |
| Titulo | `text-gray-900` / `dark:text-white` | `#111827` / `#FFFFFF` | Heading |
| Descripcion | `text-gray-500` / `dark:text-gray-400` | `#6B7280` / `#9CA3AF` | Contexto secundario |
| Eyebrow | `portal-eyebrow` | `iwana-secondary-700` / `iwana-secondary-400` | Categoria |
| Cierre | `Button` `ghost` | ver contrato de `Button` | Accion de cierre |

### 2.5 Responsive

- Por debajo de `md`: ancho y alto completos del viewport; sin borde lateral visible.
- Desde `md`: entra desde la derecha; `default` = `max-w-[32rem]`; `wide` = `max-w-[48rem]`.
- No crear scroll anidado; el body del panel es el unico scrollable.
- Target tactil minimo 44 x 44 px en CloseButton.

---

## 3. Contrato `ExecutionOrderSummary`

### 3.1 Props semánticas

| Prop | Tipo conceptual | Regla |
| --- | --- | --- |
| `number` | string | Numero funcional de OT; nunca UUID ni identificador tecnico |
| `workTypeLabel` | string | Tipo de trabajo localizado; nunca enum crudo |
| `status` | `{ label: string; variant: 'neutral' \| 'primary' \| 'warning' \| 'success' \| 'error' \| 'lime' }` | Estado operativo; no depende solo del color |
| `result?` | `{ label: string; variant: 'success' \| 'warning' \| 'error' \| 'neutral' }` | Resultado de cierre; solo cuando existe |
| `templateLabel` | string | Nombre + version de plantilla; proviene del contrato API |
| `assigneeLabel?` | string | Identidad minimizada del responsable; respeta acceso |
| `plannedWindow` | string | Ventana programada localizada (zona del tenant, formato corto) |
| `siteLabel` | string | Sitio autorizado; sin duplicar PII innecesaria |
| `completion` | `{ completed: number; required: number }` | Requisitos cumplidos / requeridos; renderiza `ProgressMeter` |
| `syncState` | `{ state: 'synced' \| 'pending' \| 'error'; label: string; timestamp?: string }` | Sincronizacion con MOD11; incluye timestamp cuando aplica |
| `availability` | `'linked' \| 'unlinked' \| 'unavailable'` | Determina si hay OT, si falta vinculo o si no se puede consultar |
| `readonly` | boolean | Sin controles operativos; solo navegacion si `canOpen` |
| `canOpen` | boolean | Habilita la accion de abrir OT completa |
| `onOpen?` | `() => void` | Unica accion admitida en Agenda; nunca muta la OT |

### 3.2 Estados de dominio mapeados a badges

| Estado OT | Label visible | Variante Badge | Semantica Firma iWana |
| --- | --- | --- | --- |
| `created` | Creada | `neutral` | Inicial, sin accion de ejecucion |
| `assigned` | Asignada | `primary` | Responsable asignado, pendiente de inicio |
| `enRoute` | En ruta | `primary` | Desplazamiento registrado |
| `inProgress` | En progreso | `primary` | Ejecucion activa |
| `blocked` | Bloqueada | `warning` | Excepcion activa; requiere atencion |
| `completed` | Ejecutada | `lime` | Completitud / exito |
| `completedWithObservations` | Completada con observaciones | `warning` | Terminal con anotaciones |
| `notExecuted` | No ejecutada | `error` | Terminal sin ejecucion |
| `cancelled` | Cancelada | `error` | Terminal cancelada |

### 3.3 Estados de contenido

| Estado | Cuando aplica | UI esperada |
| --- | --- | --- |
| `loading` | Ausencia de datos autorizados | Skeleton con silueta de numero, badge, progreso y 3 lineas |
| `empty` | Sin OT vinculada a la tarea | Empty state: "Aun no hay una orden de trabajo para esta visita" + accion del consumidor si aplica |
| `unlinked` | Agenda perdio la referencia | Alerta warning: "La orden no esta vinculada; sincroniza la visita" |
| `unavailable` | Sin conexion o dependencia caida | Alerta error: "Sin conexion; vuelve a intentar cuando recuperes la red" |
| `error` | Error de carga recuperable | Alerta error con mensaje no tecnico y opcion de reintentar |
| `success` | Operacion reciente exitosa (solo anuncio) | Banner no intrusivo temporal |
| `stale` | Proyeccion atrasada respecto a MOD11 | Badge/alerta warning: "Actualizacion pendiente"; bloquea decisiones terminales en Agenda |
| `forbidden` | Actor sin permiso o fuera de alcance | Alerta informativa: "No tienes acceso a esta orden"; sin datos filtrados |

### 3.4 Estados de interaccion

| Estado | Regla |
| --- | --- |
| `readonly` | No renderiza controles operativos; `onOpen` puede seguir disponible si `canOpen` |
| `hover` | Fila/boton de apertura resalta con fondo suave (`iwana-surface-soft`) |
| `focus` | Anillo firma en el control de apertura |
| `active` | Hundimiento del control de apertura |
| `disabled` | `canOpen === false` o `availability !== 'linked'` deshabilita la apertura; no indica autorizacion |

### 3.5 Acciones prohibidas y permitidas

- **NO** ejecuta llamadas HTTP, queries ni mutaciones.
- **NO** acepta un array generico de `actions`.
- **NO** renderiza botones de iniciar, registrar, bloquear o cerrar: esas acciones pertenecen al workspace MOD11.
- **SI** emite `onOpen()` cuando `canOpen === true` y el usuario activa la navegacion.

### 3.6 Composicion interna

| Seccion | Primitiva / token | Regla |
| --- | --- | --- |
| Numero OT | `font-mono` + `text-iwana-primary` | Mono tecnico solo para referencia; no como titulo |
| Tipo de trabajo | `text-sm text-gray-600 dark:text-gray-400` | Sentence case, localizado |
| Estado | `Badge` | Variante semantica fija; label localizado |
| Resultado | `Badge` | Solo si `result` existe |
| Plantilla | `text-xs text-gray-500` | Label + version sin UUID |
| Responsable | `text-sm text-gray-700 dark:text-gray-300` | Minimizado; omite si no hay acceso |
| Ventana | `text-sm` | Formato localizado del tenant |
| Sitio | `text-sm` | Identificador funcional |
| Progreso | `ProgressMeter` | `value = (completed / required) * 100`; `label` localizado (p. ej., "Avance de requisitos") |
| Sincronizacion | Icono + `text-xs` + badge si `stale` | Texto localizado; timestamp en mono solo si es corto |
| Apertura | `Button` `secondary` o `ghost` | "Abrir orden" cuando `canOpen`; deshabilitado cuando no aplica |

---

## 4. Inventario real de primitives

| Elemento | Estado en repo | Uso en este contrato |
| --- | --- | --- |
| `Button` | `@iwana/ui` existente | Cierre de side peek (`ghost`), apertura de resumen (`secondary`/`ghost`) |
| `Badge` | `@iwana/ui` existente | Estado, resultado, sincronizacion, alertas. Variantes reales: `success`, `warning`, `error`, `primary`, `neutral`, `lime`. **No existe `info`**; usar `primary` para estados informativos |
| `ProgressMeter` | `@iwana/ui` existente | Completitud de requisitos; acepta `label` y `ariaLabel` |
| `Dialog`, `Input`, `FormField`, `Tabs` | `@iwana/ui` existentes | No usados en este contrato; el flujo los requiere en workspace MOD11 |
| `PortalSidePeek`, `PortalPanel`, `PortalSkeletonBlock`, `PortalAlert`, `portalTextareaClassName` | portal-local existentes | Fuente de futura consolidacion; **no declarar como exportados de `@iwana/ui`** |
| `Textarea`, `Autocomplete`, `Drawer`, `Timeline`, `Toast` | No confirmados como exports compartidos | No usar como dependencia hasta contrato/implementacion explicita |

Un timeline puede llegar como contenido/slot dentro del workspace MOD11; esta spec no crea una primitive compartida adicional.

---

## 5. Tokens y contraste

### 5.1 Tokens citados (todos existen en `globals.css`)

| Token | Valor real | Uso en este contrato |
| --- | --- | --- |
| `iwana-background` | `#FFFFFF` | Fondo de panel en claro |
| `dark-surface-2` | `#222222` | Fondo de panel en oscuro |
| `iwana-surface-soft` | `#F8FAF5` | Fondo de hover/resaltado suave |
| `shadow-iwana-soft` | `0 10px 40px -10px rgba(23, 22, 58, 0.08)` | Sombra del panel lateral |
| `shadow-iwana-active` | `0 8px 30px -5px rgba(23, 22, 58, 0.12)` | Sombra de elemento en curso (no usada directamente, reservada) |
| `font-mono` | JetBrains Mono | Numero OT, timestamp corto |
| `portal-eyebrow` | `iwana-secondary-700` / `iwana-secondary-400` | Categoria del side peek |
| `iwana-primary` | `#17163A` | Titulos, texto principal en claro |
| `iwana-primary-500` | `#5A5190` | Boton primario en oscuro |
| `iwana-secondary-700` | `#6A7A1C` | Texto lima accesible en claro |
| `iwana-secondary-400` | `#B2D93C` | Texto lima en oscuro |
| `iwana-secondary-100` | `#EDF8CC` | Fondo de badge `lime` en claro |
| `iwana-secondary-900` | `#48531D` | Texto de badge `lime` en claro |
| `iwana-secondary` | `#A5C330` | Lima base; **no se usa como texto sobre blanco** |

### 5.2 Ratios de contraste calculados

Medidos sobre los valores reales de `globals.css`. El limite WCAG 2.2 AA para texto normal es 4.5:1.

| Combinacion | Ratio | Cumple AA |
| --- | --- | --- |
| `iwana-primary` (#17163A) sobre blanco | 17.32:1 | Si (AAA) |
| `iwana-primary-500` (#5A5190) sobre blanco | 6.97:1 | Si |
| `iwana-secondary-700` (#6A7A1C) sobre blanco | 4.76:1 | Si |
| `iwana-secondary-900` (#48531D) sobre `iwana-secondary-100` (#EDF8CC) | 7.47:1 | Si |
| `iwana-secondary-400` (#B2D93C) sobre `dark-surface-2` (#222222) | 9.76:1 | Si (AAA) |
| `iwana-secondary` (#A5C330) sobre `dark-surface-2` (#222222) | 7.92:1 | Si |
| `iwana-primary` sobre `iwana-primary-100` (#E8E7F0) | 14.12:1 | Si (AAA) |

**Observacion DS:** `iwana-primary-300` (#7E7BDF) sobre `dark-surface-2` mide 4.38:1, ligeramente por debajo de AA. Este contrato no lo usa como texto principal; el unico uso cercano es el borde translucido de `Button` `secondary` en oscuro, que no es texto. Si en G6 se detecta texto `iwana-primary-300` sobre `dark-surface-2`, el cambio pasa por carril rapido de DS.

### 5.3 Gradientes y progreso

- El degradado azul noche → lima (`from-iwana-primary to-iwana-secondary`) es exclusivo del relleno de `ProgressMeter`.
- No se usa como fondo decorativo ni fuera de la barra de progreso.

---

## 6. Vocabulario visible

Todo texto visible en español, sentence case, sin enums crudos. Los labels se externalizan para i18n.

| Clave interna | Texto visible recomendado |
| --- | --- |
| `INSTALLATION` | Instalacion |
| `FIELD_NOTE` | Nota de campo |
| `EXECUTED` | Ejecutada |
| `COMPLETED_WITH_OBSERVATIONS` | Completada con observaciones |
| `NOT_EXECUTED` | No ejecutada |
| `stale` | Actualizacion pendiente |
| `conflict` | La orden cambio; revisa la version vigente |
| `created` | Creada |
| `assigned` | Asignada |
| `enRoute` | En ruta |
| `inProgress` | En progreso |
| `blocked` | Bloqueada |
| `cancelled` | Cancelada |
| `synced` | Sincronizado |
| `pending` | Actualizacion pendiente |
| `error` | Error de sincronizacion |
| `linked` | Vinculada |
| `unlinked` | Sin vincular |
| `unavailable` | No disponible |
| `openOrder` | Abrir orden |
| `progressLabel` | Avance de requisitos |
| `noOrderYet` | Aun no hay una orden de trabajo para esta visita |
| `offlineMessage` | Sin conexion; vuelve a intentar cuando recuperes la red |
| `forbiddenMessage` | No tienes acceso a esta orden |

---

## 7. Accesibilidad y responsive

- Nombre accesible unico por accion (`aria-label` en cierre, texto visible en apertura).
- Foco visible en todo interactivo; orden logico; trap de foco y retorno de foco.
- Target tactil minimo de 44 x 44 px.
- Estado nunca comunicado solo por color: siempre acompanado de label o icono.
- Regiones asincronas (`syncState`, `stale`) con anuncio no intrusivo; no disparan `alert` fuera de error real.
- Mensajes asociados al campo y resumen de errores al cerrar cuando `onBeforeClose` lo requiera.
- Evidencia visual con descripcion alternativa cuando el consumidor la incluya.
- Movil: viewport completo, una columna y accion primaria persistente del consumidor sin tapar contenido.

---

## 8. Restricciones

- No duplicar componentes equivalentes en `apps/portal`.
- No introducir un modal largo dentro de otro modal.
- No usar selector generico para transiciones.
- No aceptar `actions` arbitrarias en `ExecutionOrderSummary`.
- No usar deshabilitado como autorizacion; backend decide y UI explica.
- No declarar primitive portal-local como export de `@iwana/ui`.
- No renderizar UUID ni enums crudos como labels principales.

---

## 9. Aprobacion y congelacion segun protocolo

- **G1:** Aprobado. ADR-068 aprobado por CTO el 2026-07-27.
- **G2:** AI-DS-OWNER confirma este contrato como suficiente para factibilidad frontend. Aprueba alcance de anatomia, props, variantes, estados, tokens y vocabulario.
- **G3:** AI-FE-PLATFORM emitira factibilidad RSC/client, reutilizacion y responsive; AI-EM-ARCH resolvera ajustes.
- **G4:** El prompt de ejecucion declarara literalmente "contrato de componente congelado", citando esta ruta y version.
- **G5–G7:** AI-FE-PLATFORM implementa contra este contrato; AI-SR-QA verifica estados y regresion visual; AI-PROD-UX y AI-DS-OWNER pueden bloquear en G6 por ruptura de flujo o contrato.
- Cualquier cambio posterior se versiona y AI-EM-ARCH notifica a AI-FE-PLATFORM y AI-SR-QA.

**Veredicto DS-OWNER:** Este contrato puede ser consumido por AI-FE-PLATFORM para implementar `OperationalSidePeek` y `ExecutionOrderSummary` sin pedir aclaraciones estructurales. **Estado: G2 aprobado — listo para congelacion G4.**

---

## 10. Bloqueos

Ningun bloqueo identificado.
