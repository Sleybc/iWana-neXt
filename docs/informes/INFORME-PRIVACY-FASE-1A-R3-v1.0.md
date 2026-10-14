# Informe R3 — cliente portal de privacidad

**Fecha:** 2026-10-14  
**Bloque:** R3 · `fe-platform`  
**Resultado:** **GO**

La ruta del informe estaba libre antes de crear este archivo.

## Alcance realizado

- `privacyApi.listRequests` usa `RequestKind` y `RequestStatus` inferidos de `@iwana/shared`.
- Los cuerpos de `requireInfo`, `resolveRequest`, `rejectRequest` y `transferRequest` usan `ResponseChannel` y `RequestLegalBasis` del contrato compartido.
- El workspace valida los valores de filtros que lee de la URL y entrega al cliente solamente tipos admitidos por los schemas compartidos. El detalle mantiene el fundamento legal como `RequestLegalBasis`.
- Se añadieron pruebas del cliente para «Ver evidencia» e inventario con respuesta `{ data }`. `request()` desempaqueta la envoltura y el inventario se valida contra `privacyInventorySchema`.
- Durante la verificación, R1 ya estaba en el árbol: los controladores de evidencia e inventario devuelven `{ data }` y sus esquemas OpenAPI reflejan la envoltura. Las pruebas de R3 usan `fetch` simulado con esa forma de respuesta.

## Evidencia

| Comando | Resultado |
| --- | --- |
| `pnpm exec turbo run test --filter=@iwana/portal --force` | 298 suites aprobadas; 2.998 tests aprobados, 1 omitido; 0 tareas desde caché (2 tareas Turbo) |
| `pnpm exec turbo run typecheck --filter=@iwana/portal --force` | 3 tareas aprobadas (shared, UI y portal); 0 cache hits |
| `pnpm --filter @iwana/portal exec jest src/lib/api-client.spec.ts --runInBand` | 1 suite aprobada; 20 tests aprobados |

## Deuda nueva

Ninguna. La cobertura de envolturas es de contrato del cliente con `fetch` simulado; este bloque no ejecuta un E2E portal contra la API levantada.
