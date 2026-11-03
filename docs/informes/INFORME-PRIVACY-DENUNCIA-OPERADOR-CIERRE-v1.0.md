# INFORME — `privacy` · Denuncia del operador (C-413 de 2025) · cierre

**Versión:** 1.0
**Fecha:** 2026-11-03
**Autor:** AI-EM-ARCH
**Estado de la fase:** **G6 en GO.** G6.5 queda pendiente del commit y el push, y debe estar **antes del 19-11-2026**.
**Spec:** [2026-11-03-privacy-suplantacion-denuncia-operador-spec.md](../specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md) v1.0, **aprobada** (G0 del CTO, 2026-11-03)
**Plan:** [orquestación](../plans/2026-11-03-privacy-denuncia-operador-orquestacion.md) · **Prompt:** [PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0](../prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md), lanzadores v1.0 a v1.2
**HLD:** [HLD-PRIVACY-HABEAS-DATA-v1.4](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.4.md)

## 1. Qué se construyó

La **Sentencia C-413 de 2025** ([relatoría](https://www.corteconstitucional.gov.co/relatoria/2025/C-413-25.htm)) condicionó el art. 8 de la Ley 2573: el operador también debe formular la denuncia penal dentro de los mismos 20 días hábiles. Para cumplirlo, toda SUPLANTACION radicada crea dos tareas nuevas:

| Tarea | Vence | Para cerrarla |
| --- | --- | --- |
| `FORMULAR_DENUNCIA_OPERADOR`: «Formular la denuncia penal de la empresa» | `impersonation_complaint_due_at` (el mismo término del titular) | Nota con el número de radicado o de noticia criminal: de 1 a 120 caracteres, sin saltos de línea, fuera de la auditoría |
| `COMUNICAR_PLAZO_DENUNCIA`: «Comunicar al titular el plazo para denunciar» | El día de la radicación | Nota con el canal y la fecha. Si se completa después, el portal muestra «Comunicación tardía» |

| Pieza | Detalle |
| --- | --- |
| Contrato | `requestTaskKindSchema` con 4 tipos. OpenAPI actualizado. La entidad usa un alias de `RequestTaskKind` (B1-D) |
| Migración **172** (`PrivacyDenunciaOperador1720000000172`) | `CHECK` con 4 tipos. Backfill idempotente en las SUPLANTACION abiertas, con conteo `[172]`. El `down` se bloquea si existen tareas nuevas y no borra nada |
| Portal | Mapas exhaustivos `Record<RequestTaskKind, …>` para la etiqueta y la ayuda de la nota, y badge «Comunicación tardía» con tokens existentes |

## 2. Evidencia

| Gate | Resultado |
| --- | --- |
| CA-DO-01 a 09 | PASS. Postgres real: 16 tests en `requests.service.postgres`. E2E de Fase 1b contra la API real: 5/5, incluido radicar, ver las 4 tareas y cerrar la denuncia con su radicado |
| Typecheck y lint de API, DB, shared y portal | 0 errores (advertencias preexistentes: 7, 5, 0 y 42) |
| Unitarias completas, sin caché | API 446/6.009 · DB 78/426 · shared 28/279 · portal 340/3.438, con 0 fallos. B1-D: `privacy/**` 35/181 y typecheck en 0 |
| Integraciones PG | API: 56/60 suites, con las 4 omisiones del manifiesto. DB: 49/49 |
| Cobertura de `privacy/**` | **96,25 % de líneas y 85,19 % de ramas** (base: 94,61 % / 82,73 %) |
| `sec-eng`, `boundary-reviewer` y `test-change-reviewer` | Sin hallazgos. La única expectativa ajustada pasa de 2 a 4 tareas, como categoría (b) |
| `contract-drift-reviewer` | Una deriva menor (el tipo de la entidad), corregida en B1-D |
| Datos | 0 SUPLANTACION abiertas sin `impersonation_complaint_due_at`. La 172 solo está aplicada en `tenant_e2e_privacy_1b_a114bf06`; los demás tenants de desarrollo la reciben en su próxima corrida de migraciones |

## 3. Respaldo jurídico

**Las decisiones D-DO-1 a D-DO-3 se apoyan en el G0 del CTO, no en un dictamen.** La pregunta 3 de la [consulta v1.1](INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md) sigue abierta. El texto que llegó el 2026-11-03 como dictamen lo generó una IA y quedó [reclasificado como borrador](INFORME-PRIVACY-BORRADOR-POSICIONES-JURIDICAS-IA-v1.0.md). Si el dictamen real cambia el anclaje de los 20 días o la evidencia exigida, se ajusta en una versión posterior.

## 4. Pendiente

| Tema | Dueño | Prioridad |
| --- | --- | --- |
| Commit, push y G6.5 | Usuario y AI-EM-ARCH | **Antes del 19-11-2026** |
| Dictamen de un abogado sobre la consulta v1.1, sobre todo la pregunta 3 | Usuario (enviarla al abogado) | Alta |
| Aplicar la 172 en el resto de tenants de desarrollo | `plat-ops`, con la cadena habitual | Baja |
| Lo que quedó fuera de alcance: constancia como archivo, alertas de tareas vencidas, reanudar el cobro (3(d)) y evidencia de identidad (3(e)) | Según el dictamen | — |
