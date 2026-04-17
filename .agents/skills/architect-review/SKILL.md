---
name: architect-review
description: "Review arquitectonico enfocado en iWana neXt: modulith, boundaries, multi-tenant por schema, seguridad y stack aprobado."
---

# Architect Review

## Proposito

Usa esta skill cuando la tarea requiera revisar una propuesta tecnica, un cambio de codigo, una decision de diseno o una integracion transversal que pueda afectar boundaries, multi-tenancy, seguridad, observabilidad o gobernanza documental en iWana neXt.

El foco no es proponer microservicios por defecto. El foco es validar si la solucion respeta el modulith del proyecto, el stack aprobado y las restricciones operativas definidas en AGENTS.md y los ADRs vigentes.

## Cuando usarla

Activa esta skill cuando necesites:

- Revisar si un cambio rompe boundaries entre modulos.
- Evaluar si una propuesta respeta PostgreSQL multi-tenant por schema.
- Validar que NestJS, Next.js App Router, TypeORM, Turborepo y OpenAPI se usen de forma coherente.
- Revisar riesgos de acoplamiento, imports circulares o acceso directo a tablas de otro modulo.
- Auditar si una solucion necesita ADR, HLD o escalacion al CTO.
- Revisar impacto de seguridad, cumplimiento o trazabilidad en operaciones sensibles.

## Principios de revision

### 1. El modulith es la arquitectura base

Revisa primero si la solucion mantiene boundaries explicitos entre modulos. Señales de alerta:

- Servicios de un modulo leyendo repositorios o tablas de otro modulo.
- Imports directos entre bounded contexts sin interfaz estable.
- Llamadas ad hoc que saltan capas de aplicacion o de dominio.
- Logica compartida copiada en vez de extraerse a un paquete comun bien delimitado.

### 2. Multi-tenant por schema no es opcional

Cada revision debe comprobar:

- Como se resuelve el tenant en el request autenticado.
- Si la conexion o el contexto de datos respetan el schema correcto.
- Si existen riesgos de fuga de datos entre tenants.
- Si hay cualquier valor hardcodeado de tenant, schema o identificador similar.

### 3. Stack aprobado antes que preferencias genericas

Evalua la propuesta contra el stack vigente:

- Backend: NestJS con TypeScript estricto.
- Frontend: Next.js App Router.
- Persistencia: PostgreSQL + TypeORM.
- Monorepo: Turborepo + pnpm.
- Async: Redis + BullMQ.
- Contrato HTTP: REST versionada con OpenAPI.
- Testing: Jest, Supertest, Playwright.
- Infra MVP: Docker on-prem.

Si la propuesta introduce otra tecnologia base, asume que requiere ADR o escalacion, no que es aceptable por defecto.

### 4. Seguridad y cumplimiento forman parte de la arquitectura

Toda revision debe incluir al menos una comprobacion minima de:

- Validacion de entradas en boundaries externos.
- Ausencia de PII real, secretos o tokens en codigo y logs.
- Reglas de autenticacion y autorizacion aplicables.
- Trazabilidad y audit trail cuando haya operaciones sensibles.
- Riesgos regulatorios si toca CRM, billing, PQR, reporting o datos personales.

Si hay excepcion de seguridad, usa [ESCALACION AL CTO].

## Checklist de revision

### Boundaries y acoplamiento

- El cambio pertenece al modulo correcto.
- No introduce acceso directo a tablas de otro modulo.
- No crea imports circulares.
- La comunicacion inter-modulo usa interfaces tipadas o eventos de dominio cuando corresponde.
- Las responsabilidades siguen separadas entre controlador, aplicacion, dominio e infraestructura.

### Datos y tenancy

- El tenant se resuelve por request.
- No hay schema hardcodeado.
- Las consultas son compatibles con el modelo multi-tenant.
- Las migraciones siguen siendo versionadas y reversibles.

### API y contratos

- Los endpoints nuevos o cambiados tienen impacto OpenAPI identificado.
- Las validaciones de entrada estan explicitadas.
- Los errores y codigos HTTP son coherentes.
- No se rompe compatibilidad sin justificar versionado o ADR.

### Operacion y calidad

- El cambio tiene estrategia de pruebas adecuada.
- Si toca flujos core, se esperan pruebas unitarias e integracion y, si aplica, E2E.
- Los logs no exponen datos sensibles.
- Hay evidencia suficiente para criterio stop/go.

## Heuristica de decision

### Aprobar

Aprueba cuando el cambio:

- Respeta modulith y boundaries.
- Mantiene el contrato multi-tenant.
- Usa el stack aprobado sin introducir deuda estructural innecesaria.
- Tiene una estrategia de pruebas razonable.
- No abre huecos de seguridad ni cumplimiento.

### Pedir ajustes

Pide ajustes cuando el cambio:

- Sea correcto en direccion, pero aun tenga acoplamiento innecesario.
- Tenga deuda de pruebas, documentacion o OpenAPI recuperable.
- Necesite aclarar resolucion de tenant, validaciones o observabilidad.

### Bloquear o escalar

Bloquea o escala cuando el cambio:

- Rompe boundaries del modulith.
- Mezcla datos entre tenants o no garantiza aislamiento.
- Introduce stack o patron fuera del baseline aprobado.
- Debilita controles de seguridad.
- Tiene impacto regulatorio no validado.

## Formato sugerido de salida

Usa una salida breve y accionable:

1. Modo activo: Architect o Mixto.
2. Veredicto: aprobar, ajustar o bloquear.
3. Hallazgos por severidad.
4. Riesgos de arquitectura o seguridad.
5. Si aplica, decision documental requerida: ADR, HLD, PRD, informe o [ESCALACION AL CTO].

## Anti-patrones

Evita estas respuestas:

- Recomendar microservicios porque si.
- Evaluar una solucion sin revisar tenancy.
- Hablar de arquitectura sin aterrizarla al stack real del repo.
- Ignorar impacto en OpenAPI, testing o migraciones.
- Aceptar cambios transversales grandes sin exigir trazabilidad documental.
