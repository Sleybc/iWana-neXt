---
name: backend-security-coder
description: Practicas de seguridad backend para iWana neXt con NestJS, Zod, TypeORM, PostgreSQL multi-tenant por schema, JWT y auditoria.
---

# Backend Security Coder

## Proposito

Usa esta skill cuando necesites implementar o corregir seguridad en backend dentro del stack real de iWana neXt.

El foco es codigo seguro y operativo en NestJS, no auditoria abstracta. Debe aterrizar autenticacion, autorizacion, validacion, tenancy, logs, auditoria y persistencia segura sin salir del baseline aprobado del repo.

## Cuando usarla

Activa esta skill para tareas como:

- Endpoints o servicios NestJS que expongan boundaries externos.
- Validacion de entrada en controladores, handlers, jobs o integraciones.
- Implementacion de JWT, rotacion de tokens, MFA o controles de sesion.
- Autorizacion RBAC o ABAC en modulos del backend.
- Hardening de acceso a datos con TypeORM y PostgreSQL.
- Correccion de fugas de PII, secretos o errores inseguros en logs.
- Endpoints publicos que requieran rate limiting, CORS o endurecimiento adicional.

## Reglas obligatorias del repo

### 1. Validacion en todos los boundaries externos

Toda entrada externa debe validarse con Zod o con el mecanismo tipado acordado en el modulo.

Incluye:

- body, params y query de endpoints HTTP
- payloads de colas y eventos
- configuraciones cargadas desde entorno
- respuestas consumidas desde servicios externos si afectan decisiones de negocio

No confies en tipos de TypeScript como sustituto de validacion runtime.

### 2. Multi-tenant por schema en cada request autenticada

Toda logica de seguridad backend debe verificar:

- como se resuelve el tenant
- como se propaga al caso de uso o servicio
- como se evita acceso cruzado entre schemas
- que no existan valores hardcodeados de tenant o schema

Si un cambio no deja claro el aislamiento de tenant, no esta listo.

### 3. Zero-trust PII

Nunca permitas:

- PII real en tests, fixtures, logs o documentos
- secretos o tokens en codigo versionado
- connection strings hardcodeadas
- errores que devuelvan detalles internos innecesarios

Los logs deben ser utiles sin revelar datos sensibles.

### 4. Prepared statements y ORM seguro

Con TypeORM:

- usa repositorios, query builders y parametros enlazados
- evita concatenar SQL con datos externos
- controla explicitamente filtros dinamicos y ordenamientos permitidos
- valida cualquier identificador dinamico antes de interpolarlo

### 5. Operaciones sensibles requieren audit trail

Cualquier escritura sensible debe considerar trazabilidad:

- quien ejecuto la accion
- sobre que tenant y recurso
- cuando ocurrio
- cual fue el resultado

## Controles minimos por tema

### Autenticacion

- JWT con expiracion y rotacion de refresh tokens.
- MFA cuando el flujo lo requiera.
- Passwords hasheados con algoritmos aprobados por el baseline del proyecto.
- Revocacion o invalidacion clara de sesiones o tokens al cambiar estado critico.

### Autorizacion

- Aplica RBAC o ABAC segun el modulo.
- No mezcles autenticacion con autorizacion en una sola verificacion opaca.
- Valida permisos antes de tocar datos o disparar side effects.
- Si el permiso depende del tenant, resuelvelo con el contexto autenticado del request.

### Endpoints publicos

- Rate limiting obligatorio.
- CORS restrictivo a origenes aprobados.
- Limites de payload cuando el endpoint sea expuesto.
- Respuestas de error consistentes, sin filtrar internals.

### Integraciones externas

- Valida URL, destino y protocolo.
- Evita SSRF con allowlists cuando corresponda.
- Define timeouts y limites de respuesta.
- Sanitiza y valida datos antes de persistirlos o usarlos en decisiones de negocio.

### Logs y errores

- No registrar passwords, tokens, documentos sensibles ni payloads completos sin necesidad.
- Sanitizar mensajes derivados de entrada externa.
- Usar codigos de error y contexto operativo en vez de trazas crudas hacia el cliente.

## Checklist de implementacion

- La entrada se valida en runtime.
- El tenant se resuelve y se propaga correctamente.
- La consulta a datos usa parametros seguros.
- Existe control de autorizacion antes de leer o escribir.
- Los logs excluyen PII y secretos.
- El endpoint o flujo sensible tiene audit trail.
- Si el endpoint es publico, tiene rate limiting y CORS restrictivo.
- La respuesta de error no expone detalles internos.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- `any` o casting excesivo en payloads externos.
- SQL armado por concatenacion.
- Guards o decorators que autentican pero no autorizan.
- Servicios que toman `tenantId` opcional sin contrato claro.
- Logs con `JSON.stringify(request.body)` o equivalentes.
- Uso de secretos como constantes de codigo.
- Excepciones que devuelven stack traces o mensajes de infraestructura.

## Anti-patrones

Evita:

- Validar solo en frontend y asumir que backend esta cubierto.
- Resolver tenant una sola vez y perderlo en capas internas.
- Saltarte TypeORM para construir SQL inseguro por rapidez.
- Dejar endpoints publicos sin rate limiting.
- Considerar auditoria como mejora futura cuando la operacion ya es sensible.
- Proponer desactivar validaciones o endurecimientos por conveniencia.

## Escalacion

Usa [ESCALACION AL CTO] si aparece cualquiera de estos casos:

- excepcion de seguridad al baseline
- decision que debilita aislamiento multi-tenant
- cambio de stack o mecanismo criptografico fuera de lineamientos aprobados
- vulnerabilidad critica bloqueante de merge o sprint
