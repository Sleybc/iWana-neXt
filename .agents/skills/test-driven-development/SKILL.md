---
name: test-driven-development
description: TDD aplicado a iWana neXt con foco en red-green-refactor, pruebas utiles por capa y validacion real antes de implementar.
---

# Test-Driven Development

## Proposito

Usa esta skill cuando una tarea de implementacion deba empezar por pruebas y no por codigo productivo.

El objetivo es aplicar TDD de forma util en el stack real del repo: Jest, Supertest y Playwright, con pruebas pequeñas, fallas verificadas y diseño guiado por comportamiento.

## Cuando usarla

Activa esta skill para tareas como:

- Nuevas features o bugfixes.
- Cambios de comportamiento en backend o frontend.
- Refactors donde necesites proteger el comportamiento existente.
- Diseño de una API o componente donde los tests ayuden a aclarar el contrato.

## Regla operativa

No escribas codigo productivo antes de tener una prueba que falle por la razon correcta.

Eso implica:

- definir el comportamiento primero
- escribir una prueba minima
- verificar que falla por ausencia o incumplimiento de la funcionalidad
- implementar solo lo necesario para pasar
- refactorizar manteniendo verde el suite relevante

## TDD en este repo

### Backend

- unit tests con Jest para logica aislada
- integration tests con Jest y Supertest para contratos HTTP y modulos NestJS
- usa factories o fixtures controladas, sin PII real
- valida tambien tenancy, autorizacion o errores cuando sean parte del comportamiento

### Frontend

- tests de componentes o comportamiento donde aporten claridad real
- Playwright para flujos E2E cuando el comportamiento cruza varias capas
- no reemplaces toda la estrategia por snapshots sin valor

### Flujo sugerido

1. escribir una prueba minima
2. ejecutarla y confirmar la falla correcta
3. implementar el minimo necesario
4. ejecutar de nuevo
5. refactorizar si hace falta
6. ampliar cobertura con el siguiente comportamiento, no con sobreingenieria anticipada

## Checklist de uso

- El test describe una conducta real y observable.
- La falla inicial fue verificada.
- La implementacion es minima y enfocada.
- El test no depende de mocks innecesarios.
- Se protege un contrato o regla de negocio real.
- Las pruebas nuevas encajan con la estrategia del repo.

## Heuristica para revisar pruebas

Busca y corrige estas señales:

- tests escritos despues de implementar y que pasan en el primer intento
- nombres vagos que no describen comportamiento
- mocks excesivos que ocultan el caso real
- un test que intenta cubrir demasiadas cosas a la vez
- suites lentas o inestables por depender de estado no controlado
- “TDD” usado como etiqueta aunque no hubo red-green-refactor real

## Anti-patrones

Evita:

- escribir el codigo primero y luego “acomodar” la prueba
- inflar el diseño antes de que el test lo pida
- hacer TDD dogmatico sin distinguir la capa de prueba adecuada
- usar snapshots como sustituto de comportamiento
- saltarte la verificacion de la falla inicial

## Escalacion

Usa [ESCALACION AL CTO] si:

- una restriccion del proyecto impide validar un comportamiento critico con pruebas razonables
- el flujo exige una excepcion metodologica sostenida que degrade la calidad del modulo
