---
name: system-vocabulary-review
description: Use when writing, reviewing, auditing, or improving friendly user-visible vocabulary in iWana neXt; before creating modules, settings sections, audits, UI copy, API seed descriptions, docs, tests, or E2E text that could expose technical/internal terms or confuse non-technical users.
metadata:
  category: discipline
  triggers: vocabulario, copy, labels, textos visibles, auditoria, modulo, seccion, tenant, WFM, NOC, roles, permisos
---

# System Vocabulary Review

Disciplina para mantener el vocabulario de producto consistente, claro y amable para usuario final en iWana neXt.

## Regla De Hierro

**Todo texto visible o semivisible debe usar vocabulario canonico y lenguaje entendible para una persona no tecnica antes de llegar al usuario, a un test o a un documento.**

Violar la letra de la regla es violar su espiritu: si el usuario ve una palabra interna, el sistema ya perdio claridad.

## Cuando Usarla

- Antes de crear una pantalla, seccion, modulo, auditoria, reporte, seed, spec o flujo E2E.
- Al revisar copy existente que suena tecnico, interno o heredado.
- Al mejorar una pantalla que se siente fria, densa, abstracta o escrita para desarrolladores.
- Cuando aparezcan terminos como `tenant`, `MOD00`, `WFM`, `NOC`, `guard`, `work order`, enums crudos o nombres legacy de plantillas.
- Cuando dos pantallas nombran el mismo concepto de forma distinta.

## Flujo Obligatorio

1. Identifica el publico: usuario final, administrador tenant, soporte interno, arquitecto o desarrollador.
2. Lista los terminos visibles o semivisibles que introduce el cambio.
3. Mapea cada termino tecnico a su nombre de producto canonico.
4. Reescribe las frases desde la tarea del usuario: que puede hacer, que significa, que debe revisar o cual es el siguiente paso.
5. Si debes conservar un termino tecnico, agrega contexto simple y accionable en la misma pantalla o flujo.
6. Corrige desde la fuente de verdad: helper compartido, seed backend, contrato, spec o catalogo; evita parches aislados en JSX.
7. Revisa tests y E2E para que esperen el vocabulario nuevo.
8. Si cambias una convencion transversal, actualiza la instruccion o el informe vivo correspondiente.

## Tono Amigable Y Operable

Usa lenguaje de producto que ayude a completar tareas:

- Frases cortas y directas.
- Verbos de accion: crear, revisar, asignar, guardar, reintentar, activar.
- Sustantivos concretos: empresa, perfil de acceso, categoria base, acceso, sede, horario.
- Ayudas que expliquen el siguiente paso o el impacto real.

Evita lenguaje que obligue al usuario final a conocer la arquitectura:

- siglas sin contexto
- nombres de modulos internos
- claves enum o nombres de permisos crudos
- palabras como `payload`, `guard`, `boundary`, `schema`, `tenant`, `work order` en UI final
- frases abstractas como `gestiona la gobernanza granular del control plane`

Cuando el termino tecnico sea necesario, traduce sin perder precision:

| Tecnico necesario | Forma amigable |
| --- | --- |
| MFA | Verificacion en dos pasos |
| permisos efectivos | Accesos finales de esta cuenta |
| auditoria | Historial de cambios |
| API no disponible | No pudimos cargar la informacion. Reintenta en unos minutos. |
| rol protegido | Perfil protegido; no puede editarse desde esta pantalla. |

## Diccionario Inicial

| Termino tecnico/interno | Usar en producto |
| --- | --- |
| tenant | empresa u organizacion |
| UserRole | categoria base |
| AccessProfile | perfil de acceso |
| permission | acceso |
| MOD00 | Configuracion |
| WFM | Operaciones de campo |
| NOC | Monitoreo operativo |
| TECHNICIAN | Tecnico de campo |
| SUPPORT | Soporte inicial |
| CONTRACTOR | Contratista |
| AUDITOR | Auditor |

## Checklist De Revision

- No hay enums crudos ni siglas internas visibles sin contexto.
- La misma entidad se llama igual en UI, docs y tests.
- Los textos de backend que llegan al frontend tambien fueron revisados.
- Los mocks de tests usan nombres canonicos, no fixtures legacy.
- El texto queda claro para un usuario final sin conocer la arquitectura.
- El tono es profesional, cercano y orientado a accion.
- Si hay lenguaje tecnico inevitable, aparece explicado en palabras simples.
- Cada mensaje de error o estado vacio ofrece contexto o proximo paso cuando aplique.
- La precision de seguridad, auditoria y soporte no se pierde por simplificar el lenguaje.

## Racionalizaciones Comunes

| Excusa | Realidad |
| --- | --- |
| "Solo es un test" | Los tests fijan contrato visible; si usan copy viejo, el producto vuelve al copy viejo. |
| "El backend ya lo envia asi" | Entonces el origen del problema esta en el seed o contrato canonico. |
| "El usuario tecnico lo entiende" | La UI debe ser clara para usuario final; lo tecnico puede quedarse en codigo o docs arquitectonicos. |
| "Es una sigla del negocio" | Si la sigla no es obvia, agrega nombre de producto o reemplazala por lenguaje claro. |
| "Suena mas preciso asi" | Precision sin claridad no ayuda; explica el termino tecnico con lenguaje operativo. |
| "El mensaje ya dice el error" | Un buen mensaje tambien orienta el siguiente paso cuando el usuario puede actuar. |

## Excepciones Valididas

- Nombres de enums, tablas, migraciones, rutas internas y contratos versionados cuando cambiarlos rompa compatibilidad.
- Documentos tecnicos que explican explicitamente el termino interno y su equivalente de producto.
- Mensajes de diagnostico internos no expuestos al usuario final, siempre sin PII ni secretos.

Todo lo demas debe seguir el vocabulario canonico.