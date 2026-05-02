# PROMPT — Transversal Busqueda Global Typesense

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-02  
**Modo activo:** Mixto

## Vinculos de trazabilidad

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- ADR propuesto: docs/adrs/ADR-036-Typesense-Busqueda-Global.md
- HLD base: docs/hlds/HLD-TRANSVERSAL-BUSQUEDA-GLOBAL-v1.0.md
- Spec de diseno: docs/superpowers/specs/2026-05-02-busqueda-global-typesense-design.md
- Plan de ejecucion: docs/plans/PLAN-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md
- Stack vigente: docs/prds/Stack_Tecnologico.md
- Informe a actualizar al cierre: docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md

## Modulo

- Nombre: Busqueda global indexada tipo UISP
- Codigo: TRANSVERSAL-BUSQUEDA-GLOBAL
- Fase: TYPESENSE-FASE-01
- Version: 1.0
- Fecha: 2026-05-02
- Generado por: Engineering Manager
- Nombre de archivo destino: docs/prompts/PROMPT-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md

---

## 1. Objetivo exacto de la fase

- Resultado esperado: implementar una busqueda global en `apps/web` con motor Typesense, endpoint backend protegido, indices para Empresas/Usuarios/Modulos y overlay incremental tipo UISP.
- Lo que si entra:
  - Typesense en dev stack tras aprobacion del ADR,
  - `SearchModule` en `apps/api`,
  - schemas e indexacion inicial de tenants/users/navigation,
  - jobs BullMQ incrementales basicos,
  - endpoint `GET /api/v1/search/global`,
  - frontend `GlobalSearch` integrado en `TopHeader`,
  - atajo `Cmd/Ctrl + K` y navegacion por teclado,
  - pruebas backend/frontend y documentacion de cierre.
- Lo que no entra:
  - auditoria, tickets, pagos, CRM, suscriptores o busqueda IA,
  - acciones mutativas desde el buscador,
  - exponer Typesense directamente al navegador,
  - indexar documento, telefono, direccion, tokens, hashes o secretos,
  - cambiar reglas de autenticacion, JWT, MFA o multi-tenancy.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: no existe PRD especifico; usar PRD sistema vigente y este prompt como fase transversal.
- HLD del modulo: docs/hlds/HLD-TRANSVERSAL-BUSQUEDA-GLOBAL-v1.0.md
- ADRs aplicables: ADR-036, ADR-017, ADR-019, ADR-022, ADR-023.
- Sprint plan aplicable: docs/plans/PLAN-TRANSVERSAL-BUSQUEDA-GLOBAL-TYPESENSE-v1.0.md
- Prompt arquitectonico origen: docs/superpowers/specs/2026-05-02-busqueda-global-typesense-design.md
- Artefactos faltantes detectados:
  - aprobacion formal de ADR-036 por CTO,
  - runbook operativo de Typesense para despliegue productivo.

## 3. Instrucciones para Sr. Dev Fullstack

1. Antes de tocar codigo, verificar que ADR-036 este aprobado. Si sigue en `Propuesto`, detener ejecucion y pedir aprobacion.
2. Leer completos ADR-036, HLD y plan de ejecucion.
3. Implementar infraestructura local de Typesense solo tras aprobacion.
4. Crear `SearchModule` como modulo transversal, sin mover ownership de Tenants ni Users.
5. Tratar PostgreSQL como fuente de verdad y Typesense como indice derivado.
6. Implementar indexacion inicial reproducible e incremental idempotente con BullMQ.
7. Exponer solo endpoint backend protegido; nunca usar Typesense desde frontend directo.
8. Implementar `GlobalSearch` en `apps/web` como overlay tipo UISP, denso y operativo.
9. Mantener UI en espanol, sentence case, sin textos instructivos excesivos en pantalla.
10. Cubrir accesibilidad por teclado y estados de error/loading/empty.
11. Agregar pruebas que aseguren ausencia de PII sensible en payloads de busqueda.
12. Actualizar informe vivo con evidencia de tests y decisiones.

## 4. Restricciones no negociables

- No introducir Typesense sin ADR aprobado.
- No romper boundaries del modulith.
- No acceder a tablas de otros modulos desde dominios no propietarios; centralizar lectura en SearchModule o puertos aprobados.
- No hardcodear tenant, schema ni slugs.
- No exponer API keys de Typesense al browser.
- No indexar PII sensible fuera del schema permitido.
- No registrar query completa en logs por defecto.
- No usar `npm` ni `yarn`; todo con `pnpm`.
- No agregar `tailwind.config.js`.

## 5. Entregables tecnicos obligatorios

- Servicio Typesense en Docker dev y variables de entorno documentadas.
- `SearchModule` backend con controller, service, indexer, schemas y tests.
- Jobs BullMQ para upsert/delete incremental de tenants/users.
- Catalogo estatico de modulos navegables.
- `globalSearchApi.search(...)` en `apps/web/src/lib/api-client.ts`.
- Componentes `GlobalSearch`, `GlobalSearchOverlay`, `GlobalSearchResultItem` y hook `useGlobalSearch`.
- Integracion en `TopHeader`.
- OpenAPI actualizado para `GET /api/v1/search/global`.

## 6. Entregables documentales obligatorios

- ADR-036 con estado actualizado segun aprobacion.
- Informe vivo actualizado: docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md o informe transversal mas especifico si existe al momento de ejecutar.
- Si cambia el alcance, actualizar HLD y plan antes de seguir.
- Si se define operacion productiva de Typesense, crear runbook en `docs/runbooks/`.

## 7. Criterios de aceptacion

- CA-BG-01: `Cmd/Ctrl + K` enfoca el buscador global desde cualquier ruta protegida de `apps/web`.
- CA-BG-02: al escribir 2+ caracteres, el overlay consulta backend con debounce y renderiza resultados sin recargar pagina.
- CA-BG-03: los resultados aparecen agrupados como Empresas, Usuarios y Modulos.
- CA-BG-04: buscar empresa por nombre o slug navega a su configuracion o detalle aprobado.
- CA-BG-05: buscar usuario por nombre/email muestra empresa asociada y navega al flujo aprobado de gestion.
- CA-BG-06: buscar `usuarios`, `empresas`, `auditoria` o `configuracion` muestra modulos navegables.
- CA-BG-07: flechas, Enter y Escape funcionan correctamente.
- CA-BG-08: los payloads no contienen documento, telefono, hashes, tokens ni secretos.
- CA-BG-09: el sistema puede reconstruir indices localmente de forma reproducible.
- CA-BG-10: si Typesense falla, el overlay muestra error recuperable y no rompe el shell.

## 8. Criterio de stop/go

Detenerse inmediatamente si:

- ADR-036 no esta aprobado.
- El diseño requiere indexar PII sensible no aprobada.
- Aparece acceso cross-tenant para rol no autorizado.
- Typesense necesita exponerse al navegador para cumplir la UX.
- La integracion exige cambiar JWT, MFA, refresh rotation o TenantContext.

Documentar causa en:

- docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md

Escalar a:

- CTO Humano + AI-EM-ARCH.

Recomendacion esperada:

- Mantener Typesense como indice derivado protegido por backend o pausar la fase.

## 9. Criterio de salida de la fase

- Backend validado: SearchModule, OpenAPI, tests y typecheck en verde.
- Frontend validado: overlay global, teclado, estados y tests en verde.
- Base de datos validada: PostgreSQL sigue fuente de verdad; rebuild de indice reproducible.
- Infra validada: Typesense dev levanta con health check.
- Tests en verde: suites focalizadas API/Web ejecutadas.
- Documentacion archivada: ADR/HLD/plan/prompt/informe actualizados.
