# PROMPT DE EJECUCIÓN — Verificación del restore por tenant (Fase 01)

**Versión:** 1.0
**Fecha:** 2026-09-12
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Destinatario:** **AI-SR-QA**
**Track:** T2 — Verificación

## Contratos congelados

- **Contrato a verificar:** [`docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md`](../specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md), versión **1.0**, congelado el 2026-09-12. Los ocho criterios de aceptación de su §4 son tu lista de trabajo.
- **Plan de fase:** [`docs/plans/2026-09-12-plat-ops-restore-por-tenant.md`](../plans/2026-09-12-plat-ops-restore-por-tenant.md)
- **Producto a verificar:** la herramienta entregada por AI-PLAT-OPS en el track T1.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** un veredicto **GO / GO-CON-ENMIENDAS / NO-GO** sobre la capacidad de restore por tenant, sostenido por un ensayo ejecutado, con evidencia archivable conforme a ADR-069.

**Eres el aprobador, no el productor.** No construiste la herramienta y no debes corregirla: si encuentras un defecto, lo reportas. El protocolo §3 es explícito en que el aprobador de un gate nunca es quien produjo el artefacto.

## 2. Preparación — puedes empezar antes de que T1 entregue

El modelo contract-first (protocolo §3bis) te permite trabajar contra el contrato sin esperar a la implementación. **Prepara desde ya** el guion del ensayo, los datos sintéticos y los comandos de verificación de cada criterio. Lo que no puedes es ejecutarlo: los criterios se verifican contra la herramienta real.

## 3. El ensayo

Los ocho criterios de la spec §4. Los seis primeros vienen del `RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §6.3; los dos últimos los añade la spec.

**Montaje obligatorio del ensayo:**

1. Base de ensayo **desechable**, nunca la base de desarrollo del CTO ni ninguna con datos reales.
2. **Dos tenants sembrados**, no uno. Con datos sintéticos distinguibles entre sí.
3. Checksum de las tablas del segundo tenant **antes** de restaurar el primero.

**CA-7 es el criterio que decide la fase.** Restaurar un tenant en una base vacía es un caso fácil que no demuestra aislamiento; lo que G7 exige es recuperar uno *sin tocar a los demás*. Un ensayo con un solo tenant sembrado **no acredita nada** y es causa de STOP declarada en el plan §5.

**CA-8** exige provocar el fallo a propósito: restaurar un dump al que le has quitado el sidecar, y comprobar que aborta con un mensaje accionable en vez de dejar un schema huérfano.

## 4. Escepticismo exigido

No te limites a recorrer la lista. Intenta **romper** la herramienta:

- ¿Qué ocurre con un slug que coincide con dos tenants?
- ¿Y con un tenant en estado distinto de `ACTIVE`?
- ¿Puedes hacer que el `schema_name` llegue a un comando **sin** pasar por la validación? Si lo consigues, es bloqueante: es el vector de inyección que la fase existe para cerrar.
- ¿El modo ensayo se puede saltar sin la bandera explícita?
- Si el dump está truncado o corrupto, ¿aborta o deja un schema a medias?

Si un criterio pasa por una razón distinta de la que dice cubrir, **dilo**. Un test que pasa por casualidad es peor que uno que falta, porque genera confianza injustificada.

## 5. Restricciones no negociables

1. **No corrijas código.** Reporta.
2. **Evidencia sanitizada** (ADR-069): conteos, duración, checksum, base destino, schema y operador. **Nunca** filas de negocio, PII, tokens ni payloads. Aparecer cualquiera de ellos en la evidencia es STOP de fase (plan §5).
3. **Sin base de datos real.** Datos sintéticos siempre.
4. **La duración se mide, no se evalúa.** No hay RTO definido (spec §7): reportar «tardó N segundos» es correcto; declarar «cumple el objetivo» no, porque no hay objetivo contra el que compararlo.
5. **Un criterio sin comando ejecutado no está verificado.** Una afirmación de cumplimiento sin evidencia es supuesto (protocolo §4).
6. Español; identificadores técnicos sin traducir.

## 6. Entregables

| Entregable | Contenido |
| --- | --- |
| Veredicto | GO / GO-CON-ENMIENDAS / NO-GO, con su razón |
| Tabla de los 8 criterios | Estado, comando ejecutado y resultado real de cada uno |
| Hallazgos | Clasificados: bloqueante / importante / deuda aceptada |
| Evidencia archivable | Conteos, duración, checksum, base destino, operador — sanitizada |
| Intentos de rotura | Qué probaste del §4 y qué resistió |

## 7. Criterio stop/go

**GO** si los ocho criterios pasan con evidencia ejecutada y ningún intento de rotura tuvo éxito.

**NO-GO** si CA-7 falla, si consigues inyectar un `schema_name` sin validar, o si aparece PII en la evidencia.

**`[BLOQUEO]` a AI-EM-ARCH** si no puedes montar el ensayo con dos tenants, o si el entorno no te permite verificar CA-4 o CA-5 — no los declares cumplidos por inspección de código.
