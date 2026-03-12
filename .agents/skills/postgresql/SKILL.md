---
name: postgresql
description: Guia PostgreSQL para iWana neXt con enfoque en multi-tenant por schema, TypeORM, migraciones versionadas, auditoria y diseno seguro de datos.
---

# PostgreSQL

## Proposito

Usa esta skill cuando necesites diseñar, revisar o evolucionar persistencia PostgreSQL dentro del stack real del proyecto.

El foco aqui no es solo modelado relacional generico. El foco es PostgreSQL multi-tenant por schema, TypeORM, migraciones versionadas, rendimiento razonable y resguardo de datos sensibles en un modulith NestJS.

## Cuando usarla

Activa esta skill para tareas como:

- Diseño de tablas, constraints e indices en modulos del backend.
- Revision de entidades TypeORM y sus migraciones.
- Definicion de claves, relaciones y unicidad por tenant.
- Hardening de datos sensibles, auditoria o retencion.
- Analisis de impacto de cambios de esquema.
- Optimizacion de consultas reales del dominio del proyecto.

## Reglas estructurales del repo

### 1. Multi-tenant por schema desde el inicio

Toda decision de persistencia debe partir de esto:

- el aislamiento principal es por schema PostgreSQL
- el tenant se resuelve por request autenticada
- no se hardcodea schema en codigo de negocio
- cualquier migracion o consulta debe ser compatible con este modelo

Si una propuesta rompe o debilita este aislamiento, no es aceptable.

### 2. Sin acceso directo a tablas de otro modulo

Aunque compartan base de datos:

- cada modulo conserva sus boundaries
- evita consultas cruzadas que acoplen directamente tablas de bounded contexts distintos
- si se necesita informacion transversal, define contrato, proyeccion o integracion controlada

### 3. TypeORM y migraciones versionadas

En este repo:

- el mapeo ORM debe ser explicito y mantenible
- los cambios de esquema deben pasar por migraciones versionadas
- las migraciones deben ser revisables y, cuando aplique, reversibles
- no dependas de sincronizacion automatica como politica de entorno

## Criterios de modelado

### Tipos de datos

Prefiere:

- `bigint generated always as identity` para claves surrogate cuando tenga sentido
- `text` para cadenas generales
- `numeric(p,s)` para dinero o valores exactos
- `timestamptz` para tiempo
- `jsonb` solo para atributos opcionales o flexibles, no para ocultar modelo relacional deficiente

Evita por defecto:

- `timestamp` sin zona horaria
- `money`
- `varchar(n)` cuando un `text` con constraint expresa mejor la regla
- enums de negocio demasiado rigidos si el catalogo puede evolucionar con frecuencia

### Constraints

Usa constraints para hacer explicitas las reglas:

- `not null` cuando el dato sea obligatorio
- `check` para invariantes de dominio simples
- `unique` o `unique nulls not distinct` cuando corresponda
- foreign keys dentro del boundary correcto

No delegues todas las invariantes al codigo si la base puede reforzarlas de forma clara.

### Indices

Crea indices por rutas reales de consulta:

- claves primarias y unicas
- claves foraneas
- filtros y ordenamientos frecuentes
- indices compuestos donde el acceso real lo justifique
- indices parciales cuando una fraccion caliente del dato lo amerite

No indexes por reflejo. Indexar de mas tambien cuesta.

## Patrones para iWana neXt

### Dinero y facturacion

- Usa `numeric` para importes.
- Define precision y escala acorde al dominio.
- Evita floats en datos contables o cobrables.

### Auditoria

Para operaciones sensibles, considera estructuras que permitan registrar:

- actor
- tenant
- recurso
- accion
- fecha y resultado

La auditoria no reemplaza el log operativo, pero tampoco debe perderse dentro de este.

### JSONB con disciplina

Usa `jsonb` solo cuando:

- el atributo sea opcional o de forma variable
- no amerite tabla propia aun
- haya una razon clara para no modelarlo relacionalmente

Si consultas por campos internos de `jsonb`, diseña el indice correspondiente o extrae el dato a columna materializada o generada.

### Borrado y retencion

Antes de proponer borrados fisicos, revisa:

- requisitos de auditoria
- cumplimiento y retencion
- impacto operativo y trazabilidad

En muchos casos conviene un estado de negocio o borrado logico, no eliminar evidencia util.

## Checklist de revision

- El diseño respeta multi-tenancy por schema.
- No acopla tablas de modulos distintos.
- Los tipos elegidos refuerzan el dominio.
- Las constraints cubren invariantes relevantes.
- Los indices responden a consultas reales.
- La migracion es segura y revisable.
- Los datos sensibles tienen tratamiento apropiado.
- La solucion evita sobreuso de `jsonb`.

## Heuristica para revisar entidades y migraciones

Busca y corrige estas señales:

- columnas monetarias con tipos float
- timestamps sin zona horaria
- foreign keys sin indice de soporte
- tablas con `jsonb` usado como cajon de sastre
- migraciones destructivas sin plan claro de rollback o backfill
- cambios de esquema que asumen un solo tenant o un schema fijo
- joins o repositorios que cruzan boundaries de modulo sin contrato claro

## Anti-patrones

Evita:

- usar PostgreSQL como excusa para romper boundaries del modulith
- mezclar decisiones de tenancy en cada query sin una estrategia consistente
- confiar en `synchronize` del ORM como mecanismo de evolucion de esquema
- modelar todo en `jsonb` para ir mas rapido
- crear indices antes de entender la consulta real
- proponer SQL ad hoc que contradiga el modelo TypeORM y las migraciones del repo

## Escalacion

Usa [ESCALACION AL CTO] cuando aparezca cualquiera de estos casos:

- necesidad de cambiar el modelo multi-tenant por schema
- excepcion de seguridad o cumplimiento sobre datos sensibles
- cambio estructural de persistencia fuera de PostgreSQL + TypeORM
- migracion de alto riesgo que afecte disponibilidad, integridad o aislamiento entre tenants
