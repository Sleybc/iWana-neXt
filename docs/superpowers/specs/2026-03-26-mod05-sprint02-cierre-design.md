# MOD05 Sprint 02 Cierre Design

> Diseno validado para cerrar Sprint 02 de MOD05 CRM sobre el estado actual del repo, sin reimplementacion literal del prompt ni apertura de una nueva fase.

**Modo activo:** Mixto

**Objetivo**

Cerrar los pendientes reales de Sprint 02 de MOD05 contra `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`, `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md`, `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`, `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md`, `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md` y `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md`, preservando el comportamiento ya implementado cuando este ya cumple el diseno aprobado.

## 1. Alcance aprobado

- Se ejecuta el cierre extendido de Sprint 02 sobre el estado real del repositorio.
- No se rehace backend ni frontend del flujo `expedientes` si ya cumplen funcionalmente.
- No se abre una Fase 03 encubierta ni se introducen cambios de stack, boundary o arquitectura no requeridos por el gate de cierre.
- Se permiten ajustes minimos cuando exista contradiccion entre codigo y documentos, siempre preservando trazabilidad, modulith, multi-tenant por schema, zero-trust PII y migracion aditiva de ADR-024.

## 2. Hallazgos de auditoria inicial

### 2.1 Ya implementado y reutilizable

- Backend de `Expediente Unico Progresivo` ya presente en `apps/api/src/modules/crm/expedientes/` con CRUD principal, timeline, transiciones, completitud, cifrado AES-256-GCM y pruebas unitarias relevantes.
- Endpoints de entidades hijas ya presentes en controller actual.
- Enums CRM compartidos ya presentes en `packages/shared/src/enums/crm/`.
- Portal ya cuenta con overview, listado, detalle, actualizacion por seccion y paneles para contacto, consentimientos y cobertura.

### 2.2 Gaps reales a cerrar

- Filtros y contratos incompletos o inconsistentes para `assignedTo` y `documentNumber`.
- Posibles inconsistencias de validacion en `assign` y en el manejo uniforme de errores Zod.
- Necesidad de confirmar que listados no expongan PII y que el detalle autorizado mantenga comportamiento compatible con el addendum.
- Necesidad de evidencias E2E y ampliacion de pruebas para cerrar `BT-CRM2-36`.
- Necesidad de alinear wiring/integracion minima con MOD03/TenantModule sin reestructuracion excesiva.
- Necesidad de actualizar documentacion viva con el estado real y la evidencia de cierre.

`BT-CRM2-36` se considera cerrado solo cuando existan pruebas suficientes para los tres gaps del addendum y sus hardenings asociados: create/list/revoke/sanitizacion/PII/asignacion/busqueda/E2E del flujo vigente.

## 3. Enfoque de implementacion

### 3.1 Principio rector

Aplicar cambios minimos y trazables. Si el codigo actual ya satisface el criterio funcional del PRD/addendum/prompt, no se modifica por alineacion textual.

### 3.2 Secuencia

1. Auditar archivos criticos de backend, frontend, integracion y pruebas.
2. Corregir solo gaps funcionales reales en `apps/api/src/modules/crm/expedientes/` y wiring asociado.
3. Completar solo los gaps visibles del portal CRM en `apps/portal/` y `apps/portal/src/lib/api-client.ts`.
4. Ampliar pruebas unitarias, de integracion y E2E exclusivamente para los criterios pendientes.
5. Ejecutar verificaciones de calidad.
6. Actualizar `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md` con trazabilidad de cierre.

## 4. Decisiones de diseno

### 4.1 Backend

- Mantener `ExpedienteService` como punto central mientras no bloquee pruebas, seguridad ni boundary.
- Solo extraer o separar logica si la estructura actual impide cerrar pruebas o corregir un gap real.
- Priorizar correcciones en filtros, sanitizacion, visibilidad de PII, summary y consistencia de DTOs/pipes.
- Cualquier ajuste sobre MOD03 debe conservar consumo por puertos read-only y evitar acceso directo a datos del tenant.

### 4.2 Frontend

- Mantener el detalle actual y sus paneles si ya cubren el flujo esperado; no forzar tabs si no agregan valor al cierre.
- Completar solo filtros, acciones o mensajes de error necesarios para el gate.
- Mejorar UX de seguridad solo donde afecte evidencia de PII, consentimiento o uso operativo del CRM.

### 4.3 Legacy

- No eliminar de forma destructiva las tablas legacy ni romper ADR-024.
- El wiring legacy solo se retira o desactiva adicionalmente si el flujo vigente queda cubierto por pruebas y el cambio es minimo.

## 5. Estrategia de pruebas

- Reusar suites existentes antes de crear nuevas.
- Priorizar pruebas que demuestren los pendientes reales del cierre:
  - create/list/detail/assign/search
  - consentimiento y revocacion
  - sanitizacion y ocultamiento de PII
  - timeline enriquecido
  - E2E del flujo vigente del portal
- No crear pruebas de una arquitectura hipotetica ni de una reimplementacion no requerida.

Compatibilidad minima esperada con el addendum en detalle autorizado: el actor con permisos debe poder operar el expediente sin exposicion indebida de PII en vistas de lista y sin perder contexto funcional en el detalle individual.

## 6. Stop / Go operacional

### Go

- Ajustes locales, reversibles y compatibles con el diseno aprobado.
- Cambios que cierren `BT-CRM2-36` y gates de Sprint 02 sin ampliar alcance.

### Stop

- Violacion real de boundary con MOD03.
- Fuga de PII o debilitamiento de controles por rol.
- Necesidad de ADR nuevo o cambio de arquitectura no previsto.
- Cambio destructivo sobre legacy contrario a ADR-024.

## 7. Evidencia esperada de cierre

- Backend y portal cubren los pendientes reales del flujo `expedientes`.
- PII no se expone en listados y el detalle autorizado conserva el comportamiento esperado.
- `BT-CRM2-36` queda respaldado por pruebas ampliadas y verificadas.
- `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md` documenta que faltaba, que se cerro, evidencia ejecutada y riesgos residuales si existieran.

## 8. Restricciones de ejecucion

- No usar worktree.
- No duplicar lo ya implementado.
- No abrir una nueva fase.
- No crear commits sin solicitud explicita del usuario.
