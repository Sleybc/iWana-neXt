---
name: docker-expert
description: Docker para iWana neXt con despliegue on-prem, imagenes seguras, builds reproducibles y orquestacion simple coherente con el monorepo.
---

# Docker Expert

## Proposito

Usa esta skill cuando necesites diseñar, revisar u optimizar contenedores del proyecto.

El objetivo aqui es Docker util para el baseline real de iWana neXt: despliegue MVP on-prem, monorepo con pnpm y servicios del stack aprobado. No asume Kubernetes ni plataformas cloud por defecto.

## Cuando usarla

Activa esta skill para tareas como:

- Dockerfiles para backend, frontend o servicios auxiliares.
- Compose o definiciones operativas simples para entorno local o MVP on-prem.
- Hardening de imagenes, usuarios no root y manejo de secretos.
- Optimizacion de capas, tamanio de imagen y tiempos de build.
- Diagnostico de networking, healthchecks o startup order entre servicios.

## Reglas del repo

### 1. Docker on-prem es el baseline MVP

- Diseña para entornos controlados y despliegue pragmatico.
- No introduzcas complejidad de orquestacion avanzada sin necesidad documental.
- Si una propuesta empuja hacia otro modelo operativo, requiere decision explicita.

### 2. El contenedor debe respetar el monorepo real

- Considera pnpm y la estructura del repo.
- Evita Dockerfiles que copien todo sin criterio.
- Separa dependencias, build y runtime cuando tenga sentido.

### 3. Seguridad por defecto

- Usuario no root cuando sea viable.
- Secretos fuera de la imagen y fuera del codigo versionado.
- Imagen base mantenible y con superficie razonable.
- Logs y configuracion sin PII ni credenciales embebidas.

## Patrones preferidos

### Dockerfile

- Multi-stage build cuando reduzca tamano o acople de build.
- Copia selectiva de manifests y archivos necesarios para aprovechar cache.
- Runtime con solo artefactos necesarios.
- Healthcheck cuando el servicio lo justifique.

### Compose y servicios

- Dependencias explicitas y orden de inicio razonable.
- Redes simples y entendibles.
- Volumenes solo donde el caso lo requiera.
- Configuracion separada por entorno sin duplicacion innecesaria.

### Seguridad y operacion

- Variables sensibles desde entorno seguro.
- Evitar instalar herramientas de debug en runtime productivo si no hacen falta.
- Limites o settings operativos cuando agreguen estabilidad real.
- Imagenes consistentes con el baseline del stack, no experimentales por defecto.

## Checklist de revision

- El Dockerfile esta alineado al servicio real.
- La imagen no contiene secretos ni archivos innecesarios.
- El runtime usa privilegios minimos razonables.
- El build aprovecha cache sin sacrificar claridad.
- La configuracion de red y dependencias es comprensible.
- El despliegue sigue siendo compatible con el baseline on-prem.
- No se introduce complejidad operativa injustificada.

## Heuristica para revisar codigo y configuracion

Busca y corrige estas señales:

- `COPY . .` demasiado temprano en el Dockerfile
- imagenes enormes con toolchains de build innecesarias en runtime
- procesos corriendo como root sin razon clara
- credenciales o tokens dentro del compose o Dockerfile
- Compose inflado con servicios que no pertenecen al baseline actual
- healthchecks ausentes en servicios que los necesitan

## Anti-patrones

Evita:

- diseñar como si el despliegue fuera Kubernetes cuando no lo es
- mezclar preocupaciones de build, test y runtime en una sola imagen sin criterio
- depender de scripts manuales opacos para que el contenedor arranque bien
- usar Docker para esconder problemas de configuracion del monorepo
- abrir puertos, mounts o privilegios por conveniencia sin justificarlo

## Escalacion

Usa [ESCALACION AL CTO] si:

- se propone un cambio de modelo operativo fuera del baseline Docker on-prem
- el endurecimiento de seguridad entra en conflicto con requisitos no documentados
- la solucion contenedorizada introduce riesgo estructural para despliegue o cumplimiento
