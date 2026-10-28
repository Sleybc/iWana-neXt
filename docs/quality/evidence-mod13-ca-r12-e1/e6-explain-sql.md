# SQL de EXPLAIN — MOD13 CA-R12 E-6

La prueba E-6 ejecutó ambas variantes con `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre el pool sintético `/16`, usando el mismo tenant, filas de `ipv4_networks` e `ip_assignments` y estadísticas. La tabla temporal de direcciones locales quedó vacía solo para esta comparación; el plan adicional `occupancyWithLocalAddresses` usa las dos filas reales de protección.

## Ocupación anterior, sin protección de direcciones locales

```sql
WITH eligible_ips AS (
  SELECT (n.assignable_from + candidate.ip_offset)::inet AS ip
    FROM ipv4_networks n
    CROSS JOIN LATERAL generate_series(
      0,
      (n.assignable_to - n.assignable_from)
    ) AS candidate(ip_offset)
   WHERE n.id = $1
     AND n.tenant_id = $2
     AND set_masklen((n.assignable_from + candidate.ip_offset)::inet, 32)
         <> set_masklen(n.gateway, 32)
     AND host((n.assignable_from + candidate.ip_offset)::inet)
         <> host(network(n.cidr))
     AND host((n.assignable_from + candidate.ip_offset)::inet)
         <> host(broadcast(n.cidr))
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(n.excluded_ips) AS excluded(ip)
        WHERE set_masklen(excluded.ip, 32)
              = set_masklen((n.assignable_from + candidate.ip_offset)::inet, 32)
     )
), pool AS (
  SELECT COUNT(*)::integer AS total FROM eligible_ips
), usage AS (
  SELECT COUNT(*) FILTER (WHERE a.status = 'RESERVED')::integer AS reserved,
         COUNT(*) FILTER (WHERE a.status = 'ACTIVE')::integer AS active
    FROM ip_assignments a
   WHERE a.tenant_id = $2
     AND a.ipv4_network_id = $1
)
SELECT pool.total,
       usage.reserved,
       usage.active,
       GREATEST(pool.total - usage.reserved - usage.active, 0)::integer AS free
  FROM pool CROSS JOIN usage;
```

## Ocupación actual, con protección local

La consulta nueva conserva la selección anterior y añade esta condición dentro de `eligible_ips`:

```sql
AND NOT EXISTS (
  SELECT 1
    FROM network_router_interface_ipv4_addresses local_address
   WHERE local_address.tenant_id = n.tenant_id
     AND local_address.host_address = set_masklen(
       (n.assignable_from + candidate.ip_offset)::inet,
       32
     )
     AND local_address.host_address >= set_masklen(n.assignable_from, 32)
     AND local_address.host_address <= set_masklen(n.assignable_to, 32)
)
```

Para la comparación old/new, esa condición se evaluó contra una tabla temporal vacía. Para el plan nuevo con las direcciones locales sembradas, se ejecutó contra `network_router_interface_ipv4_addresses` del tenant E6.

La consulta protegida pre-MOD13 queda **N/A**: antes de la migración 165 no existían ni la tabla ni la consulta del conjunto protegido. Los planes y buffers completos están en [e6-explain.json](e6-explain.json); este anexo conserva el SQL que ese JSON no serializa.
