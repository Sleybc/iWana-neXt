# ADR-073: Cadena de suministro de imágenes — escaneo CVE, SBOM y firma como gate de merge

**Versión:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-08-03
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobación requerida:** CTO Humano — introduce herramientas nuevas en el pipeline y un gate de merge adicional (§5 de la matriz de decisiones del perfil AI-EM-ARCH)
**Revisor obligatorio:** AI-SEC-ENG
**Módulos:** Plataforma transversal — las cinco imágenes desplegables y CI
**Relacionado:** [ADR-071](ADR-071-Convergencia-Runtime-Node-24-LTS.md) (convergencia de runtimes) · [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A8

---

## Contexto

El repositorio construye cinco imágenes desplegables y **no aplica ningún control
de cadena de suministro sobre ellas**: no hay escaneo de vulnerabilidades, ni
SBOM, ni firma, ni attestation de procedencia. `AGENTS.md` declara entre los
merge gates "no critical vulns", pero **no existe ningún mecanismo que lo
verifique**: es un gate declarado y no instrumentado.

[ADR-071](ADR-071-Convergencia-Runtime-Node-24-LTS.md) acaba de cerrar el caso
más visible de este vacío. Cuatro de las cinco imágenes se construyeron durante
meses sobre `node:25`, una versión que terminó su vida el 2026-06-01, y **nada en
el pipeline lo señaló**. Se detectó por lectura manual de un Dockerfile durante
una auditoría. La convergencia a Node 24 corrige ese caso concreto; no corrige la
ausencia del control que debería haberlo detectado sin intervención humana.

La misma clase de vacío cubre las dependencias transitivas. `pnpm-workspace.yaml`
declara **más de sesenta `overrides`** de seguridad —`brace-expansion`,
`nodemailer`, `next`, `postcss`, `handlebars`, `lodash`— añadidos manualmente uno
a uno. Es evidencia de que el equipo sí atiende vulnerabilidades, pero mediante
un proceso reactivo y sin registro de qué versión quedó en cada imagen publicada.

Sin SBOM no se puede responder la pregunta operativa básica ante un CVE nuevo:
*¿qué imágenes desplegadas contienen el paquete afectado, y en qué versión?*

## Decisión propuesta

Instrumentar la cadena de suministro en tres capas, **incrementales y con
umbrales explícitos**, sobre el job `production-images` que ADR-071 ya dejó
construyendo las cinco imágenes en CI.

### 1. Escaneo de vulnerabilidades — gate de merge

Escaneo de cada imagen construida en CI. **Umbral inicial: fallar el job ante
vulnerabilidades `CRITICAL` con corrección disponible.** `HIGH` se reporta pero
no bloquea durante el primer ciclo, para no introducir un gate que nadie pueda
pasar el día que se enciende.

El umbral se endurece a `HIGH` una vez que el inventario inicial esté saneado, y
esa fecha se fija en el informe de fase, no en este ADR.

**Allowlist con caducidad.** Toda excepción exige identificador de CVE, motivo,
responsable y **fecha de revisión**. Una excepción sin fecha es una excepción
permanente disfrazada.

### 2. SBOM — obligatorio, no bloqueante

Generación de SBOM por imagen (formato CycloneDX o SPDX) y publicación como
artefacto de CI asociado al SHA. No bloquea el merge: su valor es responder al
siguiente CVE, no impedir el actual.

### 3. Firma y attestation — última capa

Firma de las imágenes y attestation de procedencia. **Se pospone hasta que exista
un registro de imágenes**, porque hoy no lo hay: `docker-compose.prod.yml`
construye desde `context: .` y la variable `MIGRATOR_IMAGE` que apuntaba a un
registro se eliminó en la auditoría del 2026-08-03 por estar muerta. Firmar
imágenes que nunca se publican no aporta nada.

Queda declarado aquí para que la capa 3 no se pierda, con disparador explícito:
**la adopción de un registro de imágenes**.

### Lo que este ADR no decide

No fija herramientas concretas. La elección entre Trivy y Grype para escaneo, o
entre Syft y el SBOM nativo de BuildKit, es de AI-PLAT-OPS dentro del stack
aprobado y no requiere ADR. Lo que este ADR fija es **que el control existe, qué
bloquea y con qué umbral**.

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| **A — Encender el gate directamente en `HIGH`** | Un gate que bloquea todos los merges desde el primer día se desactiva en una semana. El umbral escalonado es el que sobrevive |
| **B — Escanear solo en releases** | El programa no publica releases todavía ([ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) difiere G7). Un control atado a un evento que no ocurre no es un control |
| **C — Confiar en `pnpm audit` y los `overrides` manuales** | Es el estado actual. Cubre dependencias de npm, no el sistema operativo base de las imágenes — que es exactamente donde vivía el problema de Node 25 EOL |
| **D — Esperar a tener registro para hacerlo todo junto** | Las capas 1 y 2 aportan valor hoy y no dependen del registro. Solo la capa 3 lo necesita |

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | **Sin impacto.** No toca aislamiento, resolución de tenant ni acceso a datos |
| **Seguridad** | **Es el objeto de la decisión.** Convierte "no critical vulns" de declaración a control verificable, y da capacidad de respuesta ante un CVE nuevo mediante el SBOM |
| **Escala** | Sin impacto funcional. Coste operativo: minutos añadidos por corrida de CI, acotables con caché del escáner |
| **Regulación** | Sin obligación directa. Bajo Ley 1581, la diligencia sobre software sin parches es difícil de sostener una vez que se traten datos personales reales — lo que conecta con el disparador 3 de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) |
| **Autoridad** | Herramientas nuevas en el pipeline y gate de merge adicional: **decisión del CTO** |

## Consecuencias

**Positivas**

- El merge gate "no critical vulns" de `AGENTS.md` deja de ser una declaración
  sin instrumentar.
- Una regresión como la de Node 25 EOL la detecta el pipeline, no una auditoría.
- El SBOM permite responder "qué imágenes están afectadas" sin arqueología.

**Negativas / costo**

- Cada corrida de CI se alarga. Mitigable con caché de la base de datos de
  vulnerabilidades.
- La allowlist necesita mantenimiento real; sin las fechas de revisión se
  degrada en una lista de excepciones permanentes.
- El primer encendido probablemente revele un inventario incómodo. Es
  precisamente el motivo para encenderlo.

**Riesgos**

- **Que el gate se desactive ante la primera urgencia de entrega.** Mitigación:
  umbral escalonado y allowlist con caducidad, para que nunca haya que elegir
  entre entregar y tener control.
- **Que la capa 3 se pierda** al depender de un registro inexistente. Mitigación:
  disparador declarado en este ADR.

## Criterio de verificación

1. CI escanea las cinco imágenes y **falla ante `CRITICAL` con corrección
   disponible**.
2. Existe SBOM por imagen, publicado como artefacto asociado al SHA.
3. La allowlist tiene formato con CVE, motivo, responsable y fecha de revisión, y
   está vacía o justificada al aprobarse.
4. El informe de fase registra la fecha comprometida de endurecimiento a `HIGH`.
5. La capa 3 queda registrada con su disparador, sin ejecutarse.

## Referencias

- [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A8, §6 propuesta 7
- [INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md) §5.5 — riesgo residual original
- [ADR-071](ADR-071-Convergencia-Runtime-Node-24-LTS.md) — el caso que este control habría detectado
- `AGENTS.md` → Merge gates — la declaración hoy no instrumentada
- `pnpm-workspace.yaml` → `overrides` — evidencia del proceso reactivo actual
