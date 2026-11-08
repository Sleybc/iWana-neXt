# INFORME — privacy · G7-T · Verificación por tenant y remediación del fixture

**Versión:** 1.0
**Fecha:** 2026-11-07
**Entorno:** desarrollo local (`local-development`); no se tocó producción
**Bloque:** G7-T del [plan de correcciones de G7](../plans/2026-11-07-privacy-g7-correcciones-orquestacion.md) §2 y §6
**Lanzador:** [PROMPT-PRIVACY-G7-CORRECCIONES-R1-LAUNCH-v1.0.md](../prompts/PROMPT-PRIVACY-G7-CORRECCIONES-R1-LAUNCH-v1.0.md) · R1.2
**Evidencia:** [tenant-verification.json](evidence/privacy-g7-2026-11-07/tenant-verification.json)
**Artefacto verificado:** CLI compilado con `pnpm --filter @iwana/api build`, exit 0, 21 s, 2026-11-07 20:56 (hora local), con las reglas finales de G7-M.

## 1. Resumen ejecutivo

| Métrica | Valor |
| --- | --- |
| Tenants registrados en desarrollo | 124 |
| `--verify-only` con exit 0 | 107 |
| `--verify-only` con exit 1 | 17 |
| Tenants sin titulares marcados (vacíos) | 106 |
| Tenants ACTIVE verificados con el artefacto final | 7 |
| Tenants ACTIVE con residuales tras la remediación | 0 |
| Residuales antes de la remediación | 50 (2 tablas, 25 titulares) |
| Residuales después de la remediación | 0 |

Cierre de G7-T en desarrollo: los 7 tenants ACTIVE quedan en cero con las reglas finales; los 17 INACTIVE con exit 1 tienen causa estructural comprobada y no son elegibles para migrar; los 106 restantes están vacíos y no aportan residuales.

## 2. Método

1. Orden de alias: `public.tenants ORDER BY schema_name`, 1-based (T01…T124). No se usan nombres, UUID, HMAC ni texto de titulares en esta evidencia.
2. `--verify-only` es de solo lectura: abre una transacción por tenant, aplica las reglas en `dry-run`, cuenta residuales y siempre revierte.
3. La verificación final se repitió con el CLI recompilado después de que R1.1 cerrara MOD14, para que las reglas de Billing/CRM y el manifiesto fueran las definitivas.
4. La remediación usó `anonymize-titular --apply` por solicitud (D-BT-12), únicamente sobre el fixture sintético T01.
5. La evidencia agregada vive en `tenant-verification.json`; este informe no duplica identificadores ni texto de titulares.

## 3. Tenants ACTIVE

Los 7 tenants ACTIVE tenían la cadena aplicada hasta la migración 177 en la corrida anterior (`applied_173_to_177`, `migration177: true`). La verificación final con el artefacto nuevo dio:

| Alias | Migración | Titulares verificados | Residuales | Resultado | Causa / nota |
| --- | --- | --- | --- | --- | --- |
| T01 | 173→177 | 25 | 0 | Exit 0 | Fixture E2E de privacidad; remediado en esta ola (§4) |
| T03 | 173→177 | 0 | 0 | Exit 0 | Sin titulares marcados; verificación vacía explícita |
| T04 | 173→177 | 0 | 0 | Exit 0 | Sin titulares marcados; verificación vacía explícita |
| T114 | 173→177 | 0 | 0 | Exit 0 | Sin titulares marcados; verificación vacía explícita |
| T120 | 173→177 | 0 | 0 | Exit 0 | Sin titulares marcados; verificación vacía explícita |
| T123 | 173→177 | 0 | 0 | Exit 0 | Sin titulares marcados; verificación vacía explícita |
| T124 | 173→177 | 0 | 0 | Exit 0 | Sin titulares marcados; verificación vacía explícita |

«Verificación vacía» significa que el tenant tiene las marcas de anonimización, pero no hay filas marcadas que revisar. No se presenta como un cero con datos.

## 4. Remediación de T01 (fixture sintético)

**Estado inicial:** 25 titulares marcados en `expediente_records`, 50 residuales: 25 en `expediente_records` y 25 en `operational_responsibility_history`, uno por titular, introducidos por reglas posteriores a la anonimización original.

**Método:** `anonymize-titular --apply --tenant <T01> --request <solicitud> --expediente <expediente del mismo titular>`, una invocación por solicitud (25 solicitudes, 25 titulares, relación 1:1).

| Paso | Invocaciones | Exit 0 | Efecto |
| --- | --- | --- | --- |
| `--apply` solo con `--request` | 25 | 25 | Sin cambios: `resolveCliScope` no resuelve expedientes por `anonymized_request_id`, así que el alcance quedó vacío y la verificación interna fue vacua |
| `--apply` con `--request` + `--expediente` | 25 | 25 | 25 titulares remediados; `changed.expedienteRecords = 25`; la verificación posterior de cada `--apply` cerró en 0 |
| `--verify-only` final | 1 | 1 | 25 titulares, 0 residuales, `findings: []` |

**Resultado:** 50 → 48 tras la primera solicitud efectiva (control de avance) → 0 tras las 25. El estado final se conserva en la evidencia con `finalArtifact: true`.

**Hallazgo para G7-R/G7-Q:** la reejecución de `--apply` sobre una solicitud ya resuelta solo remedia si se pasa `--expediente`; sin él, el CLI no falla ni avisa y termina con exit 0 sin cambios. No se corrigió el CLI en esta ola porque el lanzador no lo ordena; queda registrado como riesgo de operación.

## 5. Tenants INACTIVE (29)

`--verify-only` acepta tenants en cualquier estado a propósito (K2 cubre todo tenant registrado). Los 29 INACTIVE son fixtures sintéticos de otras olas, no se migraron en esta ola (`not_migrated_non_active`, `migration177: false`) y no son elegibles.

| Alias | Migración 150 (`anonymized_at`) | Exit | Resultado | Código de causa |
| --- | --- | --- | --- | --- |
| T92 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T93 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T94 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T95 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T96 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T97 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T98 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T99 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T100 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T101 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T102 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T103 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T104 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T105 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T106 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T107 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T108 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T109 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T110 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T111 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T112 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T113 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T115 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T116 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T117 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T118 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T119 | No | 1 | CLI falla cerrado | `SIN_MIGRACION_150` |
| T121 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |
| T122 | Sí | 0 | 0 titulares, 0 residuales | `SIN_RESIDUALES` |

**Causa `SIN_MIGRACION_150`:** el schema se detuvo antes de la migración 150 (`TitularAnonymizationMarker`), que agrega `anonymized_at` y `anonymized_request_id` a `subscribers`, `expediente_records` y `party`. Sin esas columnas, `verifyAnonymizedTenantInTransaction` falla cerrado por diseño con `[PRIVACY-ANONYMIZE] El tenant no tiene las marcas de anonimización requeridas.` No es un fallo de datos ni de claves: 17 de 17 coinciden exactamente con la ausencia de la migración 150 y de las dos columnas.

## 6. Tenants no elegibles restantes

| Alias | Estado | Cantidad | Verificación | Causa |
| --- | --- | --- | --- | --- |
| T02 | `PROVISIONING` | 1 | Exit 0, 0 titulares, 0 residuales | `NO_ELEGIBLE`: cadena incompleta y sin titulares marcados |
| T05–T91 | `MARKED_FOR_DELETION` | 87 | Exit 0, 0 titulares, 0 residuales | `NO_ELEGIBLE`: marcados para borrado y sin titulares marcados |

Ninguno de estos tenants se migró ni se modificó en esta ola.

## 7. `nonproductionKeyFallback`

**Origen:** el campo no lo emite el CLI. Era una anotación del generador de evidencia de la corrida anterior. Su base real es esta: `.env.development` define `MFA_ENCRYPTION_KEY` y no define `PII_ENCRYPTION_KEY`; `loadPiiAesGcmKeyPair` cae al fallback no productivo y emite el aviso `PII_ENCRYPTION_KEY no está definida; se usa MFA_ENCRYPTION_KEY como fallback no productivo.` El campo se retiró de la evidencia y se sustituyó por el bloque `keyMaterial`, que explica el hecho sin presentarlo como salida del CLI.

**¿Afecta la verificación de columnas cifradas?** No invalida los conteos de desarrollo:

- Los marcadores cifrados (`*_encrypted`) se comprueban descifrando con la cadena que resuelve `loadPiiAesGcmKeyPair`: clave activa y claves previas, incluida la MFA activa y la MFA previa mientras `PII_DECRYPT_LEGACY_MFA` no se desactive.
- El escritor y el verificador usan la misma función, así que en desarrollo ambos resuelven la misma clave. Una rotación de `MFA_ENCRYPTION_KEY` mantiene la lectura por la clave previa.
- En producción la función falla cerrada si falta `PII_ENCRYPTION_KEY` o si coincide con `MFA_ENCRYPTION_KEY`; el fallback no puede viajar a producción.

Por eso no se repitió con «claves reales del entorno de desarrollo»: no existe una `PII_ENCRYPTION_KEY` distinta en desarrollo y fijar una nueva ahora no descifraría los datos históricos, que se escribieron con la cadena vigente. El requisito de clave independiente es de producción y se verifica allí, no aquí.

## 8. Autorización de `--apply`

El plan §1 dice que no se usa `--apply` para forzar un cero en esta ola. El lanzador R1.2 §3 autoriza explícitamente `--apply` por solicitud para T01, el fixture E2E de privacidad, y prohíbe usarlo en cualquier otro tenant ACTIVE con datos reales. Se siguió el lanzador, que es la fuente del encargo de esta ola:

- Se aplicó solo sobre T01, con datos sintéticos.
- No se aplicó sobre T03, T04, T114, T120, T123 ni T124.
- No se aplicó sobre tenants INACTIVE, PROVISIONING o MARKED_FOR_DELETION.
- No se usó `--apply` para acortar retención ni para alterar una decisión de conservación.

El conflicto queda declarado para que G7-R/G7-Q lo revisen; no se resolvió por conveniencia.

## 9. Qué exige G7 en producción (distinto de este entorno)

1. **Cadena completa por tenant elegible:** aplicar 173→177 con migraciones reversibles y registrar el antes/después, igual que en desarrollo, pero sobre la base real y con ventana operativa.
2. **Verificación con el artefacto desplegado:** `--verify-only` con la misma imagen que corre en producción, no con un build local.
3. **Clave independiente:** `PII_ENCRYPTION_KEY` obligatoria y distinta de `MFA_ENCRYPTION_KEY`; el fallback de desarrollo no es aceptable.
4. **Sin `--apply` sobre datos reales sin título jurídico:** D-BT-12 solo cubre filas previas de una solicitud ya autorizada; este informe no autoriza remediaciones masivas en producción.
5. **Tenants no elegibles:** INACTIVE, PROVISIONING y MARKED_FOR_DELETION no se migran; si uno se reactiva, primero se completa la cadena y después se verifica.
6. **Evidencia sin PII:** alias, conteos y códigos de causa; nunca nombres, UUID, HMAC ni texto de titulares.

## 10. Límites y evidencia

- La verificación es de desarrollo local; no se ejecutó nada contra producción.
- El JSON de evidencia conserva los 124 tenants con su estado, migración, resultado y causa; los identificadores no se publican.
- Los 6 ACTIVE vacíos no demuestran por sí solos que las reglas funcionen con datos: esa cobertura la dan el fixture T01 y las pruebas de integración de MOD14/G7-M.
- No se hicieron commits, ramas ni push.

## 11. Hallazgos para G7-R y G7-Q

| # | Hallazgo | Severidad propuesta |
| --- | --- | --- |
| 1 | `--apply` con solo `--request` sobre una solicitud ya resuelta termina con exit 0 sin cambiar nada porque `resolveCliScope` no resuelve expedientes por `anonymized_request_id` | Media (operación engañosa, sin pérdida de datos) |
| 2 | 17 INACTIVE detenidos antes de la migración 150 hacen fallar el CLI; es correcto, pero el código de causa no se registraba | Baja (ya remediado en la evidencia) |
| 3 | `nonproductionKeyFallback` no era salida del CLI y podía leerse como un hallazgo de claves | Baja (ya retirado de la evidencia) |
