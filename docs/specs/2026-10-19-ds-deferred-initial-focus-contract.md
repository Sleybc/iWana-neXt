# Contrato DS — foco inicial diferido y `DialogTitle`

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-19
**Autoría:** AI-DS-OWNER
**Origen:** [PRD MOD05 Fase 06](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md) §1 (H8), §5.6 (RF-LO-21 y RF-LO-22), §8 (CA-LO-10)
**Plan:** [2026-10-19-mod05-lista-operativa.md](../plans/2026-10-19-mod05-lista-operativa.md) §2, S3
**Encargo:** [PROMPT-MOD05-LISTA-OPERATIVA-v1.0.md](../prompts/PROMPT-MOD05-LISTA-OPERATIVA-v1.0.md) §D0
**Implementa:** AI-FE-PLATFORM, bloque F1

---

## 1. Alcance del contrato

Este contrato unifica la única operación común de H8: solicitar foco programático en el siguiente frame, siempre que el foco no haya sido reclamado entretanto. Cubre apertura de contenedores y cambio de paso. La guarda no sustituye la trampa de teclado, prioridad de capas ni restauración del foco al cerrar; esas responsabilidades permanecen en cada sitio.

No cambia el comportamiento observable de los seis consumidores ni añade alcance funcional. El hook no renderiza UI. `DialogTitle` conserva su elemento, presentación, semántica y registro de `aria-labelledby`; solo amplía su API para reenviar una ref. No se agregan tokens ni variantes visuales.

## 2. `useDeferredInitialFocus` (RF-LO-21)

### 2.1 Firma pública

```ts
type DeferredFocusCleanup = () => void;
type DeferredFocusEligibility = () => boolean;
type DeferredFocusScheduler = (
  target: HTMLElement | null,
  isEligible?: DeferredFocusEligibility,
) => DeferredFocusCleanup;

export function useDeferredInitialFocus(): DeferredFocusScheduler;
```

El hook se exporta desde `@iwana/ui`. No recibe props ni tiene variantes. Devuelve una función estable que el efecto consumidor llama al ocurrir su disparador. La función agenda una petición y devuelve la cancelación de esa petición, lista para retornarse como cleanup del efecto.

El consumidor conserva la selección y el orden de prioridad del destino existentes, los resuelve en su efecto y pasa ese elemento al scheduler. El hook no consulta el DOM ni elige un fallback. `isEligible` es opcional (por defecto permite enfocar) y se evalúa dentro del frame, después de la guarda, para las condiciones locales que hoy se comprueban justo antes de enfocar, como la prioridad de capa.

### 2.2 Guarda de foco intacto

Al recibir una petición, el hook captura la referencia actual `document.activeElement` como `focusedAtRequest` y agenda un único `requestAnimationFrame`. Cuando llega el frame, considera intacto el foco si se cumple cualquiera de estas condiciones:

```ts
active == null ||
  active === document.body ||
  active === document.documentElement ||
  active === focusedAtRequest;
```

Solo si la guarda pasa y `isEligible?.()` no devuelve `false`, el hook llama `target?.focus()` sin opciones. Un nuevo elemento enfocado entre el disparo y el frame suprime la solicitud: no se intenta recuperar ni mover el foco. `null`, `body` y `documentElement` conservan la excepción de reposo vigente; la comparación de referencias también cubre tanto al disparador de apertura como al elemento activo al cambiar de paso.

El elemento objetivo debe estar montado y ser enfocable por código. Cuando el objetivo es un encabezado no interactivo, el consumidor conserva `tabIndex={-1}` como en el uso existente.

### 2.3 Ciclo de vida y cancelación

- **Una petición pendiente por instancia del hook.** Cada llamada nueva cancela el frame anterior antes de programar el siguiente. Si el destino nuevo es `null`, no agenda otro frame y devuelve una cancelación inocua.
- **Cleanup del efecto consumidor:** la función retornada cancela el frame de esa petición. El consumidor la retorna desde el `useEffect` que disparó el foco; React la ejecuta al cerrar/desactivar, al cambiar sus dependencias o al desmontar ese consumidor.
- **Desmontaje:** el propio hook cancela cualquier frame pendiente como salvaguarda adicional.
- La cancelación se limita al frame asociado. Un cleanup antiguo que se ejecute después de otra petición no cancela la petición nueva.
- Una vez ejecutado el callback, su cleanup es inocuo. Un `target` nulo termina sin enfocar.

El hook se invoca desde efectos de un componente cliente; la lectura de `document` y la programación del frame ocurren al disparar la función, no durante render ni SSR.

### 2.4 Modos de uso

**Apertura del contenedor.** El efecto no solicita foco mientras `open` sea falso. Al abrirse, resuelve el destino inicial con la prioridad actual del sitio, llama al scheduler con ese elemento y retorna su cancelación. El cierre, el desmontaje o un cambio que vuelva a ejecutar el efecto cancela la petición pendiente. Se conserva en el consumidor el guardado/restauración del elemento disparador.

**Cambio de paso.** El efecto que detecta un cambio real de paso solicita el foco de su título actual y retorna la cancelación. No solicita foco por el valor inicial sin cambio. Si ocurre otro cambio antes del frame, el cleanup cancela la petición anterior y la nueva petición queda como la única vigente.

Forma de integración:

```tsx
const scheduleInitialFocus = useDeferredInitialFocus();

useEffect(() => {
  if (!open) return;
  const initialTarget = resolveInitialTarget();
  return scheduleInitialFocus(initialTarget);
}, [open, resolveInitialTarget, scheduleInitialFocus]);
```

`resolveInitialTarget` debe mantener identidad estable cuando sea dependencia del efecto. `isEligible` se pasa como segundo argumento solo cuando haga falta una comprobación dinámica al ejecutar el frame. En el modo de cambio de paso, el efecto mantiene además la comparación del paso anterior para omitir el montaje inicial:

```tsx
useEffect(() => {
  if (previousStepRef.current === step) return;
  previousStepRef.current = step;
  return scheduleInitialFocus(titleRef.current);
}, [step, scheduleInitialFocus]);
```

## 3. Compatibilidad con los seis sitios de H8

| Sitio existente                                                                                                   | Modo y destino inicial                                                                                                                   | Responsabilidad que permanece local                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`Dialog.tsx`](../../packages/ui/src/components/Dialog.tsx) (`@iwana/ui`)                                         | Apertura: `initialFocusRef.current`, primer elemento enfocable o contenido del diálogo, en ese orden.                                    | Trampa de foco, prioridad de capa y restauración al disparador.                                     |
| [`OperationalSidePeek.tsx`](../../packages/ui/src/components/OperationalSidePeek.tsx) (`@iwana/ui`)               | Apertura: ref inicial, primer elemento enfocable o panel, en ese orden.                                                                  | Trampa de foco, prioridad de capa y restauración al disparador.                                     |
| [`portal-ui.tsx`](../../apps/portal/src/components/shared/portal-ui.tsx) (`PortalSidePeek`)                       | Apertura: primer elemento enfocable o panel.                                                                                             | Trampa de foco, prioridad de capa y restauración al disparador.                                     |
| [`use-portal-side-drawer-a11y.ts`](../../apps/portal/src/components/shared/use-portal-side-drawer-a11y.ts)        | Apertura: primer elemento enfocable o contenedor. Pasa `isEligible` para comprobar que la capa siga siendo la superior dentro del frame. | Registro de capa, trampa de foco, prioridad de capa y restauración al disparador.                   |
| [`SessionRecoveryModal.tsx`](../../apps/portal/src/components/auth/SessionRecoveryModal.tsx)                      | Apertura: primer elemento enfocable o panel. Pasa `isEligible` para comprobar que la capa siga siendo la superior dentro del frame.      | Reglas de sesión, registro de capa, trampa de foco, prioridad de capa y restauración al disparador. |
| [`SubscriberLifecycleDialog.tsx`](../../apps/portal/src/components/crm/subscribers/SubscriberLifecycleDialog.tsx) | Cambio real de paso: ref directa al `DialogTitle` actual.                                                                                | Detección de cambio de paso y reglas de ciclo de vida del diálogo.                                  |

Los consumidores mantienen el orden de prioridad ya usado en cada archivo y pasan el destino capturado al scheduler. La condición de capa superior se evalúa mediante `isEligible` en los sitios que hoy la comprueban al ejecutarse el frame. La consolidación no elimina ninguna conducta aparte de la copia de la guarda diferida.

## 4. `DialogTitle` con `forwardRef` (RF-LO-22)

### Anatomía y API

- Firma de implementación: `React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>`.
- Conserva un único elemento `<h2>`.
- Tipo de ref: `React.Ref<HTMLHeadingElement>`, aceptando refs objeto y callback mediante `React.forwardRef`.
- Props: `React.HTMLAttributes<HTMLHeadingElement>` actuales, incluidos `id`, `className`, `tabIndex` y atributos ARIA; no se añaden props de presentación.
- La ref se adjunta al `<h2>` renderizado.
- Se conserva la resolución de `id` explícito o generado y el registro/desregistro del título en `DialogContentContext`, que mantiene el enlace `aria-labelledby` del diálogo.
- El uso de F1 pasa la ref al `DialogTitle` con `tabIndex={-1}` y sustituye la búsqueda acotada con `querySelector`; no añade otra búsqueda DOM.

`DialogTitle` sigue siendo un encabezado, no un control interactivo. No se le asignan estados hover, active, disabled o loading ni variantes nuevas; el foco programático de paso conserva la semántica actual.

## 5. Aceptación verificable de S3

1. Existe una única implementación exportada de `useDeferredInitialFocus` en `@iwana/ui` con la firma de §2.1 y la guarda exacta de §2.2.
2. Los seis sitios de H8 consumen el hook con los destinos y modos de §3; sus pruebas existentes siguen pasando sin editarse.
3. Las pruebas propias del hook comprueban: enfoque si el foco conserva la referencia inicial; no movimiento si otra opción recibe el foco; permiso de la guarda para `null`, `body` y `documentElement`; cancelación al cleanup/desmontaje y al siguiente disparo; no-op para `target` nulo; y evaluación de `isEligible` en el frame cuando se proporciona.
4. Los sitios con prioridad de capa siguen suprimiendo el foco diferido si dejan de ser la capa superior antes del frame.
5. `DialogTitle` reenvía la ref al `<h2>` y mantiene `id`, atributos, registro accesible y presentación. `SubscriberLifecycleDialog` enfoca ese ref en el cambio real de paso y no depende de `querySelector` para localizar el título.
6. El cambio no añade tokens, variantes, dependencias ni requisitos de producto. La prueba de aceptación de Fase 06 sigue siendo CA-LO-10.

## 6. Límites

Este contrato no decide cuándo debe abrirse un contenedor o cambiarse un paso, ni qué elemento debe ser el destino: cada consumidor conserva esos disparadores y su prioridad de objetivo. No redefine la trampa de Tab, Escape, apilamiento de capas, enfoque al cerrar, estilos de foco ni semántica de los formularios. Cualquier cambio posterior a este contrato requiere versionar la spec y coordinar el re-sync de F1 y QA vía AI-EM-ARCH.
