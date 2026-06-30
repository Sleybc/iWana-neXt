---
description: "Use when writing or changing user-visible text, API seed descriptions, docs, tests, settings sections, audits, modules, labels, or navigation copy. Enforces friendly canonical vocabulary across iWana neXt."
applyTo: "**/*"
---

# System Vocabulary Instructions

Referencia maestra: `AGENTS.md`.

Esta regla aplica a todo texto visible o semivisible del sistema: UI, labels, placeholders, estados vacios, mensajes de error/exito, seeds de catalogos, descripciones OpenAPI, specs, informes, tests y E2E.

## Regla Principal

El vocabulario del sistema debe ser consistente, claro y amable para el usuario final. Si una palabra ya tiene un nombre canonico de producto, no inventes sinonimos locales por pantalla, test o documento.

El objetivo no es solo evitar terminos internos: cada frase debe poder entenderla una persona que opera el sistema sin conocer la arquitectura, los nombres de modulos ni las siglas tecnicas.

Antes de crear una auditoria, seccion, modulo, endpoint, pantalla, seed o flujo E2E con texto de producto, revisa el vocabulario canonico y usa la skill `system-vocabulary-review`.

## Fuente De Verdad

- En frontend portal, los labels compartidos deben vivir en helpers reutilizables como `apps/portal/src/lib/system-vocabulary.ts` o el catalogo equivalente del modulo.
- No dupliques labels de `UserRole`, plantillas, estados o permisos directamente en componentes si ya existe helper compartido.
- En backend, las descripciones visibles que llegan al portal deben actualizarse en el seed o contrato canonico, no solo en la UI.
- En tests y E2E, los textos esperados deben usar el vocabulario canonico vigente, no nombres legacy de mocks.

## Tono Amigable Para Usuario Final

- Escribe para una persona no tecnica que necesita completar una tarea, no para alguien que conoce el codigo.
- Prefiere frases cortas, verbos concretos y beneficios operativos: `Crear perfil`, `Revisar accesos`, `Asignar perfiles`.
- Evita copy burocratico, excesivamente abstracto o escrito desde la arquitectura: `gobernanza granular`, `boundary`, `modulith`, `matriz`, `payload`, `guard`, `tenant`.
- Cuando un termino tecnico sea necesario por precision, acompaniarlo con contexto simple la primera vez: `MFA (verificacion en dos pasos)`, `auditoria de cambios`, `permisos efectivos`.
- Las ayudas deben explicar que puede hacer el usuario ahora, que pasara despues o como corregir el problema. No deben describir internals del sistema.
- Mantener tono profesional, cercano y directo; evitar infantilizar, exagerar o prometer capacidades que la pantalla no ofrece.

## Vocabulario Canonico Inicial

| Concepto tecnico/interno | Texto de producto recomendado |
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

## Excepciones Permitidas

- Codigo fuente, enums, nombres de tablas, migraciones y contratos tecnicos pueden conservar nombres internos cuando cambiarlos rompa compatibilidad o arquitectura.
- Documentacion arquitectonica puede mencionar el termino tecnico si tambien explica su nombre de producto.
- Logs, auditoria y seguridad no deben sacrificar precision tecnica, pero tampoco deben exponer terminos internos innecesarios al usuario final.
- Si un flujo exige lenguaje tecnico por regulacion, seguridad o soporte, traducelo a una explicacion operable para usuario final antes de mostrarlo en UI.

## Red Flags

- Texto visible con `tenant`, `MOD00`, `WFM`, `NOC`, `guard`, `work order`, claves enum crudas o nombres legacy de plantillas.
- Frases que requieren saber arquitectura para entenderlas.
- Mensajes que dicen que fallo algo sin explicar accion siguiente o contexto util.
- Copy que parece escrito para un equipo tecnico cuando aparece en una pantalla de usuario final.
- Una pantalla usa `rol de empresa` y otra `perfil de acceso` para el mismo concepto sin decision documentada.
- Tests nuevos esperan copy viejo solo porque el fixture lo traia asi.
- Se corrige copy en JSX pero el backend sigue sembrando la descripcion anterior.

Cuando aparezca cualquiera de estas senales, detente y corrige desde la fuente compartida o documenta el bloqueo.