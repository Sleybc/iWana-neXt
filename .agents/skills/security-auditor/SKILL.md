---
name: security-auditor
description: Auditoria de seguridad para iWana neXt enfocada en OWASP, zero-trust PII, tenancy, auditoria, cumplimiento aplicable y controles reales del stack.
---

# Security Auditor

## Proposito

Usa esta skill cuando necesites revisar postura de seguridad, riesgos, controles o brechas del sistema o de un cambio concreto.

El foco no es una auditoria universal de ciberseguridad. El foco es una revision util para iWana neXt: NestJS, Next.js, PostgreSQL multi-tenant por schema, TypeORM, Redis/BullMQ, OpenAPI, Docker on-prem, zero-trust PII y cumplimiento relevante al contexto del proyecto.

## Cuando usarla

Activa esta skill para tareas como:

- Revisiones de arquitectura o cambios con impacto de seguridad.
- Analisis de autenticacion, autorizacion, tenancy o audit trail.
- Deteccion de riesgos en endpoints, flujos de datos, logs o persistencia.
- Evaluacion de readiness de merge desde seguridad.
- Validacion de controles frente a reglas OWASP y gobernanza interna.

## Reglas del repo

### 1. Zero-trust PII

Toda auditoria debe revisar:

- ausencia de PII real en codigo, tests, logs y docs
- ausencia de secretos en archivos versionados
- manejo seguro de credenciales y tokens
- minimizacion de exposicion de datos sensibles

### 2. Tenancy y boundaries son controles de seguridad

No los trates como detalle de arquitectura.

- verifica aislamiento por schema
- revisa fugas entre tenants
- revisa acceso directo a tablas de otro modulo
- valida boundaries e imports entre bounded contexts

### 3. OWASP y validacion en boundaries externos

- entradas externas validadas
- outputs tratados de forma segura
- queries parametrizadas o via ORM seguro
- errores y logs sin fuga de informacion sensible
- rate limiting y CORS donde aplique

### 4. Cumplimiento aplicable con prudencia

Si el hallazgo toca datos personales, billing, PQR o trazabilidad regulada:

- documenta el riesgo
- no inventes regulacion
- si hay duda, marca requiere verificacion con fuente oficial

## Enfoque de auditoria

### Superficies a revisar

- autenticacion y sesion
- autorizacion por rol, policy o atributo
- endpoints publicos y contratos OpenAPI
- logs, auditoria y observabilidad
- persistencia, migraciones y acceso a datos
- jobs y procesos asincronos sensibles
- frontend con riesgo de XSS, fuga o navegacion insegura

### Priorizacion de hallazgos

Clasifica hallazgos por:

- severidad tecnica
- impacto de negocio
- probabilidad de abuso
- alcance sobre tenants o datos sensibles
- bloqueo de merge o no

## Checklist de revision

- Se valida toda entrada externa relevante.
- El tenant se resuelve y aísla correctamente.
- No hay secretos o PII en codigo y logs.
- Las consultas a datos son seguras.
- Hay autorizacion explicita antes de operaciones sensibles.
- Existe audit trail donde corresponde.
- OpenAPI y errores no filtran internals innecesarios.
- Endpoints publicos tienen endurecimiento minimo esperado.

## Formato sugerido de salida

1. Modo activo: Architect o Mixto.
2. Hallazgos priorizados por severidad.
3. Riesgo residual y condiciones de merge.
4. Acciones correctivas concretas.
5. Si aplica, [ESCALACION AL CTO].

## Anti-patrones

Evita:

- informes genericos llenos de frameworks ajenos al stack real
- recomendar controles cloud o enterprise no alineados al baseline actual sin justificarlo
- tratar tenancy y boundaries como detalles no funcionales
- declarar cumplimiento legal cerrado sin validacion apropiada
- hacer listas largas de riesgos menores sin priorizar lo bloqueante

## Escalacion

Usa [ESCALACION AL CTO] si:

- aparece vulnerabilidad critica bloqueante
- se detecta fuga potencial entre tenants
- se pretende debilitar controles de seguridad establecidos
- surge conflicto fuerte entre seguridad, arquitectura y regulacion
