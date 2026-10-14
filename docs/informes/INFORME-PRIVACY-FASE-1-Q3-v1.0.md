# Informe — Privacy · Fase 1 · Q3 Solicitudes

**Versión:** 1.0  
**Fecha:** 2026-10-14  
**Estado:** Bloqueado antes de implementación; requiere decisión contractual de AI-EM-ARCH  
**Agente:** AI-SR-FULL · Q3

## Resultado

Q3 se detuvo antes de editar código porque C-PRIV-DDL, C-PRIV-PORT y C-PRIV-API v1.0 no contienen todos los datos y capacidades necesarios para implementar R3/R5 dentro del boundary `privacy`. Los contratos están congelados; no se modificaron.

Fuentes revisadas: [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D3/D4, [plan de Fase 1](../plans/2026-10-14-privacy-habeas-data-fase-1.md), [prompt de ejecución](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md) §2 y §3 Q3, `AGENTS.md`, el bootstrap de Copilot, el perfil AI-SR-FULL, el protocolo multiagente y `Stack_Tecnologico.md`.

## [BLOQUEO]

**De:** AI-SR-FULL (Q3) → AI-EM-ARCH  
**Fase/módulo:** Privacy Fase 1 · solicitudes

**Qué intenté:** Contrasté las reglas R3/R5 y D3/D4 con los campos de `data_subject_requests`, los puertos C-PRIV-PORT y el cuerpo C-PRIV-API v1.0.

**Qué falta para desbloquear:** Una adenda versionada de los contratos que resuelva:

1. La referencia persistible a la evidencia de identidad requerida por C-PRIV-API; la tabla de C-PRIV-DDL no incluye ese campo.
2. El almacenamiento de los plazos y de la tarea manual exigidos por R5: fecha límite de denuncia del titular (20 días hábiles) y tarea de suspender el cobro externo con fecha. ADR-094 D3 indica que los plazos se guardan como columnas; el modelo de solicitud no define esos campos ni una tabla para la tarea.
3. La finalidad de la autorización cuando se radica `REVOCAR`. C-PRIV-API no la incluye en el cuerpo descrito y `data_subject_requests` tampoco tiene `purpose`; sin ese dato no se puede aplicar R3 de forma determinista.
4. Una lectura tipada y limitada para saber si existe un contrato no terminado. C-PRIV-PORT define la suspensión por suplantación, pero no una lectura del estado contractual; Q3 no puede consultar tablas ni servicios internos de CRM directamente.

**Impacto:** No es posible demostrar R3/R5 ni cerrar la integración PostgreSQL de R5 con los contratos actuales. No se implementaron endpoints ni máquina de estados.

## Rutas y pruebas

| Ruta | Estado al verificar |
| --- | --- |
| `apps/api/src/modules/privacy/requests/**` | Libre; sin archivos Q3 previos |
| `packages/shared/src/schemas/privacy/requests*` | Libre; sin archivos Q3 previos |
| `docs/informes/INFORME-PRIVACY-FASE-1-Q3-v1.0.md` | Libre antes de crear este informe |

No se editaron archivos de implementación ni contratos. No se ejecutaron pruebas debido al stop previo a edición: **0 suites ejecutadas, 0 casos ejecutados**. Cobertura: **sin medir**. El gate turbo API `--force`, la tabla de plazos, las seis transiciones y la integración R5 quedan pendientes.

## Deuda por severidad

| Severidad | Hallazgo | Acción requerida |
| --- | --- | --- |
| **P1** | Contratos insuficientes para persistir la evidencia y obligaciones de R5, identificar la finalidad de revocación y consultar la condición contractual de R3 sin romper boundaries. | AI-EM-ARCH decide y publica una adenda versionada a C-PRIV-DDL, C-PRIV-PORT y C-PRIV-API; luego se relanza Q3 contra esa versión. |
| **P2 · documental** | No se localizó un PRD ni HLD específico de `privacy` en `docs/prds/` o `docs/hlds/`; la ejecución se definió mediante ADR-094, plan y prompt. | AI-EM-ARCH confirma si esos artefactos son necesarios antes de reabrir Q3 o registra la excepción en el plan. |

No se generó deuda de código: no hubo implementación parcial ni cambios de contrato.

## Siguiente decisión contractual

AI-EM-ARCH debe aprobar y publicar la versión/adenda que defina: (a) cómo se referencia la evidencia del solicitante; (b) dónde se persisten la fecha límite de denuncia y la tarea externa de suspensión del cobro con su fecha; (c) cómo se expresa la finalidad de una solicitud `REVOCAR`; y (d) qué puerto permite evaluar la vigencia contractual requerida por R3. Hasta entonces, Q3 permanece bloqueado.
