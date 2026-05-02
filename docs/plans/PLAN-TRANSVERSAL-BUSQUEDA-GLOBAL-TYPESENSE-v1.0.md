# PLAN — Busqueda global Typesense tipo UISP

**Tipo:** PLAN  
**Modulo:** Transversal Busqueda Global  
**Fase:** 01 — Motor dedicado + overlay global  
**Version:** 1.0  
**Estado:** Listo para revision  
**Fecha:** 2026-05-02  
**Modo activo:** Mixto  
**Responsable de gobierno:** AI-EM-ARCH

---

## 1. Contexto y objetivo

La consola `apps/web` debe evolucionar su buscador del header a una busqueda global real, similar al patron UISP. El usuario espera que mientras escribe el sistema acerque resultados relevantes, agrupados y navegables.

La decision de producto es usar un motor dedicado: Typesense. Como el stack aprobado no lo incluye, la ejecucion queda condicionada a aprobacion de ADR-036.

Resultado esperado: incorporar Typesense, crear `SearchModule`, indexar Empresas/Usuarios/Modulos y entregar un overlay global en `apps/web` con busqueda-as-you-type.

## 2. Artefactos fuente

| Tipo | Artefacto | Uso |
|------|-----------|-----|
| Gobernanza | [AGENTS.md](../../AGENTS.md) | Boundaries, multi-tenancy y documentacion. |
| Stack | [docs/prds/Stack_Tecnologico.md](../prds/Stack_Tecnologico.md) | Baseline y excepcion de stack. |
| ADR | [docs/adrs/ADR-036-Typesense-Busqueda-Global.md](../adrs/ADR-036-Typesense-Busqueda-Global.md) | Decision de incorporar Typesense. |
| HLD | [docs/hlds/HLD-TRANSVERSAL-BUSQUEDA-GLOBAL-v1.0.md](../hlds/HLD-TRANSVERSAL-BUSQUEDA-GLOBAL-v1.0.md) | Arquitectura tecnica. |
| Spec | [docs/superpowers/specs/2026-05-02-busqueda-global-typesense-design.md](../superpowers/specs/2026-05-02-busqueda-global-typesense-design.md) | UX, contrato y criterios. |
| Prompt | [docs/prompts/PROMPT-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md](../prompts/PROMPT-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md) | Instrucciones de ejecucion fullstack. |

## 3. Stop/go inicial

**GO solo si:** ADR-036 queda aprobado por CTO.

**STOP inmediato si:**

- Se intenta instalar Typesense o modificar Docker antes de aprobacion del ADR.
- Se propone exponer Typesense directamente al navegador.
- Se requiere indexar PII sensible fuera del alcance permitido.
- El equipo detecta que roles no plataforma podrian ver resultados cross-tenant.

## 4. Fases de ejecucion

### Fase 0 — Aprobacion y preparacion

1. Obtener aprobacion formal de ADR-036.
2. Confirmar version de Typesense a usar y politica de despliegue on-prem.
3. Definir variables de entorno y secretos.
4. Confirmar si telemetria guardara solo longitud/hash de query.

### Fase 1 — Infraestructura Typesense dev

1. Agregar servicio `typesense` a `docker-compose.dev.yml`.
2. Agregar variables de entorno documentadas:
   - `TYPESENSE_HOST`
   - `TYPESENSE_PORT`
   - `TYPESENSE_PROTOCOL`
   - `TYPESENSE_API_KEY`
3. Agregar health check.
4. Asegurar que la API falle de forma clara si Typesense no esta disponible.

### Fase 2 — Backend SearchModule

1. Crear `apps/api/src/modules/search`.
2. Implementar cliente Typesense encapsulado.
3. Definir DTOs de query y respuesta.
4. Implementar `SearchController` con `GET /api/v1/search/global`.
5. Proteger con `JwtAuthGuard` y roles de plataforma autorizados.
6. Documentar endpoint con OpenAPI.

### Fase 3 — Modelo e indexacion

1. Definir schemas Typesense para `tenants`, `users` y `navigation_modules`.
2. Implementar `SearchIndexerService`.
3. Implementar rebuild inicial:
   - tenants desde schema publico,
   - usuarios recorriendo schemas tenant autorizados,
   - modulos desde catalogo estatico.
4. Implementar jobs BullMQ idempotentes para upsert/delete incremental.
5. Agregar pruebas de que payloads no incluyen campos prohibidos.

### Fase 4 — API global y ranking

1. Consultar Typesense por grupos.
2. Aplicar fuzzy/typo tolerance.
3. Ordenar por exact/prefix/fuzzy + estado activo + recencia.
4. Transformar respuesta al contrato estable de frontend.
5. Limitar resultados por grupo.
6. Manejar estados sin resultados y errores de Typesense.

### Fase 5 — Frontend overlay global

1. Crear `apps/web/src/components/search/GlobalSearch.tsx`.
2. Crear `GlobalSearchOverlay.tsx` y `GlobalSearchResultItem.tsx`.
3. Crear `useGlobalSearch.ts` con debounce 150-250 ms.
4. Agregar `globalSearchApi.search(...)` en `api-client.ts`.
5. Integrar `GlobalSearch` en `TopHeader.tsx`.
6. Mantener estilo sobrio, denso y operativo, alineado a la consola.

### Fase 6 — Accesibilidad y teclado

1. Implementar `Cmd/Ctrl + K`.
2. Implementar flechas verticales, Enter y Escape.
3. Manejar foco al abrir/cerrar.
4. Agregar roles ARIA adecuados para combobox/listbox.
5. Garantizar que texto y resultados no se solapen en desktop/mobile.

### Fase 7 — Pruebas y evidencia

1. Tests backend de controller/service/indexer.
2. Tests de contrato de payload sin PII sensible.
3. Tests frontend del overlay:
   - abre con focus,
   - debounce llama API,
   - renderiza grupos,
   - teclado navega,
   - error recuperable.
4. Typecheck/lint de API y Web.
5. Informe vivo actualizado.

## 5. Criterios de aceptacion

| ID | Criterio |
|----|----------|
| CA-BG-01 | `Cmd/Ctrl + K` enfoca el buscador global desde cualquier ruta protegida de `apps/web`. |
| CA-BG-02 | Al escribir 2+ caracteres aparecen resultados en overlay con debounce y sin recargar pagina. |
| CA-BG-03 | Los resultados se agrupan en Empresas, Usuarios y Modulos. |
| CA-BG-04 | Buscar un slug/nombre de empresa muestra resultados de empresas con ruta navegable. |
| CA-BG-05 | Buscar un nombre/email de usuario muestra usuario y empresa asociada para actores autorizados. |
| CA-BG-06 | Buscar `usuarios`, `empresas`, `auditoria` o `configuracion` muestra modulos navegables. |
| CA-BG-07 | Flechas y Enter permiten abrir un resultado sin mouse. |
| CA-BG-08 | `Escape` cierra overlay y restaura foco. |
| CA-BG-09 | El frontend nunca recibe API key de Typesense. |
| CA-BG-10 | Payloads de busqueda no incluyen documento, telefono, tokens, hashes ni secretos. |

## 6. Validacion obligatoria

```bash
pnpm --filter @iwana/api test -- search
pnpm --filter @iwana/web test -- GlobalSearch
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/web typecheck
pnpm --filter @iwana/api lint
pnpm --filter @iwana/web lint
```

Validacion manual:

1. Levantar Docker dev con Typesense.
2. Ejecutar rebuild de indice.
3. Abrir `http://localhost:3001/dashboard`.
4. Presionar `Ctrl+K` o `Cmd+K`.
5. Buscar una empresa existente.
6. Buscar un usuario existente.
7. Buscar `usuarios` o `configuracion`.
8. Navegar con flechas y Enter.

## 7. Entregables documentales

- ADR-036 aprobado o decision stop/go documentada.
- HLD actualizado si cambia contrato o arquitectura.
- Informe vivo en `docs/informes/` con evidencia.
- Runbook futuro de Typesense si la fase llega a despliegue operativo.

## 8. Deuda fuera de alcance

- Indexar auditoria.
- Indexar CRM, tickets, pagos o suscriptores.
- Acciones rapidas mutativas desde el buscador.
- Busqueda semantica/IA.
- Personalizacion por usuario de ranking.
