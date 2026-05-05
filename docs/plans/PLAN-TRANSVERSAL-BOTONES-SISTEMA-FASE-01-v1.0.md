# PLAN — Sistema de botones iWana neXt · Fase 01

**Tipo:** PLAN  
**Módulo:** TRANSVERSAL — Sistema visual `@iwana/ui`  
**Fase:** 01 — Estandarización de botones y acciones  
**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-04  
**Modo activo:** Senior UI Systems Designer  
**Responsable de gobierno:** AI-EM-ARCH

---

## 1. Objetivo

Implementar progresivamente la taxonomía **Command Pill + Utility Icon** para reducir inconsistencias visuales en botones, CTAs, acciones de tabla e icon buttons de `apps/web`, `apps/portal` y `packages/ui`.

## 2. Alcance de Fase 01

| Área                  | Alcance                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `packages/ui`         | Evolucionar `Button` sin romper API pública innecesariamente.                   |
| Portal Comercial      | Normalizar botones de creación, edición y eliminación en catálogos comerciales. |
| Portal Usuarios       | Normalizar acciones icon-only de tabla y CTA de creación.                       |
| Catálogo de impuestos | Normalizar `Nueva definición`, `Editar`, `Eliminar` y refresh.                  |
| Documentación         | Registrar decisiones, validaciones y deuda residual.                            |

## 3. Secuencia de ejecución

1. **Auditoría inicial de usos manuales**
   - Buscar botones con clases manuales en `apps/portal/src/components/commercial/**`, `apps/portal/src/components/users/**`, `apps/web/src/components/**` y rutas relacionadas.
   - Clasificar cada uso como `primary`, `secondary`, `ghost`, `destructive`, `icon` o `badge`.

2. **Ajuste de primitive `Button`**
   - Revisar [Button.tsx](../../packages/ui/src/components/Button.tsx).
   - Alinear radio, tamaño y variantes con la spec.
   - Mantener compatibilidad con `asChild`, `loading`, `disabled`, `size="icon"` y variantes existentes.

3. **Migración prioritaria portal**
   - Migrar CTAs: `Nuevo plan`, `Agregar producto`, `Nueva definición`.
   - Migrar acciones `Editar` y `Eliminar` de Comercial e impuestos.
   - Migrar acciones icon-only de Usuarios para que no queden íconos sueltos.

4. **Revisión de badges y contadores**
   - Confirmar que `Activo`, `2 registros`, `Administrador`, `1 activo` y contadores similares no tengan affordance de botón si no son interactivos.
   - No cambiar badges funcionales fuera del alcance de botones.

5. **Validación técnica y visual**
   - Ejecutar tests focalizados de `packages/ui` si existen.
   - Ejecutar `pnpm --filter @iwana/portal typecheck`, `lint` y tests relevantes.
   - Capturar evidencia before/after desktop y mobile de las rutas afectadas.

6. **Documentación de cierre**
   - Actualizar informe vivo.
   - Registrar deuda visual aceptada, especialmente pantallas no migradas.

## 4. Archivos candidatos

| Prioridad | Archivo/área                                                  | Motivo                                                       |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Alta      | [Button.tsx](../../packages/ui/src/components/Button.tsx)     | Primitive base del sistema.                                  |
| Alta      | `apps/portal/src/components/commercial/TaxCatalogManager.tsx` | Ejemplos visibles: `Nueva definición`, `Editar`, `Eliminar`. |
| Alta      | `apps/portal/src/components/commercial/*Manager.tsx`          | Botones repetidos en Comercial.                              |
| Alta      | `apps/portal/src/components/users/**`                         | Icon-only actions en tabla de usuarios.                      |
| Media     | `apps/web/src/components/**`                                  | Alineación transversal web/portal.                           |
| Media     | `packages/ui/src/components/Badge.tsx`                        | Solo si badges se confunden con botones.                     |

## 5. Riesgos

| Riesgo                                      | Mitigación                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cambiar `Button` rompe pantallas existentes | Mantener API actual y migrar clases de forma incremental.                           |
| Rojo destructivo pierde visibilidad         | Mantener rojo sólido en confirmación; usar icon danger suave en listas.             |
| Icon-only pierde accesibilidad              | Exigir `aria-label`, target mínimo, hover y focus-visible.                          |
| Badges interactivos se confunden            | Separar chip pasivo de filtro interactivo mediante cursor, hover y estado selected. |

## 6. Validación requerida

```bash
pnpm --filter @iwana/ui typecheck
pnpm --filter @iwana/ui lint
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm --filter @iwana/portal test -- TaxCatalogManager.spec.tsx
```

Si `@iwana/ui` no tiene scripts específicos disponibles, documentar el bloqueo y validar por consumidores (`@iwana/portal`, `@iwana/web`).

## 7. Criterio stop/go

- **GO:** variantes de `Button` migradas, CTAs y acciones críticas normalizadas, validación en verde y evidencia visual archivada.
- **STOP:** el cambio requiere nueva librería, tokens globales, romper API de `Button`, alterar flujos funcionales o esconder acciones frecuentes.

## 8. Deuda esperada

La Fase 01 no obliga a migrar todas las pantallas históricas. Cualquier botón manual fuera de Comercial, Usuarios, Impuestos y `Button` base debe quedar inventariado como deuda visual para Fase 02.
