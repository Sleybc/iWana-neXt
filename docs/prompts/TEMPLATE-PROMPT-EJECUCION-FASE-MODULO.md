# TEMPLATE — Prompt de Ejecucion por Fase de Modulo

**Version:** 1.2
**Estado:** En revisión — **pendiente de promocion a Aprobado por el CTO** (mientras siga en revision, el protocolo §7.4 obliga a citar esta plantilla como propuesta y la regla de destino que contiene no vincula por si sola; hoy la respalda `AGENTS.md` → Documentation Rules, que si es normativo)
**Fecha:** 2026-07-27
**Cambio v1.1 → v1.2:** el destino del archivo pasa de "sugerido" a **obligatorio**, alineado con la supresion de `.github/prompts/` del 2026-07-27

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- **Archivo destino OBLIGATORIO:** `docs/prompts/PROMPT-{MODULO}-{FASE}-v{VERSION}.md`. No es una sugerencia: `AGENTS.md` → Documentation Rules establece que ningun prompt se deposita fuera de `docs/prompts/`, y hacerlo es defecto bloqueante. *(Hasta el 2026-07-27 esta linea decia "destino sugerido"; ser la unica mencion de la ruta correcta en todo el repo, y ademas no vinculante, fue una de las causas de que 30 prompts acabaran en la carpeta equivocada.)*
- Convencion documental general: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Modulo

- Nombre:
- Codigo:
- Fase:
- Version:
- Fecha:
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-{MODULO}-{FASE}-v{VERSION}.md`

---

## 1. Objetivo exacto de la fase

- Resultado esperado:
- Lo que si entra:
- Lo que no entra:

## 2. Artefactos de entrada obligatorios

- PRD del modulo:
- HLD del modulo:
- ADRs aplicables:
- Sprint plan aplicable:
- Prompt arquitectonico origen:
- Artefactos faltantes detectados:

## 3. Instrucciones para Sr. Dev Fullstack

1. Implementar backend requerido por la fase.
2. Implementar frontend requerido por la fase.
3. Implementar migraciones y cambios de base de datos.
4. Actualizar contratos, validaciones y seguridad.
5. Documentar decisiones y desvíos.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No usar credenciales ni datos reales.
- No omitir pruebas ni documentación.

## 5. Entregables tecnicos obligatorios

- Codigo backend
- Codigo frontend
- Migraciones o scripts de base de datos
- Tests unitarios, integracion y E2E segun aplique
- Actualizacion de OpenAPI o contratos

## 6. Entregables documentales obligatorios

- Informe de fase en `docs/informes/`
- Evidencia de calidad en `docs/quality/`
- Actualizacion de PRD/HLD si cambió algo aprobado
- Decision stop/go documentada si aparece bloqueo tecnico
- Si la fase corresponde a correccion o ajuste, actualizar el informe vigente relacionado y no crear uno nuevo

## 7. Criterios de aceptacion

- CA-XXX:
- CA-XXX:
- CA-XXX:

## 8. Criterio de stop/go

- Detenerse inmediatamente si:
- Documentar causa en:
- Escalar a:
- Recomendacion esperada:

## 9. Criterio de salida de la fase

- Backend validado:
- Frontend validado:
- Base de datos validada:
- Tests en verde:
- Documentacion archivada:
