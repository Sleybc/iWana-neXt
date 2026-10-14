# INFORME-PRIVACY-FASE-1-Q2-v1.0

**Fecha:** 2026-10-14  
**Bloque:** Q2 — calendario, autorizaciones, textos, marcas y puertos  
**Estado:** Implementación parcial; quedan bloqueos contractuales y el gate integrado de PostgreSQL. No aprobado.

## Alcance entregado

- C-CAL-1 en `packages/shared/src/calendar/`: cálculo de fechas civiles sin conversión UTC, fines de semana, fechas trasladables por Ley 51 de 1983, festivos de Pascua, el festivo del 9 de julio establecido por Ley 2578 de 2026 y suma de meses calendario. Los tests contienen las listas esperadas de 2026 y 2027, además de cruces de Semana Santa.
- Schemas Zod compartidos para autorizaciones, textos legales, marcas, retención e incidentes. La entrada de autorización no acepta IP ni user agent del cliente; la respuesta segura tampoco expone esa evidencia. No se añadió schema de solicitudes ni de inventario porque no pertenecían al contrato publicado para Q2.
- Autorizaciones por finalidad con IP y user agent tomados por el controlador, consulta de actividad, vista sin evidencia y prueba con URL firmada de hasta 300 segundos. No hay operación de edición.
- Textos legales versionados e inmutables con SHA-256 calculado por el servidor; marcas de titular; políticas de retención que solo se pueden alargar; creación y consulta de incidentes con plazo SIC calculado en días hábiles y auditoría explícita sin PII.
- Puertos exportados para lectura/escritura de autorizaciones, lectura de marcas, suplantación, bloqueo y anonimización. Los tres puertos cuya implementación corresponde a CRM/Parties tienen adaptadores provisionales que fallan cerrados con `503` hasta que llegue esa integración.
- Módulo registrado en `AppModule`. Se incorporaron `privacy.read` y `privacy.manage` al enum, catálogo y matriz V2. Ambos roles pueden pasar el control de rol de los controladores; la plantilla estándar Auditoría sigue excluyendo estos permisos. La plantilla de protección de datos de Q1 se restringe a `AUDITOR`.
- OpenAPI documenta bodies, respuestas, parámetros de ruta, bearer auth y errores relevantes para las diez operaciones publicadas. `privacy.swagger.spec.ts` verifica las rutas y los esquemas; inventario no se publica mientras falte su contrato.
- Endpoints entregados: `POST /privacy/authorizations`; `GET /privacy/parties/:partyId/authorizations`; `GET /privacy/parties/:partyId/authorizations/:id/proof`; `GET/POST /privacy/legal-texts`; `GET /privacy/parties/:partyId/marks`; `GET/PATCH /privacy/retention-policies`; `GET/POST /privacy/incidents`.

## [BLOQUEO] contractual

No se implementó `GET /privacy/inventory`: C-PRIV-API describe su propósito, pero no define la forma de respuesta ni existe un schema compartido para ella. Definir filas o categorías aquí inventaría el contrato congelado.

Tampoco se exportó `IPrivacyRequestsReadPort`: el prompt lo nombra, pero no define `RequestSummary`. Publicar una forma propia para esa vista 360° también cambiaría el contrato que consumirá CRM. Ambos puntos requieren definición versionada de AI-EM-ARCH antes de implementarse.

## Verificación

| Comprobación                                                                   | Resultado real                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force`  | Exit code 0; `@iwana/api`: 342 suites aprobadas, 4 omitidas; 4.804 tests aprobados, 15 omitidos. `@iwana/shared`: 16 suites aprobadas, 156 tests aprobados. Turbo: 5 tareas, 0 cacheadas.                                                                |
| Calendario y schemas de privacidad dentro de la corrida                        | Incluidos en el total compartido: 2 suites; 8 tests aprobados. La suite de calendario comprueba las listas de 2026 y 2027 y el cómputo sobre Semana Santa.                                                                                               |
| Invariantes RBAC `access-permission-catalog.invariant.spec.ts`                 | 1 suite, 18 tests aprobados sin caché.                                                                                                                                                                                                                   |
| Tests específicos API de Q2                                                    | 3 suites, 7 tests aprobados; cubren IP/user agent del request y ausencia de método de edición, SHA-256, extensión de retención, plazo SIC y OpenAPI.                                                                                                     |
| `pnpm --filter @iwana/api typecheck` y `pnpm --filter @iwana/shared typecheck` | Ambos pasan.                                                                                                                                                                                                                                             |
| `pnpm --filter @iwana/api lint`                                                | 0 errores; 7 advertencias en archivos no modificados por Q2 (`main.ts`, helper de auditoría, soporte in-memory de inventario, controlador de plantillas de OT y seeder de impuestos).                                                                    |
| `pnpm --filter @iwana/shared lint`                                             | Pasa sin errores ni advertencias.                                                                                                                                                                                                                        |
| Edición de autorización contra PostgreSQL / triggers                           | No verificada contra PostgreSQL real: la suite de integración Q1 intentó `127.0.0.1:5433/test` y recibió `ECONNREFUSED`. Los tests de Q2 confirman que el adaptador no ofrece operación de actualización, pero no sustituyen el rechazo SQL por trigger. |

Las listas del calendario están contrastadas con las reglas legales vigentes: [Ley 51 de 1983, Gestor Normativo de Función Pública](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4954) y [Ley 2578 de 2026, Ministerio del Interior](https://www.mininterior.gov.co/noticias/gobierno-sanciona-ley-que-convierte-el-9-de-julio-en-nuevo-festivo-nacional/). La verificación de 2027 usa el cálculo civil independiente de las fechas trasladables y de Pascua; no se encontró una lista anual oficial 2027 publicada para contrastarla.

## Rutas y concurrencia

- Al iniciar, `packages/shared/src/calendar/**`, `packages/shared/src/schemas/privacy/**` y las rutas de implementación Q2 bajo `apps/api/src/modules/privacy/` estaban libres. `apps/api/src/modules/privacy/requests/**` se mantuvo sin cambios y perteneció a Q3.
- Para conectar las rutas requeridas también se modificaron `apps/api/src/app.module.ts`, el enum compartido de permisos y el catálogo/matriz RBAC de `apps/api/src/modules/access-control/`; esos archivos contienen el wiring indispensable para registrar el módulo y reconocer los permisos.
- No se tocaron archivos CRM, `privacy/requests/**` ni la Fase 04 de suscriptores. No se hicieron commits.

## Deuda nueva por severidad

| Severidad                   | Hallazgo                                                                                                                                                                                                                                                         | Acción requerida                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **P1 — bloqueante**         | PostgreSQL de pruebas no estaba disponible; no hay evidencia integrada de triggers, persistencia de autorización ni del ciclo `up/down/up` de Q1.                                                                                                                | Levantar `127.0.0.1:5433/test` y ejecutar las suites de integración de Q1 y la validación del trigger desde el servicio. |
| **P1 — contractual**        | C-PRIV-API no define la respuesta de inventario RNBD ni el prompt define `RequestSummary` para `IPrivacyRequestsReadPort`.                                                                                                                                       | AI-EM-ARCH publica adenda versionada; luego implementar inventario y puerto de lectura sin inferir campos.               |
| **P1 — integración futura** | Los puertos de suplantación, bloqueo y anonimización están enlazados ahora a implementaciones provisionales fail-closed en Privacy. La implementación futura de CRM/Parties requiere acordar el punto de composición Nest sin dependencia inversa desde Privacy. | Resolver el cableado de los adaptadores CRM/Parties al preparar la Ola 2/3 y cubrirlo con integración de módulos.        |
| **P2 — verificación anual** | No se localizó lista gubernamental anual de festivos 2027; el test verifica una lista explícita calculada desde Ley 51, Ley 2578 y Pascua.                                                                                                                       | Contrastar con calendario oficial cuando se publique y conservar prueba de esa fuente.                                   |

**Gate Q2:** pruebas unitarias/API/shared, linters y typechecks pasan; Q2 no se declara aprobado hasta resolver los bloqueos P1 y completar la evidencia de PostgreSQL.
