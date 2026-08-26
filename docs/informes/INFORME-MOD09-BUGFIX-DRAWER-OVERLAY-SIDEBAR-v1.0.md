# Informe MOD09 — Correccion de overlay del Drawer de despacho

## Problema

Al abrir el Drawer de despacho desde `Visitas pendientes`, el contenido central
quedaba oscurecido y desenfocado, pero el menu lateral permanecia nitido. El
overlay del Drawer usaba `z-[120]`, por debajo del Sidebar, que usa el token
`--z-drawer` con valor `300`.

## Correccion

- `DispatchDrawerPortal` ahora usa `z-(--z-drawer)`.
- El overlay cubre todo el shell, incluido el Sidebar.
- El panel del Drawer conserva su superficie opaca y permanece nitido sobre el
  overlay.
- Se agregaron pruebas para el nivel de apilamiento, el desenfoque y el cierre
  mediante el overlay.

## Validacion

- Pruebas del portal: 7 en verde.
- Typecheck de `@iwana/portal`: sin errores.
- Lint de `@iwana/portal`: sin errores; permanecen warnings preexistentes.
- Prettier: archivos modificados verificados.
- Validacion funcional en navegador: el overlay tiene `z-index: 300` y cubre el
  Sidebar; `elementFromPoint(100, 100)` devuelve el boton del overlay.
