# Design — Sistema de botones iWana neXt · Fase 01

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-04  
**Modo activo:** Mixto  
**Rol ejecutor:** Senior Developer Fullstack  
**Gobierno:** AI-EM-ARCH

---

## 1. Contexto

La Fase 01 busca estandarizar la gramática visual de acciones en iWana neXt sin alterar comportamiento funcional, contratos API, roles, tenancy ni stack. La dirección aprobada es **Command Pill + Utility Icon**: las acciones de comando visibles deben leerse como comandos; las acciones repetidas y densas deben resolverse con icon buttons gobernados; los badges deben leerse como información pasiva.

La auditoría de código confirma una convivencia de patrones:

- `Button` compartido con semántica parcialmente consistente.
- `button` manual en filtros, paginación y acciones de tabla.
- iconos sueltos o affordance débil en acciones recurrentes.
- botones destructivos con demasiado peso visual en listas.
- badges y contadores con riesgo de parecer interactivos.

## 2. Alcance aprobado

La ejecución se mantiene **incremental y focalizada**:

- Evolucionar `packages/ui/src/components/Button.tsx` sin romper compatibilidad hacia atrás.
- Migrar superficies prioritarias en `apps/portal`:
  - `TaxCatalogManager`
  - `PlanCatalogManager`
  - `AdditionalProductsManager`
  - `UsersTable`
- Tocar `apps/web` solo si existe una superficie claramente equivalente y prioritaria.
- Documentar el resto como deuda visual para Fase 02.

Fuera de alcance:

- backend, API, DTOs, auth, MFA, roles, tenancy, migraciones o permisos;
- rediseño funcional de módulos;
- nuevas librerías UI, nuevos tokens globales o cambio de paleta/tipografía.

## 3. Alternativas evaluadas

### Opción A — Primitive-led incremental

Endurecer `Button` como primitive de gobierno visual y luego migrar consumidores prioritarios.  
**Ventaja:** consolida lenguaje visual con bajo riesgo sistémico.  
**Desventaja:** deja deuda explícita para fases siguientes.

### Opción B — Consumer-led local

No tocar `Button`; resolver todo con clases locales en cada pantalla.  
**Ventaja:** minimiza el riesgo sobre `@iwana/ui`.  
**Desventaja:** perpetúa duplicación y deriva visual.

### Opción C — System-first expansion

Expandir más fuerte la primitive y barrer muchas superficies en una sola fase.  
**Ventaja:** sube consistencia inmediata.  
**Desventaja:** excede el alcance incremental y eleva el riesgo de regresión.

## 4. Dirección elegida

Se aprueba **Opción A — Primitive-led incremental**.

La fase se divide en tres capas:

1. **Primitive compartida (`packages/ui`)**  
   `Button` se convierte en el punto de gobierno visual sin romper su API pública innecesariamente.

2. **Migración focalizada en portal**  
   Las superficies prioritarias se alinean a la misma gramática de CTAs, acciones repetidas e icon buttons.

3. **Extensión mínima en web**  
   Solo se toca una superficie equivalente y prioritaria si el mismo problema aparece con claridad.

## 5. Sistema visual propuesto

| Tipo | Forma | Uso |
| --- | --- | --- |
| `primary` | pill sólido | CTA principal de crear o iniciar flujo |
| `secondary` | pill outline | acción secundaria visible como `Editar` |
| `ghost` | compacto | acciones ligeras de toolbar o soporte |
| `destructive` | sólido | confirmaciones destructivas o acciones irreversibles |
| `icon` / `size="icon"` | contenedor compacto | acciones repetidas en filas, tablas o toolbars |
| `link` | texto | navegación textual secundaria |
| `badge` | pill pasivo | estado o conteo no interactivo |

### Reglas clave

- `Nuevo plan`, `Agregar producto`, `Nueva definición` y equivalentes usan `primary` con forma pill.
- `Editar` repetido migra a `secondary` compacto o a icon button según densidad.
- `Eliminar` en filas/listas usa presencia destructiva suave; el rojo sólido se reserva para confirmación.
- `Limpiar filtros` y acciones auxiliares dejan de vivir como `button` manual sin gobierno.
- Badges como `Activo`, `X registros` o `Administrador` no deben tener affordance de botón.

## 6. Estrategia de migración

### 6.1 Primitive

`Button.tsx` debe absorber la fase manteniendo:

- `loading`
- `disabled`
- `focus-visible`
- `asChild`
- dark mode
- `size="icon"`

Se permite una extensión **compatible hacia atrás** si elimina estilos manuales repetidos, pero no una ruptura de API.

### 6.2 Consumidores

La migración prioriza patrones, no archivos completos:

1. header / CTA principal;
2. toolbar y filtros;
3. acciones repetidas por fila;
4. badges pasivos con affordance ambigua.

Se reemplazan primero:

- icon buttons manuales en `UsersTable`;
- botones `ghost` ambiguos o con semántica destructiva local;
- `button` manual para `Limpiar filtros`, `Cargar más` y acciones equivalentes;
- chips con hover/cursor que sugieran interacción sin serla.

### 6.3 Deuda explícita

Todo botón manual fuera del alcance aprobado queda inventariado como deuda visual para Fase 02. La fase no intenta una migración total del monorepo.

## 7. Accesibilidad y responsive

- Todo icon-only accionable debe estar dentro de un botón real con `aria-label`.
- `focus-visible` debe seguir siendo perceptible en todos los botones tocados.
- El target táctil en mobile no debe degradarse por densidad.
- El color no puede ser el único canal de estado.
- Para texto sobre blanco se mantiene `iwana-secondary-700`, no `iwana-secondary` base.

## 8. Riesgos y stop/go

La fase se detiene si ocurre cualquiera de estos casos:

- la normalización exige cambiar flujo funcional o contrato API;
- endurecer `Button` rompe demasiadas pantallas fuera del alcance;
- resolver la consistencia requiere nuevos tokens globales;
- se pierde foco visible o contraste AA en botones tocados;
- la densidad obliga a esconder acciones frecuentes detrás de patrones nuevos.

En esos casos corresponde documentar el bloqueo en el informe vivo y escalar a EM-ARCH.

## 9. Validación esperada

La salida debe cubrir:

- `pnpm --filter @iwana/ui typecheck`
- `pnpm --filter @iwana/ui lint`
- `pnpm --filter @iwana/portal typecheck`
- `pnpm --filter @iwana/portal lint`
- test focalizado relevante del portal si cambia semántica accesible

Además:

- evidencia before/after desktop y mobile de Comercial, Usuarios y Catálogo de impuestos;
- actualización del informe vivo con archivos tocados, deuda residual, comandos y stop/go.

## 10. Referencias

- [PROMPT-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../prompts/PROMPT-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../specs/SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../plans/PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../informes/INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [Perfil_IA_Sr_Dev_Fullstack_v1.md](../../roles/Perfil_IA_Sr_Dev_Fullstack_v1.md)
- [Stack_Tecnologico.md](../../prds/Stack_Tecnologico.md)
