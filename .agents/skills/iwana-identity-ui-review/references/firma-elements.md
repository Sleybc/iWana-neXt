# Elementos de firma iWana — recetas

Los 9 rasgos que hacen una pantalla reconocible como iWana **sin logo**. Fuente: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` §3 (dirección visual vigente, aprobada). **Regla de cierre: toda pantalla nueva exhibe ≥2 de estos elementos con función real** (no decorativa).

Postura de la marca: **visualmente sobrio, interactivamente denso**. El color comunica significado (estado, avance, foco, acción); nunca adorno. El ancla diferencial es el dúo **azul noche → lima** como codificación de estado y progreso.

## 1. Barra lima de navegación activa

Ítem activo del sidebar: tinte suave + barra vertical + icono lima; el resto del sidebar atenuado (patrón "dim the sidebar" de Linear).

```
// contenedor activo: bg-white/10 (sobre sidebar azul) o tinte suave
// indicador: absolute left-0 w-1 h-6 bg-iwana-secondary rounded-r-full
// icono del ítem activo: text-iwana-secondary
// ítems inactivos: text-white/70 hover:bg-white/5
```

## 2. Sombra dual azulada

Dos niveles con intención, siempre derivados de `#17163A`. Es la **única técnica de profundidad** del sistema (glass es excepción acotada).

```
reposo:        shadow-iwana-soft     (cards, paneles)
foco/edición:  shadow-iwana-active   (elemento en curso, paso activo de wizard)
```

## 3. Degradado azul→lima solo para progreso

`bg-gradient-to-r from-iwana-primary to-iwana-secondary` (o `.iwana-gradient`) **exclusivamente** en indicadores de avance (barra de progreso con % en lima). Prohibido como fondo decorativo de headers, cards o secciones.

## 4. Par tonal lima de completitud

Badge de éxito/completitud accesible por construcción:

```
bg-iwana-secondary-100 text-iwana-secondary-900   (≈ #EDF8CC / #48531D)
// texto lima suelto: siempre iwana-secondary-700+ (#6A7A1C, 6.2:1)
```

## 5. Gramática de 3 estados de workflow

Para acordeones, wizards y checklists (patrón del prototipo de expedientes):

| Estado | Receta |
| --- | --- |
| **Activo** | Borde primario (`border-iwana-primary/20`) + `shadow-iwana-active` + fondo blanco |
| **Completado** | "Hundido": fondo suave (`bg-gray-50/50`), borde transparente + badge par tonal lima con check |
| **Pendiente** | Neutro (`bg-gray-100 text-gray-500`) con hover que revela acento lima |

## 6. Mono técnico

IDs, SKUs, coordenadas, timestamps y cifras de columnas en `font-mono` (JetBrains Mono) o `tabular-nums`. Evita saltos de layout y señala "dato técnico" al operador.

## 7. Escala tipográfica dual (Exo 2)

Roles *title* (títulos y cifras grandes; hasta peso Thin `.font-thin-exo` en dashboards) separados de roles *UI* (12–14 px, line-height fijo para densidad operativa). Jerarquía real: h1 > título de panel > cuerpo.

## 8. Badges generativos

Fórmula única — nunca enums crudos visibles:

```
rounded-full bg-{tono}-50 text-{tono}-700        (claro)
dark: bg-{tono}/15                                (oscuro)
// tonos: success/warning/error/info/neutral + par tonal lima para completitud
// en @iwana/ui ya existe <Badge variant="success|warning|error|info|neutral|primary|lime">
```

## 9. Decoración orgánica de costo cero

Blob lima al 5% (`bg-iwana-secondary/5 rounded-full blur-3xl`) o patrón de puntos (`bg-[radial-gradient(...)]`) **solo** en empty states de primera vez, pantallas de auth y superficies de marca. Nunca en vistas operativas de datos.

---

## Reglas semánticas del lima (no negociables)

- Lima **=** avance, éxito, completitud, señal de interacción (nav, progreso, badges tonales, focus/acento).
- Lima **≠** botón filled de CTA de página del portal operativo (enmienda CTO 2026-07-23).
- Lima **nunca =** urgencia, prioridad alta, alerta → eso usa las escalas `warning`/`error`.
- Lima **nunca** como fondo base de paneles, toolbars o empty states → el fondo suave es `iwana-surface-soft`.
- Texto lima siempre `iwana-secondary-700+` sobre claro (AA).

## Jerarquía de botones

| Nivel | Receta |
| --- | --- |
| Acción principal de página (una por vista) | Azul noche — `<Button variant="primary">` (default CVA) |
| Acciones de sección / submit modal | Azul sólido — `<Button variant="primary">` |
| Secundarias / terciarias | `ghost` / `outline` / `link` (link usa `iwana-secondary-700`) |
| Marca / auth / avance explícito (no default operativo) | `<Button variant="lime">` — API conservada; no es el opener de header/empty del portal |

Manda el CVA de `packages/ui/src/components/Button.tsx` — verifica las variantes ahí antes de citar; esta tabla no redefine el contrato.
