# Spec — D-2 · Constancia previa a la purga de empresas

**Versión:** 1.0  
**Fecha:** 2026-11-10  
**Estado:** Aprobado por el CTO el 2026-11-10 («Aprobar el bloqueo en PostgreSQL»).  
**Fuente:** [Spec R7 §7.5 y D-2](2026-11-09-plat-ops-r7-purga-tenants-rol-de-produccion-spec.md) · [ADR-033](../adrs/ADR-033-Ciclo-Vida-Tenant-Purga-Diferida-Limites-Nullable.md) · [ADR-108](../adrs/ADR-108-Rol-de-Purga-de-Tenants-iwana_purger.md) · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md)

## Constancia por baja

El operador vincula la constancia al UUID de la empresa y al `deleted_at` de la baja vigente. El expediente de acceso restringido conserva el documento original, la fecha y el alcance de la entrega o de la instrucción. El registro operativo conserva solo el tipo de constancia, una referencia opaca al expediente, su huella SHA-256 y la revisión del responsable interno. El documento y los datos entregados se custodian fuera del repositorio y de los logs.

Se admite una de dos evidencias, sujetas a revisión de conservación y bloqueos aplicables al ISP:

- **Devolución o exportación entregada.** Constancia de entrega al ISP con fecha, alcance y referencia al material entregado. Generar un archivo o respaldo por sí solo no acredita la entrega.
- **Instrucción escrita de supresión.** Documento emitido por un representante autorizado del ISP, con alcance aplicable a la baja. Una autorización interna de despliegue no acredita esta instrucción.

Una reactivación, una nueva marca o una revocación invalida la habilitación anterior. La revisión de las obligaciones de conservación queda a cargo del responsable jurídico conforme a ADR-094. [Ley 1581 de 2012, arts. 17 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)

## Mecanismo aprobado

1. Guardar la constancia validada en un registro de plataforma en `public`, vinculado a `(tenant_id, deleted_at)`. El operador autorizado registra o revoca mediante el canal de DBA ya existente. Se usa RLS forzado con una política de lectura para el dueño de las funciones de purga y ninguna política de escritura para los roles de ejecución. Las operaciones registran ambos actos en auditoría. Los originales permanecen en custodia externa.
2. Filtrar en `iwana_list_purge_candidates` por constancia vigente. En `iwana_purge_tenant_schema`, volver a comprobarla después de bloquear el tenant y antes de escribir auditoría de inicio o ejecutar DDL. Las escrituras de constancia usan el mismo orden de locks que la purga para serializar una revocación concurrente. La evidencia de autorización se conserva tras la purga, sin depender de la fila eliminada.
3. Preparar el primer G7 con un inventario de solo lectura de las bajas elegibles por retención, clasificadas por constancia vigente, faltante o revocada. El operador concilia cada candidato habilitado con su original custodiado y deja la referencia de la revisión en el expediente de despliegue. Se inicia con lote uno y se comprueba el par de eventos de auditoría para esa empresa. Las empresas sin constancia quedan fuera del lote.

Un control exclusivamente manual en el arranque sería más corto, pero el cron selecciona por antigüedad y podría recoger una nueva baja elegible después de la revisión. Comprobar el requisito en la función de purga cubre también las invocaciones directas del rol dedicado.

## Aceptación

| Caso | Resultado esperado |
| --- | --- |
| Baja vencida con constancia vigente de entrega o instrucción escrita | Aparece entre los candidatos. La purga conserva la referencia opaca en la evidencia de auditoría. |
| Constancia ausente, revocada o ligada a otra baja | Se excluye de candidatos. La invocación directa falla antes del DDL y conserva esquema y fila. |
| Reactivación y nueva marca, o revocación concurrente | La constancia previa no habilita la nueva baja. El resultado de la revocación se serializa con el de la purga. |
| Escritura desde el rol de la API, el worker o `iwana_purger` | PostgreSQL deniega la escritura de la constancia. |
| Primera purga real | Registro de la revisión operativa, original en custodia, confirmación jurídica de conservación cuando aplique y auditoría del lote vigilado. |

## Operación DBA

En una sesión del canal DBA autorizado, inventariar las bajas que cumplen la retención. `retention_days` debe coincidir con la configuración del worker. La consulta solo devuelve UUID, fecha de baja y estado de constancia.

```sql
BEGIN READ ONLY;
SELECT t.id, t.deleted_at, e.estado
FROM public.tenants t
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN count(*) FILTER (WHERE p.revoked_at IS NULL) > 0 THEN 'VIGENTE'
    WHEN count(*) > 0 THEN 'REVOCADA'
    ELSE 'FALTANTE'
  END AS estado
  FROM public.tenant_purge_evidence p
  WHERE p.tenant_id = t.id AND p.deleted_at = t.deleted_at
) e
WHERE t.status = 'MARKED_FOR_DELETION'
  AND t.deleted_at <= now() - make_interval(days => GREATEST(:'retention_days'::integer, 30))
  AND t.schema_name <> 'tenant_iwana'
ORDER BY t.deleted_at, t.id;
COMMIT;
```

Después de revisar el documento original, registrar la constancia con los parámetros de la baja y el UUID opaco de custodia. `kind` admite `DATA_RETURN_DELIVERED` e `ISP_WRITTEN_INSTRUCTION`. Usar `psql` con `ON_ERROR_STOP` y una transacción `READ COMMITTED`.

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT public.iwana_record_tenant_purge_evidence(
  :'tenant_id'::uuid, :'deleted_at'::timestamptz, :'kind',
  :'evidence_ref'::uuid, :'sha256'
);
COMMIT;
```

Para revocar una constancia vigente de la baja actual, usar la misma transacción y llamar `public.iwana_revoke_tenant_purge_evidence(:'tenant_id'::uuid, :'deleted_at'::timestamptz, :'evidence_ref'::uuid)`. Si el lock está ocupado, repetir tras verificar el resultado del intento en curso. El registro y la revocación quedan auditados.

Antes de revertir 031 en un entorno real, suspender la cola de purga y confirmar que no tiene ejecuciones activas. La reversión se bloquea si el registro contiene constancias. En ese caso, conservar el registro y corregir hacia delante.

El control se aplica al flujo de purga y al DML ordinario. El poder de DDL del migrator que todavía usa el aprovisionador permanece registrado como R7-d. La política de lectura de la constancia la crea 031 con el dueño vigente de las funciones de purga al aplicar la migración: ejecutarlas con el `DB_MIGRATOR_USER` definitivo; si la propiedad cambia después, repetir las políticas en el canal DBA. Queda por confirmar el custodio y aportar evidencia real por ISP antes de habilitar G7.
