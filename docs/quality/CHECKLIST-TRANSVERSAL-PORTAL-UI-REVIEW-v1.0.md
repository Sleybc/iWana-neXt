# CHECKLIST - Transversal Portal UI Review

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-03  
**Modulo:** Transversal portal  
**Fase:** Revisión continua de PRs UI  
**Referencia de implementación:** apps/portal/src/lib/portal-status-badge-rules.ts

---

## 1. Stop/go inicial

- [ ] El PR identifica si cambia UI visible del portal (`apps/portal/**`).
- [ ] Se validó impacto responsive en desktop y mobile para la pantalla tocada.
- [ ] Se confirmó que no se introducen estilos ad hoc cuando existe primitive compartida.

## 2. Semántica visual de estado

- [ ] Todo estado `Activo/Inactivo` operacional usa la regla transversal (`portal-status-badge-rules.ts`).
- [ ] No existen ternarios locales `isActive ? 'success' : 'neutral'` en componentes nuevos.
- [ ] Los contadores de elementos activos usan `portalActiveCountBadgeVariant`.
- [ ] No se reutiliza badge de estado activo para mensajes de éxito o feedback de guardado.

## 3. Primitives y consistencia de portal

- [ ] Se reutilizan primitives de portal antes de crear variantes locales (`PortalAlert`, `PortalEmptyState`, `PortalPanel`, `PortalActionToolbar`).
- [ ] Las tablas mantienen celdas con `align-middle` salvo excepción justificada.
- [ ] No hay anidación innecesaria de cards cuando una sección plana mejora lectura.
- [ ] Los tabs y toolbars mantienen comportamiento consistente de foco, teclado y estados activos.

## 4. Tokens y contraste

- [ ] Se usan tokens de sistema (`iwana-*`, dark surfaces) en lugar de colores arbitrarios.
- [ ] Texto sobre fondo blanco evita `iwana-secondary` plano y usa variantes legibles (`iwana-secondary-700` cuando aplica).
- [ ] Estados dark mantienen contraste legible en badges, tablas y paneles.

## 5. Copy y vocabulario

- [ ] El copy visible usa vocabulario canónico de producto (sin términos internos técnicos innecesarios).
- [ ] Labels de estado son consistentes entre módulos (`Activo/Inactivo` o `Activa/Inactiva` según entidad).
- [ ] Mensajes de error indican acción siguiente cuando aplica.

## 6. Calidad técnica de cierre

- [ ] `pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit` en verde.
- [ ] `get_errors` sin errores en archivos tocados.
- [ ] Tests focalizados del slice UI modificado en verde.
- [ ] Si se cambió convención visual transversal, informe vivo actualizado en `docs/informes/`.

## 7. Evidencia mínima para PR

- [ ] Lista de archivos UI cambiados.
- [ ] Resultado de typecheck y tests focalizados.
- [ ] Captura o descripción breve del before/after cuando el cambio es visual.
- [ ] Riesgos conocidos documentados (si se difiere algún ajuste de diseño).
