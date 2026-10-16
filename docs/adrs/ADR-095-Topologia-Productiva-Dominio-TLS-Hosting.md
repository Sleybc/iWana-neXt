# ADR-095: Topología productiva: dominio, TLS, DNS, ventana y RPO/RTO (activación en la beta mínima)

**Versión:** 1.0
**Estado:** Aprobado
**Activación:** diferida hasta la beta mínima (§Activación)
**Aprobado por:** CTO, 2026-10-16. Aprueba las decisiones D1 y D3 a D6 y deja **abierta** la D2 (hosting). Todo se ejecuta cuando el sistema entre en **fase de beta mínima**; hoy el foco es terminar el código.
**Fecha:** 2026-10-16
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Resuelve:** las seis decisiones de F0.2 del [plan G7 de plataforma](../prompts/PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md), prioridad P2 de [ADR-078](ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) §D3
**Relacionado:** [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) (gates), [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) (claves), [ADR-094](ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (privacidad)

## Contexto

G7 exige dominio productivo, TLS, rollback por componente y restores verificados (protocolo §3). Hasta hoy ninguna de las seis decisiones de infraestructura estaba tomada.

Es el primer ADR del repositorio que decide dominio, TLS, DNS y RPO/RTO. ADR-070 (superado) fijó que esta clase de decisión vive en un ADR.

## Decisiones

| # | Decisión | Valor aprobado |
| --- | --- | --- |
| **D1** | FQDN | **`app.iwana.co`** (web de plataforma y API) y **`portal.iwana.co`** (portal de las empresas ISP). Sin subdominio por tenant: el tenant se resuelve por JWT y `X-Tenant-Slug` |
| **D2** | Hosting | **Abierta** (ver §D2) |
| **D3** | CA y ACME | Let's Encrypt con **HTTP-01** (certbot en modo webroot) y un certificado para los dos nombres. Registro CAA solo para `letsencrypt.org`. HSTS a un año solo tras el primer handshake verificado |
| **D4** | DNS | La zona de `iwana.co` sigue bajo control de la empresa, en su cuenta actual: MFA, dos administradores, bloqueo de transferencia en el registrador, DNSSEC si el proveedor lo ofrece, el CAA de D3 y TTL de 300 s durante el corte. HTTP-01 no requiere entregar credenciales del DNS |
| **D5** | Ventana | Releases normales los martes o miércoles, de 22:00 a 01:00 (America/Bogota), con escrituras congeladas. Emergencias con aprobación del CTO |
| **D6** | RPO/RTO | **En la salida:** RPO ≤ 1 h en PostgreSQL (backup lógico cada hora, más uno antes de cada release); RPO ≤ 24 h en MinIO; RTO ≤ 4 h para la plataforma y ≤ 1 h por tenant. **Antes de 90 días:** archivado continuo de WAL, para un RPO ≤ 15 min. Las cifras se confirman con los ensayos de F3 del plan de plataforma |

### D2. Hosting: opciones abiertas y criterios

| Opción | A favor | En contra o a verificar |
| --- | --- | --- |
| **OCI, región Bogotá** (recomendada por AI-EM-ARCH) | Única región de hiperescalador en Colombia (desde 2023, en un datacenter de Claro): los datos no salen del país. Encaja con Compose en un solo host | Costo por cotizar |
| **Servidor propio (local)** | Datos en Colombia y control total | Exige IP pública fija con los puertos 80 y 443, UPS, enlace redundante, seguridad física, monitoreo y **backups fuera del sitio**. El RTO de D6 depende de quien opere el hardware. El único host previo (`10.0.0.2`, IP privada) no cumplía nada de eso |
| **Hostinger (hosting que la empresa ya tiene)** | Cuenta existente | Solo sirve un **VPS con Docker**, no el hosting compartido. **Verificar en qué país está el datacenter:** fuera de Colombia hay transferencia internacional (Ley 1581 art. 26) y hace falta un contrato de transmisión. Revisar también el SLA y los backups |

**Criterios mínimos para cualquier opción:**
- Docker Compose;
- IP pública con los puertos 80 y 443;
- 8 vCPU y 32 GB orientativos (mínimo 4 y 16);
- disco persistente;
- SSH solo por bastión o VPN;
- backups cifrados fuera del host;
- un dictamen jurídico sobre la ubicación de los datos.

**Momento de decidir:** al planificar la beta mínima, antes de la Fase 2 del plan G7 de plataforma.

## Consecuencias

- **Mientras se construye:** no se emiten certificados, no se crean registros DNS ni se cambia `nginx.prod.conf`. Los placeholders `REPLACE_ME_PRODUCTION_DOMAIN` y `approval-required` siguen intactos, y el gate R3.5 de CI sigue vigente.
- **Lo que sí queda fijado para el código:** los dos FQDN de D1. Cualquier configuración nueva los usa como referencia documental, nunca como valor activo, hasta la activación.
- **G7 de todos los módulos:** queda **diferido hasta la beta mínima**. Las fases con G6.5 en GO (MOD05, IVA, D-PDF, privacidad Fase 1a y E-3) esperan esa ventana. La condición M2d del [informe de preparación](../informes/INFORME-MOD05-PRIVACY-G7-PREPARACION-v1.0.md) se ejecuta al reactivar G7.
- **Ley 2573 (vigente desde el 19-11-2026):** como iWana no estará en producción para esa fecha, **la obligación la atiende el ISP en su sistema actual** con un procedimiento manual: suspensión inmediata del producto suplantado, constancia de radicación y copia de documentos. La migración a iWana ocurre en la beta. *Requiere verificación con fuente oficial y el dictamen jurídico de ADR-094 §7.3.*

## Activación

Se reactiva cuando el CTO declare el inicio de la beta mínima. Ese día, AI-EM-ARCH:
1. pide la decisión D2;
2. emite las fases F2 a F5 del plan G7 de plataforma con los valores de este ADR;
3. relanza M2d.
