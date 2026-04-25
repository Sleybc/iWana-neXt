# PROMPT — MOD02 Dashboard Empresa Fase 01

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-17
**Modo activo:** Mixto

## Vínculos de trazabilidad

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD base: docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- HLD base: docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- Backlog técnico base: docs/plans/PLAN-MOD02-DASHBOARD-EMPRESA-BACKLOG-v1.0.md
- Sprint plan base: docs/sprints/PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md
- PRD funcional heredado: docs/prds/PRD-MOD02-DEFINICION-v1.0.md
- HLDs heredados: docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md, docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md

## Modulo

- Nombre: Dashboard Empresa
- Codigo: MOD02
- Fase: DASHBOARD-EMPRESA-FASE-01
- Version: 1.0
- Fecha: 2026-03-17
- Generado por: Engineering Manager
- Nombre de archivo destino: docs/prompts/PROMPT-MOD02-DASHBOARD-EMPRESA-FASE-01-v1.0.md

---

## 1. Objetivo exacto de la fase

- Resultado esperado: convertir `apps/portal` en la superficie empresarial tenant-aware correcta para usuarios internos del tenant, reemplazando el dashboard de suscriptor actual y cerrando los contratos mínimos requeridos para operar esa pantalla.
- Lo que si entra:
  - contratos self-service del tenant autenticado,
  - summary del dashboard con datos reales o `null` controlado,
  - reemplazo del contenido actual de `/dashboard`,
  - adaptación de `Sidebar`, `TopHeader` y `DropdownUser`,
  - creación de rutas protegidas mínimas o placeholders necesarios,
  - actividad reciente restringida a `ADMIN` en MVP,
  - pruebas técnicas y E2E del flujo `login -> dashboard empresa`.
- Lo que no entra:
  - dashboard de plataforma en `apps/web`,
  - creación de un portal de suscriptor separado,
  - ampliación de permisos de auditoría a roles no `ADMIN`,
  - KPIs definitivos dependientes de módulos aún no construidos,
  - cambios de stack, tenancy o boundary arquitectónico.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- ADRs aplicables: ADR-018, ADR-019, ADR-022, ADR-023
- Sprint plan aplicable: docs/sprints/PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md
- Prompt arquitectonico origen: docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- Artefactos faltantes detectados:
  - endpoints self-service del tenant autenticado,
  - decisión técnica final sobre `dashboard/summary` como endpoint dedicado o composición de lecturas.

## 3. Instrucciones para Sr. Dev Fullstack

1. Implementar primero los contratos self-service del tenant y evitar cualquier reutilización de `tenants/:id` desde `apps/portal`.
2. Resolver si el summary del dashboard se entrega por endpoint dedicado o por composición explícita, dejando la decisión documentada si afecta varios archivos.
3. Reemplazar el dashboard actual de `apps/portal` por una composición empresarial alineada al PRD y al HLD.
4. Adaptar `Sidebar`, `TopHeader` y `DropdownUser` para que no expongan copy de suscriptor ni rutas rotas.
5. Crear las páginas protegidas mínimas o placeholders requeridos por el shell visible.
6. Implementar composición role-aware del dashboard sin crear forks innecesarios de layout por rol.
7. Mantener la actividad reciente solo para `ADMIN` mientras el backend conserve esa política de acceso.
8. No inventar métricas: cuando un dato no exista, renderizar estado vacío o `no disponible`.
9. Asegurar que el `api-client` del portal exponga métodos tipados para self-service y summary sin mezclar contratos de plataforma.
10. Actualizar el informe vigente con resultados, desvíos, riesgos residuales y decisión de salida.

## 4. Restricciones no negociables

- No romper boundaries del modulith ni mezclar consola de plataforma con consola empresarial del tenant.
- No acceder a endpoints globales de plataforma desde `apps/portal` como solución rápida.
- No usar credenciales, PII real, tokens ni datos sensibles en código, tests, logs o documentación.
- No mantener navegación visible a rutas inexistentes.
- No introducir KPIs inventados ni mocks disfrazados de datos productivos.
- No ampliar permisos de auditoría sin decisión explícita de seguridad.

## 5. Entregables tecnicos obligatorios

- Código backend para contratos self-service del tenant y summary si aplica.
- Código frontend del dashboard empresarial en `apps/portal`.
- Ajustes al shell del portal y rutas protegidas complementarias mínimas.
- Tests unitarios, integración y E2E según aplique al flujo del dashboard.
- Ajustes tipados en el `api-client` y contratos compartidos si son necesarios.

## 6. Entregables documentales obligatorios

- Actualización del informe vigente en docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md
- Evidencia de calidad en docs/quality/ si la fase genera resultados de pruebas o hallazgos
- Actualización de PRD/HLD solo si aparece una desviación aprobada y necesaria
- Decisión stop/go documentada si surge presión para romper el boundary tenant/plataforma

## 7. Criterios de aceptacion

- CA-01: `apps/portal` ya no muestra un dashboard de suscriptor al entrar a `/dashboard`.
- CA-02: el portal consume datos del tenant autenticado mediante contratos self-service y no mediante endpoints globales `tenants/:id`.
- CA-03: la navegación visible del shell no produce rutas rotas ni 404 evitables.
- CA-04: el dashboard renderiza datos reales, vacíos controlados o `null` explícito, nunca métricas ficticias.
- CA-05: la actividad reciente queda limitada a `ADMIN` o a fallback coherente según permisos.
- CA-06: existe evidencia automatizada del flujo `login tenant-aware -> dashboard empresa`.

## 8. Criterio de stop/go

- Detenerse inmediatamente si:
  - la implementación requiere reutilizar contratos globales de plataforma como solución principal,
  - se intenta abrir un portal de suscriptor paralelo dentro de la misma fase,
  - se necesita ampliar permisos de auditoría a roles no `ADMIN`,
  - el summary depende de datos no existentes y se propone inventarlos en UI.
- Documentar causa en: docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md
- Escalar a: CTO + Architect governance
- Recomendacion esperada: mantener el alcance en dashboard empresarial tenant-aware con contratos self-service mínimos y shell controlado.

## 9. Criterio de salida de la fase

- Backend validado: existen contratos self-service y summary mínimo o composición equivalente aprobada.
- Frontend validado: `apps/portal` renderiza dashboard empresarial y navega de forma coherente.
- Base de datos validada: no requiere cambios estructurales no aprobados fuera de los contratos necesarios.
- Tests en verde: existe evidencia suficiente del flujo crítico y de la ausencia de regresión visible.
- Documentacion archivada: informe vigente actualizado y trazabilidad completa entre PRD, HLD, backlog, sprint y prompt.
