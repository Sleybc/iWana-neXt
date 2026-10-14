# INFORME T12 — Inventario histórico de PII fiscal en `audit_logs`

**Fecha:** 2026-10-12  
**Versión:** 1.0  
**Estado:** Entregable documental completo; consulta equivalente ejecutada en solo lectura sobre el endpoint local de integración/desarrollo. El archivo psql no se ejecutó porque `psql` no está instalado.  
**Fuentes:** plan MOD05 v1.4; informe T7 S-T7-01; prompt MOD05 v1.3 §2 T12; PRD MOD01 RF-AUD-04; migración tenant 075; skills `postgresql` y `backend-security-coder`.

## Resultado del inventario

El encargo pide contar, por tenant, filas de `audit_logs` cuyo `entity_type` sea de contrato y cuyo `old_value` o `new_value` contenga, en cualquier profundidad de objetos o arreglos, una de estas claves con valor JSON no nulo: `fiscalDocument`, `fiscal_document`, `fiscalName` o `fiscal_name`.

| Tenant / schema                 | Tenant ID                              | Filas coincidentes | Primera fecha | Última fecha |
| ------------------------------- | -------------------------------------- | -----------------: | ------------- | ------------ |
| `tenant_iwana`                  | `6bc66d88-d0db-4aaf-ae00-0d019cd00fff` |                  0 | `NULL`        | `NULL`       |
| `tenant_srqa_mod11_r5_20261006` | `2408d3a2-6f6c-4a96-8304-529ac80135a2` |                  0 | `NULL`        | `NULL`       |
| `tenant_test_s2_live`           | `86fee1a7-fe66-4da7-a8c0-d107165dac8e` |                  0 | `NULL`        | `NULL`       |

Las fechas son `NULL` porque no hubo filas coincidentes. La sesión no tenía disponible el servidor MCP `postgres-dev` y `psql` no está instalado. Tras un intento de conexión al puerto 5432 que terminó en `ECONNREFUSED`, el orquestador ejecutó la consulta recursiva equivalente con el módulo `pg` sobre el endpoint de integración local (`DB_PORT=5433`, `DB_NAME=dbiw`) usando el rol `iwana_readonly`. Las guardas confirmaron `current_user = iwana_readonly` y `transaction_read_only = on`. La salida recibida fue exclusivamente agregada; la consulta solo evaluó las claves objetivo y no devolvió ni imprimió valores JSON personales.

El archivo [audit-contract-fiscal-pii-readonly.sql](../../scripts/audit-contract-fiscal-pii-readonly.sql) **no se ejecutó**, porque `psql` no está instalado. Queda disponible para el conector `postgres-dev`: abre una transacción `READ ONLY`, exige que `current_user = 'iwana_readonly'`, cita el schema validado antes de generar cada `SELECT` y solo devuelve tenant/schema, conteo y rango de `created_at`. Incluye tenants sin tabla de auditoría con conteo cero y marca `audit_table_present = false`. Sus resultados no exponen `old_value`, `new_value`, claves encontradas ni valores personales.

El filtro cubre los tipos observados en el código: `Contracts` (derivado de `ContractsController`) y los eventos explícitos `Contract`, `ContractServicePoint`, `ContractStratumEvidence` y `STRATUM_EVIDENCE_ACCESS`. En `contracts.service.ts`, `getStratumEvidenceSignedUrl` registra este último con `entityId: contract.id`; por eso también pertenece al alcance de registros asociados a contratos, aunque su `newValue` actual solo contiene el recurso y no se espera que incluya claves fiscales. Un inventario ejecutado deberá conservar la salida agregada por tenant; no debe guardar un dump ni exportar las columnas JSON.

## Propuesta de redacción histórica — NO EJECUTAR

La decisión corresponde al CTO. La propuesta requiere aprobación expresa, revisión de `sec-eng` y ejecución como operación separada por tenant. No se debe borrar la fila de auditoría ni cambiar sus IDs, acción, entidad, actor o fecha. Se propone eliminar recursivamente solo las cuatro claves objetivo cuando su valor sea distinto de JSON `null`, tanto de `old_value` como de `new_value`, conservando el resto de la evidencia.

### Protección de solo-anexar observada

- El PRD MOD01 RF-AUD-04 describe `audit_logs` como append-only y dice que RLS deniega `UPDATE` y `DELETE`.
- La migración tenant 075 documenta que la política RLS previa no era efectiva y deja RLS deshabilitado. La protección activa es el trigger `trg_audit_logs_immutable`, que llama a `public.reject_audit_mutation()` y rechaza `UPDATE`/`DELETE` salvo cuando `current_setting('iwana.audit_maintenance', true) = 'on'`.
- La migración indica que la excepción debe activarse con `SET LOCAL` dentro de una migración revisable. No se debe deshabilitar RLS o el trigger globalmente. Antes de actuar, hay que comprobar en cada tenant que la migración 075 está aplicada, el trigger está activo y el rol de aplicación carece de una ruta de escritura que permita usar la excepción. La diferencia entre el texto del PRD y el mecanismo de la migración debe quedar revisada por seguridad.

La secuencia propuesta por tenant es una transacción controlada, con schema y tenant confirmados desde el inventario, función recursiva temporal que reconstruye objetos/arreglos quitando únicamente las claves objetivo no nulas, y `UPDATE` solo de las filas de contrato cuyo JSON resultante difiere. La función no debe persistirse. La excepción del trigger se limitaría con `SET LOCAL iwana.audit_maintenance = 'on'` en esa misma transacción; al terminar con `COMMIT` o `ROLLBACK`, el setting se revierte automáticamente. El trigger permanecería instalado durante toda la operación.

Esquema SQL ilustrativo para la revisión de `sec-eng` y CTO; `pg_temp.redact_fiscal_keys(jsonb)` representa una función temporal recursiva a validar con fixtures sintéticos antes de cualquier ejecución:

```sql
-- NO EJECUTAR. Requiere aprobación del CTO y revisión de sec-eng.
BEGIN;
SET LOCAL iwana.audit_maintenance = 'on';

-- Crear en pg_temp una función inmutable que:
-- 1) recorra objetos y arreglos recursivamente;
-- 2) quite solo fiscalDocument, fiscal_document, fiscalName y fiscal_name
--    cuando el valor sea distinto de JSON null;
-- 3) conserve todos los otros nodos, el orden de los arreglos y los escalares.
-- CREATE FUNCTION pg_temp.redact_fiscal_keys(jsonb) ...

UPDATE tenant_<schema>.audit_logs AS a
SET old_value = pg_temp.redact_fiscal_keys(a.old_value),
    new_value = pg_temp.redact_fiscal_keys(a.new_value)
WHERE a.entity_type = ANY (
  ARRAY[
    'Contracts', 'Contract', 'ContractServicePoint', 'ContractStratumEvidence',
    'STRATUM_EVIDENCE_ACCESS'
  ]::text[]
)
AND (
  a.old_value IS DISTINCT FROM pg_temp.redact_fiscal_keys(a.old_value)
  OR a.new_value IS DISTINCT FROM pg_temp.redact_fiscal_keys(a.new_value)
);

-- Ejecutar dentro de la transacción la misma comprobación recursiva de T12;
-- exigir cero filas coincidentes en este tenant antes del COMMIT.
-- Si la aserción falla: ROLLBACK.
COMMIT;
```

`tenant_<schema>` es un marcador, no SQL listo para copiar: debe sustituirse por el identificador del tenant validado y citarse como identificador PostgreSQL. El executor no debe aceptar ese valor desde una entrada libre. El `UPDATE` tendría que ejecutarse con la identidad autorizada por el procedimiento aprobado, limitada a un tenant y a las columnas JSON afectadas. Si los permisos actuales no permiten esa operación, no se recomienda revocar controles en caliente: CTO y `sec-eng` deben aprobar un mecanismo temporal de mínimo privilegio y su restauración antes de programar la ejecución.

### Preflight, verificación y reversión

1. **Preflight:** conector de solo lectura `postgres-dev`; confirmar rol, entorno, tenant/schema y tabla; confirmar migración 075, trigger habilitado, función de rechazo y permisos efectivos. Guardar solo conteos/rangos por tenant. No extraer filas ni valores JSON para “backup”.
2. **Ensayo:** validar la función recursiva en fixtures sintéticos con claves anidadas, arreglos, valores `null`, escalares y claves no objetivo. Revisar cantidad de filas afectadas antes de autorizar el `COMMIT`.
3. **Ejecución aprobada:** una transacción por tenant, tabla totalmente calificada, trigger siempre activo y `SET LOCAL` solamente dentro de la transacción. No cambiar filas de otros tipos de entidad. Registrar quién aprobó/ejecutó, tenant, conteos antes/después, hora y resultado, sin PII.
4. **Verificación:** antes del `COMMIT`, volver a ejecutar el detector recursivo y exigir cero coincidencias para las cuatro claves con valor no nulo; comprobar que no cambió el conteo de filas ni sus campos fuera de `old_value`/`new_value`. Repetir luego desde conexión `iwana_readonly` y comparar solo agregados por tenant.
5. **Rollback:** ante cualquier discrepancia antes del commit, `ROLLBACK` restaura el estado transaccional. Después del `COMMIT` no se recomienda un rollback que reintroduzca los valores personales ni guardar una copia paralela con PII; la recuperación sería una corrección hacia delante aprobada, registrada como evento adicional y sometida a nueva revisión. La ventana de excepción del trigger expira al acabar la transacción.

## Riesgos por severidad

### Alta

- **S-T7-01: nuevas escrituras remediadas y verificadas.** T7 confirmó que el flujo de escritura podía persistir el contrato completo y lo calificó como crítico. T11 implementó la remediación para nuevas escrituras y la revalidación de T7 quedó en GO. El inventario encontró cero filas coincidentes en los tres schemas de desarrollo consultados; el riesgo histórico residual se limita a entornos o despliegues no consultados, sobre los que estos resultados no permiten concluir. La decisión de redactar cualquier registro histórico sigue correspondiendo al CTO; esta propuesta permanece **NO EJECUTAR**.

### Media

- **Diferencia entre el control documentado y el desplegado.** RF-AUD-04 atribuye la inmutabilidad a RLS; la migración tenant 075 la implementa mediante trigger y GUC transaccional, con RLS deshabilitado. `sec-eng` debe confirmar el estado real y que la identidad runtime no puede aprovechar el GUC antes de autorizar una redacción excepcional.

### Baja

- **Alcance limitado del inventario.** La consulta equivalente se ejecutó con garantías de solo lectura sobre tres tenants del entorno de integración/desarrollo. El script psql del repositorio no fue ejecutado por falta de `psql`; sus sentencias se revisaron estáticamente y solo generan `SELECT` dentro de una transacción `READ ONLY`.

## Cierre T12

Entregados el script de consulta y la propuesta de redacción para revisión de `sec-eng` y decisión del CTO. El inventario agregado reporta cero coincidencias en los tres tenants de integración/desarrollo consultados. La propuesta histórica permanece **NO EJECUTAR**. No hubo escrituras, cambios de permisos ni devolución o exportación de valores personales.
