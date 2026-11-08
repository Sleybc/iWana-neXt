# INFORME — `privacy` · Barrido de texto libre en la supresión · Cierre

**Versión:** 1.0
**Fecha:** 2026-11-07
**Autor:** AI-EM-ARCH (B6)
**Estado:** Construcción original cerrada: G0, G6 y G6.5 de sus olas. Correcciones de G7 en revisión local, sin commit ni G6.5 propios. **G7 sigue bloqueado** (§6): la spec H-EXP no equivale a su implementación
**Spec:** [2026-11-03-privacy-barrido-texto-libre-supresion-spec.md](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md) v1.2 · **Plan:** [orquestación](../plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md) v1.3 · **ADR:** [ADR-104](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md) · **HLD:** [Privacy v1.5](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.5.md)

## 1. Resultado

La supresión de un titular ya no deja texto libre con sus datos en tickets, PQR, aprovisionamiento, trabajo de campo, motivos de CRM ni auditoría. Una corrida de canarios por la API real bajó los supervivientes de 133 a 88. De esos 88, 84 son columnas excluidas con motivo y 4 son las de R-15 (proveedor), fuera por decisión del CTO. La respuesta jurídica del 2026-11-07 añadió un reloj propio para la PQR y quitó el estrato `1` que la supresión escribía.

## 2. Olas, commits y gates

| Ola | Contenido | Commit | G6.5 |
| --- | --- | --- | --- |
| 1 (B1, B2, B1c, B1c-2) | Reglas CRM R-1 y R-7 a R-11 y R-14; auditoría sin motivos (`reasonProvided`) | `90d42c7f`, junto con H-2, por excepción del CTO | ✅ `84cba824` |
| 2 a 4 (B3, B3-R a R3, B4, B5, B5-R) | Participantes `assurance` y `network`; alcance A-1 a A-4; R-12 y R-13; guardas D-BT-7; bloqueante D-BT-8; manifiesto, invariante y canarios en CI; timeout de integración a 10 min | `c1b56c83` | ✅ CI 42398209146 (intento 2) y E2E 42398209127 |
| 6 (B7, B8) | Retención de PQR, estrato `NULL`, migración 177 | `74c3a984` | ✅ tras `9219bbed` |
| — (R-O1-TZ) | Prueba de retención con fecha civil de Bogotá | `9219bbed` | ✅ CI 42430741410 y E2E 42430741415 |

G0: punto 9 el 2026-11-04 (regularizar con B1c), puntos 1 a 8 el 2026-11-07, y §14 puntos 11 y 12 con ADR-104 el 2026-11-07.

## 3. Cifras

| Medida | Valor |
| --- | --- |
| Columnas textuales clasificadas (manifiesto) | 704: 177 cubiertas, 490 excluidas con motivo, 37 `PENDIENTE-MOD14` |
| Canarios sembrados | 261 |
| Supervivientes: inicial / tras Ola 1 / tras Ola 2 | 143 / 133 / 88 |
| Participantes de la supresión | 9, más Billing |
| Integración de `apps/api` en CI | 74 suites, 3 omitidas declaradas; 4 min 37 s en `9219bbed` |
| Unitarias de `apps/api` (B8) | 483 suites, 6.393 pruebas |

## 4. Errores encontrados por el camino

Se dejan porque explican varias reglas del proyecto.

- **De la spec v1.0 (AI-EM-ARCH):** R-14 mandaba el estrato a `NULL` y violaba `chk_contract_residential_stratum`. La corrección (marca `1`) fue a su vez un error: falseaba un hecho fiscal. ADR-104 E3 la sustituye por `NULL` con `anonymized_at`. Origen: la siembra de canarios omitió columnas por `CHECK` y nadie revisó `skipped` (D-BT-13).
- **De los encargos (AI-EM-ARCH):** B1c impuso un `DB_NAME` que rompía el CI, y omitió dos expectativas que D-BT-5 obligaba a cambiar.
- **Integraciones sin medir:** B3 se entregó con 23 pruebas de integración en rojo, porque solo se midió su propia suite. B4 halló otra rota en K2, que CI no ejecuta.
- **Intermitente ajeno:** `portal-billing-flow.spec.ts` (MOD14) falló una vez y pasó al relanzar.
- **Zona horaria:** la prueba de retención O-1 fallaba todos los días de 19:00 a 24:00 de Bogotá; se vio porque el CI corrió en esa franja.

## 5. Documentos enmendados (D-BT-11)

- [Runbook de bloqueo y supresión](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md): §5.1 (deber fiscal, PQR y proveedor), §5.2 (auditoría y plazo de la solicitud), filas de A.1 corregidas, nueva A.1 bis y alcance del cero de A.3.
- [HLD Privacy v1.5](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.5.md): §2, §3, §4, §5 (177), §6.6, §6.7, §9, §10 y §11.
- [Spec H-2](../specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md): D-HN-3 y §9.
- [Informe D1](INFORME-PRIVACY-FASE-1B-D1-v1.0.md) §4: `[CONSULTA]` cerrada.
- Evidencia de B7 movida a [`evidence/privacy-barrido-b7-2026-11-07/`](evidence/privacy-barrido-b7-2026-11-07/).

La frase de ADR-094 D7 sobre `audit_logs` no se reescribe: D-BT-11 lo deja a pedido del CTO, y el runbook y el HLD ya dicen lo correcto.

## 6. Lo que sigue bloqueando G7

Seguimiento del 2026-11-07 según el [plan de correcciones G7 v1.0](../plans/2026-11-07-privacy-g7-correcciones-orquestacion.md):

1. **Firma cerrada:** el responsable del proyecto confirmó que el abogado ya firmó la segunda respuesta del 2026-11-07. [Acta sin PII](../legal/ACTA-PRIVACY-RETENCION-IWANA-2026-11-07.md); original en custodia externa. El agente no inspeccionó el documento firmado y no extiende esa confirmación a otros dictámenes.
2. **Spec H-EXP emitida:** [v1.0, en revisión](../specs/2026-11-07-privacy-h-exp-retencion-spec.md), 16 CA, motor compartido, job diario y CLI, solicitudes y prueba de autorización/Media. **El requisito funcional sigue abierto** hasta implementar y verificar. La propuesta de canal workload, la excepción restringida a autorizaciones inmutables y su ancla de retención requieren aprobación; no se atribuye esa aprobación a la firma del abogado.
3. **MOD14:** corrección de las 37 clasificaciones en ejecución. Además de clasificarlas, se verifican notas de anulación y respaldo de snapshot 175, para no convertir un hueco real en mera exclusión documental.
4. **Operación por tenant:** cadena necesaria 173–177 aplicada en los 7 ACTIVE de desarrollo, sin activar el contract 109 diferido. Los otros 117 registros no ACTIVE quedan sin mutación. `--verify-only` está en ejecución; ya detectó residuos, por lo que no se afirma cero por el código de salida 0. Informe operativo y conteos finales pendientes.

La decisión general de producción continúa según HLD §11 (beta, otros dictámenes, conciliación y publicación legal). Esta ola no la aprueba.

## 7. Deuda menor (P2)

- Un recurso sin respuesta en un ticket ya respondido no cuenta como pendiente (`pqr-retention-read.adapter.ts:35`).
- El `down` de la 177 borraría una ampliación de plazo hecha por el operador.
- Las notas de cierre de un ticket de un titular suprimido quedan en claro (límite de §10 de la spec).
- `subscriber_tax_assignments.reason` debería normalizarse como código de fundamento más referencia al soporte.
