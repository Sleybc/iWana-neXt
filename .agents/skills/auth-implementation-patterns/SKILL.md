---
name: auth-implementation-patterns
description: Patrones de autenticacion y autorizacion para iWana neXt con JWT, rotacion de tokens, MFA, tenancy por schema y auditoria.
---

# Auth Implementation Patterns

## Proposito

Usa esta skill cuando la tarea implique autenticacion, autorizacion o sesion dentro del stack real del proyecto.

Debe aterrizar flujos de identidad al baseline del repo: NestJS, JWT con rotacion, MFA cuando aplique, multi-tenant por schema, RBAC o ABAC y auditoria de operaciones sensibles.

## Cuando usarla

Activa esta skill para tareas como:

- Login, refresh token, logout o revocacion de sesion.
- Guards, policies o decorators de autorizacion.
- MFA con TOTP u otro mecanismo aprobado.
- Resolucion de tenant en requests autenticadas.
- Problemas de permisos, scopes o aislamiento entre tenants.
- Diseño de flujos de acceso para modulos del sistema.

## Reglas no negociables del repo

### 1. JWT con rotacion de tokens

La autenticacion basada en tokens debe contemplar:

- access token de vida corta
- refresh token con rotacion
- invalidacion al detectar reuse, revocacion o cambios de estado critico
- almacenamiento y tratamiento seguro del material de sesion

### 2. Tenant en cada request autenticada

Toda autenticacion y autorizacion debe respetar:

- resolucion explicita del tenant
- propagacion del contexto autenticado a capas internas
- aislamiento entre tenants desde el inicio
- ausencia de tenant hardcodeado o derivado de forma insegura

### 3. Autorizacion separada de autenticacion

No basta con saber quien es el usuario.

Tambien hay que validar:

- que puede hacer
- sobre que recurso
- dentro de que tenant
- bajo que rol, policy o atributo contextual

### 4. Auditoria en operaciones sensibles

Cuando una accion afecte identidad, permisos, credenciales o datos sensibles, deja trazabilidad suficiente.

## Patrones preferidos

### Autenticacion

- Guards claros y composables.
- DTOs y payloads validados en runtime.
- Password hashing con algoritmo aprobado por el baseline vigente.
- MFA desacoplado de la autenticacion base cuando sea posible.
- Manejo de errores sin filtrar si una cuenta existe o no, salvo que el caso de negocio lo exija y este aprobado.

### Autorizacion

- RBAC para reglas estables por rol.
- ABAC cuando el dominio requiera atributos de tenant, recurso o contexto.
- Policies centralizadas cuando la complejidad lo amerite.
- Verificacion antes de side effects o lecturas sensibles.

### Sesion y tokens

- Expiraciones claras.
- Revocacion o versionado de tokens.
- Rotacion de refresh tokens.
- Invalidacion en cambio de password, bloqueo o eventos de seguridad relevantes.

### MFA

- TOTP o mecanismo aprobado por el proyecto.
- Secretos fuera de codigo versionado.
- Flujos de enrolamiento y recuperacion controlados.
- Nunca degradar MFA a una verificacion cosmética del frontend.

## Checklist de implementacion

- El flujo define usuarios, tenant y recursos protegidos.
- El token lifecycle esta claro.
- Hay validacion runtime de entradas.
- La autorizacion no depende solo del rol si el dominio requiere mas contexto.
- El tenant se resuelve y se aplica en todo request autenticado.
- Existen logs o auditoria de eventos sensibles.
- No se filtran secretos, tokens ni PII en respuestas o logs.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- login correcto pero sin revocacion ni rotacion de refresh token
- guards que autentican pero no validan permisos
- permisos evaluados sin tenant o sin recurso
- MFA implementado solo en cliente
- secretos TOTP, JWT o claves embebidas en codigo
- mensajes de error que enumeran cuentas o estados internos

## Anti-patrones

Evita:

- almacenar tokens o secretos sin estrategia de rotacion
- mezclar identidad de usuario y tenant como si fueran lo mismo
- asumir que ocultar botones equivale a autorizacion
- tratar MFA como opcional sin analizar riesgo del flujo
- diseñar autenticacion sin considerar auditoria y respuesta a incidentes

## Escalacion

Usa [ESCALACION AL CTO] si:

- se propone un mecanismo de autenticacion fuera del baseline aprobado
- el flujo rompe aislamiento multi-tenant
- se quiere debilitar rotacion, MFA o controles de autorizacion por conveniencia
- aparece una vulnerabilidad critica en identidad o sesiones
