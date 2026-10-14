# Informe — Privacy · Fase 1 · Q2

**Versión:** 1.1  
**Fecha:** 2026-10-14  
**Estado:** A7 y A9 completados; A8 bloqueado por persistencia no definida. No aprobado.  
**Base:** entrega Q2 v1.0 más adenda v1.1. El calendario, autorizaciones, textos, marcas, retención e incidentes previos se conservaron.

## Resultado

- Se publicó `GET /privacy/inventory` con schema Zod estricto y respuesta declarativa para `CLIENTES`, `PROSPECTOS`, `PROVEEDORES` y `USUARIOS_SISTEMA`. No expone conteos ni consulta módulos CRM; proyecta propósitos, categorías, retención configurada, sensibilidad declarada, transferencia y medidas de seguridad.
- Se completó el manejo de `MediaUsage.PRIVACY_EVIDENCE`: PDF, JPEG, PNG y WEBP, máximo 10 MiB y validación de bytes mágicos. El upload genérico rechaza este uso y el firmador genérico responde 404. La firma dedicada usa un TTL fijo de 300 segundos; la prueba de autorización genera su evidencia por la ruta privacy dedicada.
- A8 no se implementó. El body contractual requiere `externalReference`, pero `privacy_incidents` solo persiste `reported_at`; Q1 v1.1 no autoriza una columna adicional y Q2 no es propietario de DDL ni de la entidad. Aceptar el campo sin guardarlo perdería evidencia. Se conserva el bloqueo para resolución versionada de AI-EM-ARCH.
- Se integró el schema de inventario al OpenAPI y se registraron el controlador y servicio en `PrivacyModule`. El wiring de solicitudes de Q3 se conectó en el módulo compartido, sin modificar `privacy/requests/**`.

## Verificación

| Comprobación | Resultado real |
| --- | --- |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force` | Exit 0; API: **345 suites y 4.826 tests aprobados**, 4 suites y 15 tests omitidos; shared: **18 suites y 162 tests aprobados**; Turbo: 5 tareas exitosas, **0 cacheadas**. |
| Pruebas específicas Q2 de API | **4 suites, 47 tests aprobados** en media, prueba de autorización, inventario y OpenAPI. |
| `pnpm --filter @iwana/api typecheck` | Pasa. |
| `pnpm --filter @iwana/shared typecheck` | Pasa. |
| ESLint de archivos Q2 modificados | Pasa sin errores ni advertencias en los archivos verificados. |
| PostgreSQL `127.0.0.1:5433` | Puerto disponible; Q1 y Q3 aportan sus pruebas de integración tenant en sus informes. Q2 no ejecutó una integración propia de A7/A9 contra la base. |

Los tests de A8 no se cuentan como implementados ni aprobados: no hay escritura de `reported_at` o `externalReference` desde la ruta requerida.

## Rutas y concurrencia

- Se verificó libre `docs/informes/INFORME-PRIVACY-FASE-1-Q2-v1.1.md` antes de crearlo.
- Se trabajó en schemas compartidos de inventario y en las rutas asignadas de `apps/api/src/modules/privacy/`, además de `apps/api/src/modules/media/**` para A9. El archivo `privacy.module.ts` incluye el wiring acordado con Q3; no se editaron `privacy/requests/**`.
- No se rehízo la entrega Q2 v1.0, no se alteraron contratos, no se tocó CRM, no se ejecutó la Fase 04 de suscriptores y no se hicieron commits.

## Deuda nueva por severidad

| Severidad | Hallazgo | Resolución requerida |
| --- | --- | --- |
| **P1 — bloqueante** | A8 no puede guardar `externalReference`: falta la columna y el campo no existe en la entidad autorizada para Q2. | AI-EM-ARCH versiona la adenda DDL/contrato; luego implementar `reported` de una sola vez, auditar sin PII y probar persistencia. |
| **P1 — integración de privacidad** | La lectura firmada de evidencia de identidad de solicitudes no tiene ruta contractual. Q3 conserva el ID y valida la evidencia, pero no expone una URL dedicada. | Resolver y congelar la ruta privacy antes de habilitar consulta posterior de evidencia; el firmador genérico debe seguir cerrado. Ver informe Q3 v1.1. |
| **P2 — migración pública** | La integración PostgreSQL de la migración pública 027 no corrió localmente por falta de una base permitida. | Ejecutar la suite pública en CI G6.5 conforme al informe Q1 v1.1. |

**Gate Q2:** el gate de tests indicado y los typechecks pasan sin caché. La entrega queda parcial hasta resolver A8 y completar su prueba de persistencia.
