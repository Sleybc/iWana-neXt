# Contrato de componente — Checklist de requisitos de OT

**Versión:** 1.1
**Fecha:** 2026-10-06
**Estado:** La v1.0 conserva su aprobación G2 de AI-EM-ARCH del 2026-10-05. Esta adenda v1.1 fue producida por AI-DS-OWNER y está **pendiente de verificación consolidada**; no ha sido aprobada por AI-EM-ARCH.
**Responsable:** AI-DS-OWNER  
**Consumidores:** AI-FE-PLATFORM (R2–R4, visual de E4), AI-SR-QA (criterios de validación)

## 1. Fuentes y alcance

Este contrato define API visual, composición, tokens y estados de `RequirementChecklist` y `RequirementActionSheet` para el expediente de OT. La fuente de flujo y copy es la [spec UX MOD11 v1.3](2026-10-05-mod11-consola-ot-requisito-ux.md), en especial §§3.1–3.2, 4, 5, 6, 7, 9, 11.1 y las adendas §§14–15. La decisión para la columna de ventana se integra en el [contrato de tablas operativas v1.2](2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md), §7.2. La secuencia y los gates constan en el [plan MOD11 v1.2](../plans/2026-09-14-mod11-consola-ot-remediacion.md).

Fuentes de datos consumidas:

- `packages/shared/src/contracts/operations/execution-orders.ts` v1.5: snapshot de requisitos, `completion.progress`, `completion.requirements`, `allowedActions`, `schedule.window` nulable y `ExecutionOrderItemUsage.requirementKey: string | null`.
- `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1: estado evaluado `{ requirementId, label, kind, satisfied, reason? }`.

`listItemUsage` pagina el historial global de una OT y no filtra por `requirementKey`. Por ello el pie de historial refleja una sola vez el conteo y la paginación globales; este contrato no deriva un total ni `hasMore` para un subgrupo. La UX v1.3 §14.2 está alineada con ese alcance. No define el flujo de producto, no implementa componentes ni agrega endpoints, campos de datos, tokens de marca o dependencias. El contrato describe composites propios de la feature Operations; las primitivas compartidas se consumen desde `@iwana/ui`.

## 2. `RequirementChecklist`

### 2.1 Responsabilidad y anatomía

Es el índice compacto del expediente, en el orden del snapshot inmutable de la OT. Cada elemento reúne la etiqueta literal del snapshot, su clasificación obligatoria/opcional, estado textual, razón disponible, acción contextual autorizada y los registros asociados a ese requisito. El historial permanece dentro de la fila o inmediatamente bajo ella. No se crean seis bloques planos ni se consulta el catálogo vivo de plantillas para completar el snapshot.

Anatomía:

1. Encabezado de sección con título «Requisitos» y, si el padre provee `completion.progress`, el indicador agregado opcional.
2. Lista ordenada de filas, una por requisito del snapshot y en el orden publicado.
3. En cada fila: etiqueta, «Obligatorio» u «Opcional», estado con texto, razón cuando existe y acción contextual solo si el padre la habilita.
4. Historial de consumo con `requirementKey` coincidente exactamente, debajo de la fila que lo originó; registros con clave nula o ausente nunca aparecen en una fila de requisito.
5. Si hay consumos sin clave, un grupo neutral único al final, después de las filas, con el título y la descripción definidos en UX §14.1. No es una fila del checklist.
6. Un único pie global de historial después de las filas y del grupo neutral; presenta la paginación del conjunto completo de consumos de la OT, sin repetir conteos ni controles dentro de cada fila o del subgrupo neutral.

El componente no recalcula progreso ni cumplimiento, no adivina requisitos, no reorganiza la lista y no decide acceso por rol, responsable o tipo de usuario. `SectionAccordion` no se usa: el índice mantiene visibles sus elementos y no recrea las seis secciones colapsables que R0 retiró.

### 2.2 API lógica

Esta forma documenta el contrato; no es código de implementación ni un nuevo contrato compartido.

```ts
type RequirementVisualState = 'satisfied' | 'pending' | 'unknown';

interface RequirementChecklistItem {
  requirementKey: string;       // snapshot.requirement.key
  label: string;                // snapshot.requirement.label, literal
  kind: string;                 // kind del snapshot; no se muestra como enum
  required: boolean;            // snapshot.requirement.required
  state: RequirementVisualState;
  reason?: string;              // estado publicado; se conserva mientras la fila siga pendiente
  action?: RequirementActionDescriptor; // descriptor ya autorizado por el contenedor
  history?: ReactNode;          // solo registros asociados por requirementKey exacta
}

interface RequirementChecklistProps {
  items: readonly RequirementChecklistItem[];
  progress?: number;            // completion.progress del backend, sin cálculo local
  mode: 'readonly' | 'action';
  loading?: boolean;
  refreshing?: boolean;
  offline?: boolean;
  error?: { message: string; onRetry: () => void };
  unattributedConsumptionHistory?: ReactNode; // grupo único para requirementKey null/ausente; se omite si no hay registros
  historyFooter?: ReactNode;     // conteo y paginación únicos del historial global por OT
  onSelectRequirement?: (requirementKey: string) => void;
}
```

`action` se omite si no aplica al momento o si `allowedActions` no autoriza una operación. El componente no recibe identidad ni rol. `onSelectRequirement` solo navega dentro del expediente; no concede acción ni altera datos. El contenedor coloca cada consumo con clave bajo la única fila cuya clave de snapshot coincida exactamente; nunca lo asocia por etiqueta, categoría, acción, disposición u orden temporal. Los consumos con clave nula o ausente se colocan una sola vez en `unattributedConsumptionHistory`, fuera de todas las filas. El slot se omite cuando la consulta termina y no hay registros sin clave. `historyFooter` aparece una sola vez para la colección global paginada y no comunica un total ni `hasMore` exclusivo del grupo neutral.

El grupo neutral usa un encabezado de sección identificable, su descripción asociada y una lista semántica de lectura (`ul`/`li`). No recibe foco automáticamente ni se comporta como acción. Durante la carga inicial se presenta el skeleton del historial con `aria-busy`; no se muestra un vacío antes de completar la consulta. El error de lectura se comunica junto al historial con `Alert` y «Reintentar», preservando los registros válidos y sustituyendo el vacío. El copy y los estados siguen UX §§5, 9 y 14. El estado vacío por requisito solo se muestra cuando se ha recorrido la paginación global completa y no hay registros con clave exacta para esa fila; los registros sin clave no llenan ni ocultan ese vacío.

El pie conserva una única región de estado accesible que anuncia el progreso de carga del conjunto global. «Cargar más» es una acción y se presenta como botón nativo (`type="button"`), no como enlace: funciona con Enter y Espacio, tiene nombre accesible, foco visible y target de al menos 44 px; durante la petición queda `disabled` y comunica la carga. Solo aparece cuando la metadata global indica otra página. Las filas se deduplican por identidad y mantienen el orden estable del servidor. No se sintetizan metadata ni contadores por subgrupo.

### 2.3 Mapeo de datos y estados

El contenedor itera `template.requirements` y cruza `key` con `completion.requirements[].requirementId`. La etiqueta y obligatoriedad vienen exclusivamente del snapshot; `satisfied` y `reason` vienen exclusivamente de la evaluación. El historial no sustituye ni recalcula el resultado del evaluador.

| Entrada | Presentación | Acción |
| --- | --- | --- |
| Evaluación `satisfied: true` | Estado «Cumplido», aunque el requisito sea opcional | Solo la que el contenedor permita para el momento; el estado no crea permiso |
| Evaluación `satisfied: false`, `required: true` | «Pendiente» y la razón publicada | Descriptor contextual solo si está permitido |
| Evaluación `satisfied: false`, `required: false` | «Sin registrar», clasificación «Opcional» y razón publicada si existe | Descriptor contextual solo si está permitido; no cambia progreso ni bloquea cierre |
| No llega `completion.requirements`, o falta la evaluación para la clave del snapshot | «Estado no disponible»; no se convierte la ausencia en pendiente | Sin acción generada por el componente; el padre puede ofrecer la actualización de lectura prevista por UX |
| `FIELD` o `MEASUREMENT` sin ruta de captura en el contrato actual | Estado y razón tal como fueron evaluados | Sin promesa de captura inexistente |
| Snapshot no disponible | No se consulta el catálogo actual ni se fabrican filas | El padre conserva el estado de carga/error/degradación definido para el detalle; no se inventa un snapshot |

Estados visibles exactos: **«Cumplido»**, **«Pendiente»**, **«Sin registrar»** y **«Estado no disponible»**. La clasificación «Obligatorio»/«Opcional» permanece separada del estado. El estado siempre tiene nombre accesible y visible; el color nunca es su único canal. Se conserva «Registro de la actividad en bitácora (NO requerido)» tal cual lo trae el snapshot; no se corrige copy ni se infiere `required` desde esa etiqueta.

### 2.4 Tokens y presentación

Solo tokens y primitivas vigentes; no se crea token de marca ni valor local paralelo.

| Uso | Token/primitive existente | Contraste verificado |
| --- | --- | --- |
| Superficie clara y texto principal | `iwana-background`, `iwana-primary` | 17.32:1 |
| Superficie oscura y texto principal | `dark-surface-2`, `white` | 15.91:1 |
| Texto secundario claro/oscuro | `gray-500` / `gray-400` sobre las superficies correspondientes | 4.83:1 / 6.27:1 |
| Estado cumplido | `Badge` variante `lime`: `iwana-secondary-900` sobre `iwana-secondary-100`; en oscuro `iwana-secondary-400` sobre el tratamiento existente de `iwana-secondary-700` | 7.47:1 / 7.89:1 |
| Pendiente y opcional sin registrar | `Badge` neutral: `gray-600` sobre `gray-100`; oscuro `gray-300` sobre `dark-surface-4` | 6.87:1 / 8.57:1 |
| Estado no disponible | `Badge` informativo: `iwana-primary` sobre `iwana-primary-100`; oscuro `iwana-primary-200` sobre el tratamiento existente de `iwana-primary-800` | 14.12:1 / 9.35:1 |

Razones y texto del cuerpo usan el estilo de texto secundario de la superficie. Foco y selección usan los tokens/clases de foco compartidos (`interactiveFocusClassName`, `border-iwana-primary/20`, `shadow-iwana-active`) según corresponda. Lima representa éxito completado únicamente. No se agregan badges decorativos, iconos sin función ni tarjetas anidadas. Los textos de estado tienen contraste AA en claro y oscuro según los pares indicados.

## 3. `RequirementActionSheet`

### 3.1 Responsabilidad y API lógica

Presenta temporalmente el formulario o acto asociado a una fila, en el contexto del requisito que lo originó. Se monta dentro del flujo existente del `OperationalSidePeek`; no crea un segundo overlay ni una mutación de permisos. Solo una acción está abierta a la vez.

```ts
type RequirementActionDescriptor =
  | { kind: 'activity'; requirementKey: string; activityType: string; action: 'REGISTER_ACTIVITY' }
  | { kind: 'evidence'; requirementKey: string; evidenceType: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE'; action: 'REGISTER_EVIDENCE' }
  | { kind: 'consumption'; requirementKey: string; itemCategory: string; finalDisposition?: string; action: 'REGISTER_ITEM_USAGE' }
  | { kind: 'acceptance'; requirementKey: string; action: 'CLOSE'; mode: 'existing-close'; signatureEvidenceRef?: string };

interface RequirementActionSheetProps {
  open: boolean;
  action: RequirementActionDescriptor;
  status: 'idle' | 'loading' | 'success' | 'error' | 'offline';
  errorMessage?: string;
  body: ReactNode; // formulario compuesto por primitives y/o captura de firma
  onCancel: () => void;
  onSubmit: () => void;
  onRetry?: () => void;
}
```

El descriptor solo se crea después de que el contenedor contraste `allowedActions`, el momento y el estado. Actividad mapea a `REGISTER_ACTIVITY`; evidencia a `REGISTER_EVIDENCE`, conservando `requirementKey` y `evidenceType`; material a `REGISTER_ITEM_USAGE`, conservando categoría y disposición del snapshot. La custodia solo se consulta al abrir la variante `consumption` y se filtra por su categoría. El modo `acceptance` no crea una acción `REGISTER_ACCEPTANCE` ni una mutación independiente: se integra al cierre existente y solo se ofrece al existir `CLOSE`; el cierre conserva su referencia a la evidencia `SIGNATURE` guardada. `FIELD` y `MEASUREMENT` no reciben variantes nuevas.

La forma concreta del formulario usa `FormField`, `Input`, `Select`, `Button`, `Alert` y `FormStatus`, sin duplicar controles base. Los props no incluyen `user`, `role`, `assignee` ni funciones que permitan inferir autorización.

### 3.2 Convivencia, teclado y foco

El panel de acción se inserta en el flujo de la fila y se asocia con el disparador mediante `aria-expanded`, `aria-controls` y un encabezado identificable. No usa `Dialog`, `ModalLayer` ni un focus trap propio: el `OperationalSidePeek` existente conserva la única capa y el ciclo de foco del drawer. Al abrir, el foco se mueve al encabezado o primer control; cancelar/cerrar lo devuelve al disparador. El orden de tabulación sigue el orden visual. Si se implementa Escape para cerrar este panel, se consume dentro de él y no cierra por accidente el drawer.

La firma incluye instrucciones asociadas programáticamente a la región de captura y anunciadas en el orden de lectura. «Limpiar», «Guardar firma» y «Cancelar» son controles nativos operables por teclado, con foco visible y targets táctiles de al menos 44 px (`min-h-11`). El foco se gestiona al abrir/cancelar y el resultado/error se anuncia con `role="status"`/`role="alert"` según el caso. Solo el trazo libre dependiente de trayectoria queda exceptuado por WCAG 2.1.1; la excepción no cubre botones, instrucciones, errores ni navegación ([W3C, comprensión de SC 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard)). No se ofrece un nombre escrito como evidencia `SIGNATURE` ni se elige una librería de captura.

## 4. Primitives y veredicto anti-duplicación

Los composites son específicos del dominio: cruzan snapshot inmutable, estado evaluado, acciones permitidas, contexto de trabajo e historial por clave de requisito. No hay otro consumidor genérico demostrado que justifique promoverlos a `@iwana/ui`; no duplican primitives porque coordinan datos y contexto, y componen los controles compartidos.

| Primitive existente | Uso en este contrato | Decisión |
| --- | --- | --- |
| `SectionHeader` | Encabezado «Requisitos» | Reutilizar; no crear encabezado propio |
| `SectionAccordion` | Ninguno | No usar; mantiene filas visibles y no reintroduce las seis secciones plegables |
| `ProgressMeter` | Progreso agregado opcional recibido del backend | Reutilizar; no calcular porcentaje en cliente |
| `Badge` | Estado textual con variantes semánticas existentes | Reutilizar; no crear badge de requisito |
| `Alert` | Error real de lectura o mutación | Reutilizar; no presentar avisos como decoración |
| `CheckboxCard` | Ninguno | Es un control de selección, no una fila ni un estado de requisito |
| `OperationalSidePeek` | Superficie exterior de detalle | Reutilizar como único drawer/overlay |
| `ModalLayer` | Ya lo administra el overlay exterior | No abrir segunda capa |
| `Dialog` | Ninguno en acción inline | Evitar modal anidado y focus trap competidor |
| `Button`, `FormField`, `Input`, `Select`, `FormStatus`, `SkeletonBlock` | Acciones, campos y estados del formulario | Reutilizar las primitivas compartidas |

**Veredicto:** conformes como composites de feature, con consolidación obligatoria de las piezas base en `@iwana/ui`. No se crea primitive compartida nueva ni se propone cambio de stack/dependencia.

## 5. Estados obligatorios de ambos componentes

| Estado | `RequirementChecklist` | `RequirementActionSheet` |
| --- | --- | --- |
| Hover | Solo controles/filas realmente navegables; hover neutral existente, sin transformar toda fila en botón | Botones y campos usan variantes existentes |
| Focus | Indicador visible y orden de foco; estado también se anuncia | Foco gestionado al abrir y retorno al disparador al cancelar/cerrar |
| Active | Acción de navegación/expansión conserva respuesta de control existente | Botón/selector usa estado active existente |
| Disabled | No se representa una acción no permitida como botón deshabilitado: se omite. Bloqueo temporal por envío/offline sí usa `disabled` real | Envío en curso/offline bloquea escritura; se conserva razón visible según copy UX |
| Loading | Skeleton con forma de encabezado/filas e historial; `aria-busy` en la región de lectura. No expone el grupo neutral vacío durante carga inicial | Skeleton/formulario pendiente; acciones no duplican envíos |
| Skeleton | `SkeletonBlock` mantiene jerarquía compacta; el historial conserva forma de lista | `SkeletonBlock` para la forma del formulario, sin spinner como contenido principal |
| Empty | Copy de §5 UX por requisito después de completar la paginación global; se omite el grupo neutral si no hay filas sin clave. No se fabrican filas de snapshot | No aplica como formulario abierto sin descriptor; errores/vacíos de selector conservan copy UX |
| Error | `Alert` junto al historial global, reintento accesible y último dato válido preservado; el error sustituye al vacío. No se duplican errores, conteos ni paginadores por requisito | Error junto al requisito; error de firma conserva captura para reintentar o cancelar |
| Success | Estado textual asociado a la evaluación actualizada; no optimizar el cumplimiento localmente | `FormStatus` anuncia resultado y retorno al requisito; la fila cambia con refetch/evaluación del servidor |
| Readonly | Muestra estado, razón e historial; sin controles de escritura | No se monta; en órdenes terminales el expediente permanece en lectura |
| Offline | Copy UX «Sin conexión; vuelve a intentar cuando recuperes la red.» y escrituras bloqueadas; sin borrador local | Botones de escritura deshabilitados; no se persiste ni promete recuperar borrador offline |

Las variantes de error, éxito, carga y sin conexión mantienen texto accesible y contraste AA. No se baja opacidad de texto para comunicar estados. Vacíos de bandeja pertenecen al contenedor, no al checklist.

## 6. Estado de ventana E4

La tabla v1.1 solo decía `null → '—'`; no tenía semántica dependiente de `status`. Esa raya no expresa «Por programar» ni distingue una orden terminal. Por ello R1 versiona en el mismo acto el [contrato de tablas operativas a v1.2](2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md): `schedule.window === null` muestra «Por programar» en órdenes no terminales y «Sin ventana planificada» en terminales; `status` y ventana vienen de `ExecutionOrderListItem`. La columna permanece sin cambios estructurales, no hay ordenación local ni encabezado ordenable. La v1.1 queda superada en ese contrato y la futura capacidad de sort pasa a v1.3.

El resumen del detalle usa los mismos dos textos conforme a UX §7.3. Una ventana publicada conserva su formato actual. Orden por defecto continúa server-owned: `planned_window_start_at DESC NULLS FIRST, id DESC`; la vista no crea controles de orden ni cambios de índice/paginación.

## 7. Necesidades para G3 / deuda y marcadores

Antes de implementar la captura, AI-FE-PLATFORM debe verificar contra el endpoint existente el MIME, tamaño y `expiresAt` del artefacto `SIGNATURE`; comprobar si existe una librería aprobada; y tramitar decisión previa antes de instalar dependencia nueva. Debe verificar teclado, foco y anuncios de controles; consulta de custodia solo al abrir `MATERIAL`; refetch selectivo; estabilidad de paginación y orden server-owned; y referencia de evidencia al `close()` existente. Este contrato no presume esos detalles de transporte.

Deuda de producto recibida de R0: no existe en v1 una alternativa de firma para quien no puede usar puntero. No se sustituye con nombre escrito ni se improvisa aceptación electrónica; cualquier alternativa requiere revisión posterior y fuente jurídica oficial. También permanece el «NO» en mayúsculas de la etiqueta congelada del snapshot hasta publicar una nueva versión de plantilla. No se selecciona librería de firma.

Esta adenda versiona el contrato de componente después de su congelación inicial. No añade tokens de marca, dependencias, primitives ni cambios de stack. UX §14.2 v1.3 y el contrato API v1.5 comparten la paginación global por OT. Según protocolo §3bis, el orquestador debe notificar la versión 1.1 a AI-FE-PLATFORM y AI-SR-QA antes de que la consuman como contrato verificado de implementación/validación.

## 8. Fuentes visuales y de accesibilidad

- Tokens vigentes: `packages/ui/src/styles/globals.css`; manual y firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` y `docs/identity/`.
- Primitives revisadas: `packages/ui/src/components/` y exportaciones de `packages/ui/src/index.ts`.
- UX y copy normativos: [MOD11 consola OT v1.3](2026-10-05-mod11-consola-ot-requisito-ux.md), incluyendo A2 y las adendas §§14–15 de AI-PROD-UX.
- Firma y teclado: [W3C Understanding SC 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard).

## Registro de cambios

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-10-05 | Contrato inicial de `RequirementChecklist` y `RequirementActionSheet`, producido por AI-DS-OWNER y aprobado en G2. |
| 1.1 | 2026-10-06 | Adenda producida por AI-DS-OWNER: asocia historial solo por clave exacta, añade grupo neutral para consumos sin clave y un pie de paginación global única; especifica semántica, carga, vacío, error, reintento y teclado. Pendiente de verificación consolidada; no aprobada por AI-EM-ARCH. |

