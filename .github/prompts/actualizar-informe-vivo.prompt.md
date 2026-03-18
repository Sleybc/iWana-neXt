---
description: "Actualizar el informe tecnico vivo relacionado con cambios recientes en codigo, pruebas o documentacion, sin crear un informe duplicado."
name: "Actualizar Informe Vivo"
argument-hint: "Resume el cambio realizado y el modulo o informe afectado"
agent: "agent"
---

Actualiza el informe vivo correspondiente del workspace con base en el cambio indicado.

Instrucciones:
- Identifica primero el informe vigente mas relacionado en `docs/informes/`.
- Si existe un informe vivo aplicable, actualizalo en lugar de crear uno nuevo.
- Si no existe uno claramente relacionado, propon el archivo correcto siguiendo la convencion documental del repo.
- Mantén la salida alineada a la gobernanza documental de `AGENTS.md`, `.github/copilot-instructions.md` y `.github/instructions/docs.instructions.md`.
- Incluye solo informacion verificable a partir del codigo, pruebas y documentos presentes en el repo.
- Resume:
  - objetivo del cambio
  - archivos o capas afectadas
  - evidencia tecnica disponible
  - riesgos abiertos o limitaciones
  - decision de salida si aplica
- No inventes resultados de pruebas ni aprobaciones.
- Si hay conflicto entre documentos fuente, señalalo explícitamente.

Contexto recomendado a revisar antes de editar:
- AGENTS.md
- .github/copilot-instructions.md
- .github/instructions/docs.instructions.md
