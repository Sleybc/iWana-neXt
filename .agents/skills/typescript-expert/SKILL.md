---
name: typescript-expert
description: TypeScript para iWana neXt con tipado estricto, pragmatismo en monorepo, boundaries claros y soluciones mantenibles sobre el baseline real.
---

# TypeScript Expert

## Proposito

Usa esta skill cuando una tarea requiera resolver problemas o decisiones de TypeScript dentro del monorepo real del proyecto.

El objetivo no es presumir type gymnastics. El objetivo es producir codigo TypeScript claro, estricto, mantenible y coherente con NestJS, Next.js App Router, pnpm, Turborepo y los boundaries del repo.

## Cuando usarla

Activa esta skill para tareas como:

- Errores de tipos complejos o contratos compartidos entre paquetes.
- Diseño de tipos para DTOs, entidades, APIs o componentes.
- Reorganizacion de imports, paths o referencias en el monorepo.
- Mejora de mantenibilidad tipada sin sobreingenieria.
- Diagnostico de typecheck, build o friccion entre paquetes.

## Reglas del repo

### 1. Tipado estricto con pragmatismo

- prefiere tipos que comuniquen el dominio
- evita abstracciones tipadas que nadie pueda mantener
- no uses type-level cleverness si una interfaz simple resuelve el problema
- reduce `any` y casts innecesarios en boundaries importantes

### 2. Los boundaries importan tambien en TypeScript

- no compartas tipos internos de un modulo como si fueran API publica
- define contratos de integracion claros entre paquetes o modulos
- evita imports profundos a internals de otro bounded context

### 3. Runtime y tipos no son lo mismo

- los tipos no reemplazan validacion runtime
- si el dato entra desde HTTP, cola, entorno o integracion externa, valida tambien en runtime
- alinear tipos con DTOs, schemas o contratos reales del sistema

## Patrones preferidos

### Tipos de dominio

- interfaces y type aliases simples cuando alcanzan
- unions discriminadas para estados o variantes reales del dominio
- tipos compartidos pequenos y estables en contratos entre capas
- branded types solo si aportan claridad real y se pueden sostener

### Monorepo

- paths y exports explicitos
- contratos publicos por paquete o modulo
- evitar cambios amplios de tsconfig sin necesidad fuerte
- resolver errores donde nacen, no maquillarlos con casts globales

### Mantenibilidad

- nombres de tipos legibles
- helpers tipados reutilizables solo cuando reducen duplicacion real
- preferir composicion sobre tipos monstruosos de intersecciones y condicionales profundas

## Checklist de revision

- El tipo comunica la regla de negocio o contrato real.
- No hay `any` o castings evitables en puntos criticos.
- Los imports respetan boundaries del repo.
- La solucion no depende de magia tipada innecesaria.
- El dato externo tiene validacion runtime cuando corresponde.
- El cambio no introduce deuda de tsconfig o paths sin motivo.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- tipos enormes imposibles de leer o explicar
- unions o generics sin necesidad real
- `as unknown as` para forzar compilacion
- modelos internos exportados accidentalmente como API publica
- duplicacion de tipos entre backend y frontend sin contrato claro
- errores de tipo “resueltos” degradando la seguridad del sistema

## Anti-patrones

Evita:

- preferir complejidad tipada sobre claridad del dominio
- esconder un problema de arquitectura detras de un helper generico
- usar TypeScript como sustituto de validacion runtime
- abrir boundaries del monorepo solo para compartir un tipo comodo
- tocar configuracion global cuando el problema es local

## Escalacion

Usa [ESCALACION AL CTO] si:

- una decision tipada implica romper boundaries del modulith o contratos del monorepo
- el cambio exige redefinir estrategia global de compilacion o distribucion interna
- la solucion degrada seguridad o mantenibilidad de forma estructural
