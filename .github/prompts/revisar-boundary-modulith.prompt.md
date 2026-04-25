---
description: "Revisar boundaries del modulith, detectar accesos cruzados indebidos, endpoints mal ubicados o mezcla entre plataforma y tenant antes de implementar o aprobar cambios."
name: "Revisar Boundary Modulith"
argument-hint: "Indica modulo, archivo o cambio a revisar"
agent: "agent"
---

Realiza una revision enfocada en boundaries del modulith para el cambio indicado.

Instrucciones:
- Evalua el cambio con mentalidad de review arquitectonico, no de implementacion.
- Revisa si hay:
  - acceso directo a tablas o entidades de otro modulo
  - mezcla entre consola de plataforma y portal tenant-aware
  - contratos globales usados donde deberia existir self-service del tenant
  - imports circulares o coupling innecesario entre bounded contexts
  - reglas de tenancy, auditoria o seguridad debilitadas
- Prioriza findings concretos con severidad, causa raiz y riesgo de regresion.
- Si no encuentras hallazgos, dilo explícitamente y menciona riesgos residuales o vacios de validacion.
- Usa como referencias principales:
  - AGENTS.md
  - .github/copilot-instructions.md
  - .github/instructions/api.instructions.md
  - .github/instructions/portal.instructions.md
  - .github/instructions/web.instructions.md
- Si el cambio afecta arquitectura o seguridad de forma material, indicar si requiere `[ESCALACION AL CTO]`.
