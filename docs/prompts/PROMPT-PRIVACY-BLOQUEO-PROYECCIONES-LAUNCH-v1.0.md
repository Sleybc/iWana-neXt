# LAUNCH — `privacy` · Bloqueo en proyecciones operativas · Ola 1

**Plan:** `docs/plans/2026-11-05-privacy-bloqueo-proyecciones-operativas-orquestacion.md` · **Spec:** `docs/specs/2026-11-05-privacy-bloqueo-proyecciones-operativas-spec.md`
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates:** G0 pendiente. **No lanzar antes del G0 del CTO ni antes de publicar H-2 y el barrido.**

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | B1 | Tras G0 |

**Reglas:** la entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Los agentes no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-backend, B1 (tras G0) =====
Actúa como sr-backend. Lee AGENTS.md y la spec de bloqueo en proyecciones operativas, §3, §5 y §7, con sus skills de la matriz. Si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Implementa TitularProtectionReadPort (D-BLQ-2) con prueba en rojo primero. Siembra un titular canario bloqueado y prueba contra PostgreSQL cada ruta de §3, dejando en rojo las fugas. Clasifica cada fila de §5 como fuga, descartada o límite, con archivo:línea.
Solo crm/ports, crm/adapters y specs nuevas; sin commit; no edites el plan ni registres gates.
Cierras con un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.
```
