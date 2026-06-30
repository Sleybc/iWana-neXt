---
name: wcag-audit-patterns
description: Auditoria WCAG para iWana neXt con foco en flujos web reales, evidencia accionable, pruebas manuales y correcciones alineadas al frontend del repo.
---

# WCAG Audit Patterns

## Proposito

Usa esta skill cuando necesites auditar o corregir accesibilidad web dentro del proyecto.

El foco es generar hallazgos accionables para el frontend real del repo, no una lista generica de cumplimiento. Debe combinar validacion automatizada, revision manual y priorizacion por impacto en el flujo de usuario.

## Cuando usarla

Activa esta skill para tareas como:

- Auditorias de pantallas o flujos del portal o backoffice.
- Correccion de problemas de navegacion por teclado, foco o semantica.
- Revision de formularios, tablas, dialogs o estados dinamicos.
- Validacion de componentes del sistema de UI.
- Preparacion de evidencia tecnica de accesibilidad para entregables internos.

## Reglas del repo

### 1. La accesibilidad se revisa sobre la UI real

- audita pantallas, componentes y flujos existentes
- prioriza tareas con impacto de negocio o uso frecuente
- no sustituyas pruebas manuales por tooling automatico

### 2. Evidencia clara y corregible

Cada hallazgo debe dejar:

- que falla
- donde falla
- por que importa para el usuario
- como corregirlo
- que criterio o principio afecta

### 3. Accesibilidad integrada al stack

- considera Next.js App Router, componentes reutilizables y estados dinamicos
- no separes accesibilidad de seguridad, i18n o UX cuando el problema las cruza
- si el fix exige cambio de componente base, documentalo como correccion transversal

## Enfoque de auditoria

### Verificacion automatizada

Usa herramientas para barrido inicial, pero no cierres la auditoria ahi.

Busca:

- roles o labels faltantes
- contraste insuficiente
- errores de estructura semantica
- problemas obvios de formularios o landmarks

### Verificacion manual

Revisa al menos:

- orden y visibilidad del foco
- navegacion solo con teclado
- nombres accesibles en botones, links e inputs
- feedback de error y exito en formularios
- dialogs, menus, tabs y componentes interactivos
- lectura comprensible de estados loading, empty y error

### Priorizacion

Prioriza por:

- bloqueo de tarea critica
- impacto transversal en componentes base
- frecuencia de uso del flujo
- facilidad o riesgo del arreglo

## Checklist de revision

- La pantalla se puede recorrer por teclado.
- El foco es visible y coherente.
- Los elementos interactivos tienen nombre accesible.
- Los formularios exponen labels, ayudas y errores utilizables.
- Los estados dinamicos comunican cambios al usuario.
- La estructura semantica es razonable.
- Hay evidencia concreta para reproducir y corregir cada hallazgo.

## Formato sugerido de hallazgo

- Severidad o prioridad.
- Pantalla o componente afectado.
- Problema observado.
- Impacto para usuario.
- Correccion sugerida.
- Verificacion posterior esperada.

## Anti-patrones

Evita:

- declarar cumplimiento total solo con Lighthouse o axe
- listar decenas de hallazgos menores sin ordenar los bloqueantes
- tratar accesibilidad como trabajo cosmetico del final
- corregir un caso puntual sin revisar el componente base reutilizable
- dar recomendaciones vagas sin ruta concreta de remediacion

## Escalacion

Usa [ESCALACION AL CTO] si:

- el hallazgo afecta flujos criticos de forma sistemica
- la remediacion exige cambios transversales grandes no previstos
- existe conflicto entre decisiones visuales, producto y accesibilidad que requiera arbitraje
