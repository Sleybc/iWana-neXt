# Spec — Rediseño de `/audit-logs` en `apps/web`

- **Fecha:** 2026-04-28
- **Módulo afectado:** `apps/web` (consola plataforma) + extensiones incrementales en `apps/api/src/modules/audit/` y `apps/web/src/lib/api-client.ts`.
- **Origen:** Brainstorming operativo iniciado a partir de la observación de que `/audit-logs` es ilegible para uso diario y supervisión.
- **Modo activo:** Mixto (EM + Architect).

## 1. Problema

La vista actual de auditoría en `apps/web/src/app/(protected)/audit-logs/page.tsx` y `apps/web/src/components/audit/AuditLogsTable.tsx` presenta los eventos como tabla plana con columnas `Fecha | Acción | Entidad | ID Entidad | Usuario | IP`. Esto produce los siguientes problemas comprobados:

- Quien revisa la auditoría no entiende el evento sin expandirlo, porque actor y entidad afectada se muestran como UUIDs.
- No hay diferenciación visual entre eventos críticos (eliminación de usuario, MFA OFF, cambio de rol) y eventos rutinarios (login, lectura).
- Filtros disponibles en backend (`entityType`, `userId`, `fromDate`, `toDate`) no están expuestos en frontend; se filtra solo `action` y rango cliente.
- Paginación cursor-based sin total ni indicador de página.
- No hay vista ejecutiva separable de la vista técnica; supervisores y operadores conviven en la misma fila densa.

## 2. Decisiones de producto cerradas con el usuario

- Prioridades: `1` comprensión inmediata del evento, `2` causalidad/impacto, `3` reducción de ruido, `4` separación ejecutiva/técnica.
- Público: mixto (operación diaria + supervisión).
- Patrón: híbrido — resumen superior + tabla con conmutador `Básico / Técnico`.
- Historia por fila: frase narrativa corta + badges, no tabla cruda.
- Datos visibles sin expandir: actor + acción + entidad + cambio principal + criticidad.
- Identidad legible: sí, con fallback a ID técnico cuando no se pueda resolver.
- Señales del resumen superior: eventos críticos recientes, accesos/autenticación, cambios de permisos/seguridad y acciones por empresa (en plataforma) o top actores (por empresa).
- Ventana default del resumen: **24h** con toggle a 7d.
- Tarjeta de accesos: prioriza señales de riesgo cuando existan, actores activos en caso contrario.
- Agregaciones del resumen: **fase 1 cliente sobre `limit=200`**, fase 5 backend agregado.
- Origen automático/sistema: no existe en el contrato hoy; se aplaza a fase 5.
- `count` total para paginación: aplazado a fase 5; en fase 1 se muestra solo página actual y el botón `Siguiente` se deshabilita cuando `nextCursor` es `null`.

## 3. Resumen superior

### 3.1 Layout

Franja sobre la tabla con grid responsivo `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`. Cuatro tarjetas con la misma anatomía visual.

```
┌─────────────────────┬─────────────────────┬─────────────────────┬─────────────────────┐
│ Eventos críticos    │ Accesos             │ Permisos y          │ Empresas más        │
│ (24h)               │ (24h)               │ seguridad (7d)      │ activas (24h)       │
│   12  ▲ +4          │  340  ▲ +12         │   7  ▼ -2           │  4 con actividad    │
│   …                 │  Fallidos: 9        │  …                  │  …                  │
│ [Ver críticos →]    │ [Ver accesos →]     │ [Ver permisos →]    │ [Filtrar empresa]   │
└─────────────────────┴─────────────────────┴─────────────────────┴─────────────────────┘
```

### 3.2 Anatomía común de tarjeta

- Título + ventana temporal.
- Métrica grande (count).
- Delta vs ventana anterior del mismo tamaño.
- Lista de 2-3 ítems (frase narrativa truncada).
- Acción inferior que aplica filtros a la tabla.

### 3.3 Contenido por tarjeta

**Tarjeta 1 — Eventos críticos**
- Ventana 24h por defecto, toggle 7d en esquina.
- Métrica: count de eventos clasificados como `crítico` (sección 5.2).
- Delta vs ventana anterior.
- Lista: top 3 más recientes con frase corta `{actor} {acción} {entidad}`.
- Acción `Ver críticos →`: aplica filtro `criticidad=crítico` + ventana actual a la tabla.

**Tarjeta 2 — Accesos**
- Ventana 24h.
- Métrica: total `LOGIN_SUCCESS`.
- Sublíneas: `Fallidos: N` (acción `LOGIN_FAILED`) y `MFA: N` cuando exista.
- Lista: si hay señales de riesgo (≥3 fallidos del mismo usuario, IP nueva), priorizarlas; si no, mostrar top 3 actores activos.
- Acción `Ver accesos →`: aplica filtro de acciones de auth.

**Tarjeta 3 — Permisos y seguridad**
- Ventana 7d.
- Métrica: count de cambios de rol + MFA enable/disable + reset password + cambios de status de usuario.
- Lista: top 3 cambios recientes con frase `{actor} {acción} a {usuario afectado}`.
- Acción `Ver permisos →`: aplica filtro del conjunto de acciones.

**Tarjeta 4 — Empresas más activas** (solo vista plataforma)
- Ventana 24h.
- Métrica: número de empresas con actividad.
- Lista: top 3 tenants por count.
- Acción: clic en tenant cambia el selector global y recarga la tabla.

**Tarjeta 4-bis — Top actores** (solo vista por empresa)
- Métrica: usuarios únicos con actividad.
- Lista: top 3 actores con `{nombre} — {count} acciones`.
- Acción: clic filtra tabla por `userId`.

### 3.4 Comportamiento

- Cada tarjeta es clickeable y traduce intención a filtros de tabla.
- Cálculo en fase 1: cliente sobre `limit=200` del endpoint actual.
- Estados: `loading` con skeletons, `vacío` con frase `Sin actividad en esta ventana`, `error` con retry inline.
- Persistencia: ventana elegida (24h/7d) en URL.
- Lo que **no** hace el resumen: no muestra tendencias largas, no exporta, no hace drilldown profundo.

## 4. Conmutador Básico / Técnico

- `Tabs` o segmented control sobre la tabla: `Básico` (default) | `Técnico`.
- Persistido en URL (`?view=basic|technical`).
- Cambia layout de fila, no datos cargados.

## 5. Modo Básico — fila

### 5.1 Anatomía

```
●  Camilo Restrepo  cambió el rol de  Ana Gómez
   [actualización] [usuario]
   rol: Técnico → Administrador
   hace 12 min · Acme                              [crítico]   [▾ Detalles]
```

Componentes (orden visual):

1. **Punto de criticidad** (rojo / ámbar / gris).
2. **Frase narrativa**: `{actor legible} {verbo en pasado} {entidad afectada legible}`. Verbo derivado de `AuditAction`. Fallback de actor: `Usuario {id_corto}` con tooltip al UUID completo.
3. **Badges**: `[acción]` con código de color existente (verde/ámbar/rojo/azul) + `[entidad]` neutro.
4. **Cambio clave** (sección 5.2 — Regla de cambio clave).
5. **Pie**: `hace {tiempo relativo} · {empresa}` a la izquierda, `[criticidad]` y `[▾ Detalles]` a la derecha.
6. **Expandido**: `oldValue/newValue` con formato actual + metadata técnica (`requestId`, `IP`, `userAgent`, `timestamp ISO`, IDs copiables).

### 5.2 Regla de cambio clave

Para `UPDATE` con múltiples campos, se elige un único cambio principal con esta jerarquía (primer match):

1. Seguridad: `role`, `mfaEnabled`, `status`, `isActive`, `password` (mostrado como `contraseña: actualizada`).
2. Identidad: `email`, `name`, `firstName`, `lastName`.
3. Configuración crítica de tenant: `slug`, `schemaName`, `plan`.
4. Primer campo con cambio real, ignorando `updatedAt`, `createdAt`, `lastLoginAt`.

Si hay varios cambios: `{cambio principal} + N más` (resto en expandido).

Para `CREATE`: 1-2 atributos identificables (ej. `email: ana@acme.com`).
Para `DELETE`: identificador (ej. `eliminó: ana@acme.com`).
Para `LOGIN/LOGOUT`: `IP: 190.x.x.x` o se omite.

Helper aislado: `pickKeyChange(oldValue, newValue)`.

### 5.3 Regla de criticidad

Tres niveles, derivados client-side en fase 1, candidatos a persistirse en fase 5:

- **Crítico** (rojo): `DELETE`; cambios de `role`; `mfaEnabled=false`; `status=suspended`; reset de contraseña por otro usuario; cambios sobre tenant (suspender/reactivar/eliminar). El caso `LOGIN_FAILED` repetido (≥5 en 10 min) requiere agregación y se aplaza a fase 5.
- **Medio** (ámbar): `UPDATE` sobre identidad o seguridad que no sea crítico; activación de MFA; cambios de configuración de tenant.
- **Informativo** (gris): `LOGIN`, `LOGOUT`, `CREATE` no sensible, `UPDATE` no sensible.

Helper aislado: `deriveSeverity(action, entityType, diff)`.

## 6. Modo Técnico — fila

Tabla densa, una fila por evento, sin frase narrativa.

| Columna | Contenido | Notas |
|---|---|---|
| Fecha | ISO local + tooltip UTC | sortable |
| Acción | badge | colores actuales |
| Entidad | label legible | |
| Entity ID | UUID copiable | botón copy on hover, tooltip UUID |
| Actor ID | UUID copiable | tooltip resuelve nombre cuando esté |
| IP | string | |
| User-Agent | abreviado (`Chrome 122 / macOS`) | tooltip UA crudo |
| Request ID | 8 chars + copy | base de correlación |
| `[▾]` | expandido idéntico al básico | |

## 7. Estados y paginación

- `loading`: skeletons que respetan altura del modo activo.
- `vacío con filtros`: `No hay eventos que cumplan los filtros actuales` + `Limpiar filtros`.
- `vacío sin filtros`: `Aún no hay actividad registrada en esta ventana`.
- `error`: bloque con retry; si hay `requestId`, mostrarlo.
- Paginación pie de tabla: `Mostrando {N} · Página {P}` con `← Anterior` / `Siguiente →`. `Siguiente` deshabilitado cuando `nextCursor` es `null`. Total agregado en fase 5.

## 8. Boundaries y archivos

- `apps/web/src/app/(protected)/audit-logs/page.tsx` — orquesta plataforma vs por-empresa, mantiene selector de empresa, monta el resumen y la tabla.
- `apps/web/src/components/audit/AuditLogsTable.tsx` — adelgaza, conserva la tabla principal, recibe modo `Básico/Técnico` y filtros.
- `apps/web/src/components/audit/AuditSummary.tsx` (nuevo) — resumen superior con 4 tarjetas.
- `apps/web/src/components/audit/AuditRowBasic.tsx` (nuevo) — fila narrativa.
- `apps/web/src/components/audit/AuditRowTechnical.tsx` (nuevo) — fila técnica.
- `apps/web/src/components/audit/AuditExpandedDetails.tsx` (nuevo) — expandido compartido.
- `apps/web/src/components/audit/helpers/pickKeyChange.ts` (nuevo).
- `apps/web/src/components/audit/helpers/deriveSeverity.ts` (nuevo).
- `apps/web/src/components/audit/helpers/formatActor.ts` (nuevo) — frase y fallback a ID corto.
- `apps/web/src/components/audit/helpers/actionLabel.ts` (nuevo) — verbos en pasado por `AuditAction`.
- `apps/web/src/lib/api-client.ts` — extender tipos con campos enriquecidos cuando los exponga el backend (fase 5).
- `apps/api/src/modules/audit/` — fase 5: actor legible resuelto, severidad persistida, agregaciones para resumen, `count`.

Sin acceso directo a tablas de otros módulos. Todas las extensiones backend pasan por la query layer del módulo `audit`.

## 9. Fases de ejecución

- **Fase 1** — Resumen superior y conmutador Básico/Técnico, agregaciones cliente sobre `limit=200`.
- **Fase 2** — Fila básica con frase, badges, cambio clave y criticidad client-side.
- **Fase 3** — Modo técnico y expandido compartido, copy-to-clipboard de IDs y `requestId`.
- **Fase 4** — Filtros backend (`entityType`, `userId`, fechas, criticidad cuando exista) y estados de tabla.
- **Fase 5** — Enriquecimiento de contrato: actor legible resuelto, severidad persistida, agregaciones backend, `count`, marca de origen automático.
- **Fase 6** — Limpieza: extracción definitiva de helpers y separación de presentación.
- **Fase 7** — Documentación e informes (`docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`) y validación.

Cada fase deja la app utilizable. Fases 1-4 se entregan sin tocar backend.

## 10. Verificación

1. UX: en navegador, entender un evento crítico sin expandirlo.
2. Operación: encontrar cambios de permisos, accesos y acciones por empresa sin scroll manual.
3. Frontend: `pnpm --filter @iwana/web exec tsc --noEmit`.
4. Backend (solo si cambia contrato): `pnpm --filter @iwana/api exec tsc --noEmit`.
5. Diagnóstico del editor en archivos tocados.
6. UX cualitativa: comparar Básico vs Técnico, estados vacío/error/carga, contraste dark mode.
7. Consistencia: mismo lenguaje visual entre auditoría plataforma y auditoría por empresa.

## 11. Riesgos y mitigaciones

- **Cálculos en cliente sobre `limit=200` ocultan eventos** fuera de esa ventana → mitigado mostrando explícitamente el rango cargado y desbloqueando agregación backend en fase 5.
- **Frase narrativa con UUIDs sin resolver** se ve fea → fallback `Usuario {id_corto}` con tooltip y enriquecimiento real en fase 5.
- **Criticidad heurística diverge entre cliente y backend** cuando se persista → centralizar la lógica en helpers que migrarán al backend en fase 5 con la misma forma.
- **Crecimiento de `AuditLogsTable.tsx`** → la fase 6 fuerza extracción y mantiene el componente como orquestador, no como contenedor de toda la lógica.

## 12. Fuera de alcance

- Analítica histórica de tendencias largas.
- Exportación desde tarjetas.
- Drilldown gráfico por entidad.
- Correlación cross-request basada en `requestId` más allá de exponerlo y permitir copiarlo.
