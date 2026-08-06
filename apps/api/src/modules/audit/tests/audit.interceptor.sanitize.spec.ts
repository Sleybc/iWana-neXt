import { AuditInterceptor } from '../audit.interceptor';

/**
 * Garantía mecánica del saneado de auditoría.
 *
 * El defecto que motiva estos tests fue real y verificado contra la base: la
 * denylist literal del interceptor no incluía `temporaryPassword`, y solo
 * recorría el primer nivel. Como los endpoints de credenciales devuelven la
 * contraseña dentro de `{data:{…}}`, el secreto acabó en claro en
 * `platform_audit_logs` y en `<schema>.audit_logs`.
 *
 * Por eso la garantía no es la lista sino este barrido: ninguna clave que
 * empareje el patrón puede sobrevivir, a ninguna profundidad. Añadir un campo
 * secreto nuevo a cualquier respuesta no requiere acordarse de nada.
 */

type Sanitizer = (data: unknown) => Record<string, unknown> | null;

/** Acceso al método privado: es la unidad que se quiere probar. */
function makeSanitizer(): Sanitizer {
  const interceptor = Object.create(AuditInterceptor.prototype) as AuditInterceptor;

  return (data: unknown) =>
    (interceptor as unknown as { sanitizeResponseData: Sanitizer }).sanitizeResponseData(data);
}

/** Recorre el resultado y devuelve toda clave que el interceptor debería haber omitido. */
function findSurvivingSecrets(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSurvivingSecrets(item, `${path}[${index}]`));
  }

  const found: string[] = [];

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    const isNeverOmitted = AuditInterceptor.NEVER_OMITTED_KEYS.has(normalized);
    const isOmittedKey = AuditInterceptor.ALWAYS_OMITTED_KEYS.has(normalized);
    const isSecret = typeof item === 'string' && AuditInterceptor.SECRET_KEY_PATTERN.test(key);
    const isPiiSuffix = typeof item === 'string' && AuditInterceptor.matchesPiiSuffix(key);

    if (
      !isNeverOmitted &&
      (isSecret ||
        isPiiSuffix ||
        (isOmittedKey && (typeof item === 'string' || item instanceof Date)))
    ) {
      found.push(`${path}.${key}`);
    }

    found.push(...findSurvivingSecrets(item, `${path}.${key}`));
  }

  return found;
}

describe('AuditInterceptor — saneado de la respuesta', () => {
  const sanitize = makeSanitizer();

  describe('ningún secreto sobrevive', () => {
    it('elimina temporaryPassword anidado bajo data — el caso que se filtró de verdad', () => {
      const result = sanitize({
        data: {
          message: 'Acceso inicial vigente',
          adminEmail: 'admin@ejemplo.co',
          temporaryPassword: 'IwN!a9-deadbeefdeadbeef',
          expiresAt: '2026-07-20T00:00:00.000Z',
        },
      });

      expect(findSurvivingSecrets(result)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('IwN!a9-deadbeefdeadbeef');
    });

    it('elimina secretos dentro de arrays de objetos', () => {
      const result = sanitize({
        data: {
          items: [
            { id: '1', accessToken: 'tok-1' },
            { id: '2', nested: { refreshToken: 'tok-2' } },
          ],
        },
      });

      expect(findSurvivingSecrets(result)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('tok-1');
      expect(JSON.stringify(result)).not.toContain('tok-2');
    });

    it('elimina las variantes de nombre que cubre el patrón', () => {
      const result = sanitize({
        data: {
          passwordHash: 'x',
          mfaSecret: 'x',
          apiKey: 'x',
          api_key: 'x',
          privateKey: 'x',
          private_key: 'x',
          authorization: 'x',
          userCredential: 'x',
          passwordResetToken: 'x',
        },
      });

      expect(findSurvivingSecrets(result)).toEqual([]);
      expect(Object.keys((result as { data: object }).data)).toEqual([]);
    });

    it('elimina la semilla TOTP de POST /auth/mfa/setup', () => {
      // Contraejemplo real hallado en revisión de seguridad: `otpauthUri`
      // contiene la semilla completa (`otpauth://totp/…?secret=BASE32`) y no
      // emparejaba el patrón original, que tenía `authorization` pero no `otp`.
      // Un ADMIN de tenant habría podido leer el segundo factor de sus usuarios
      // en el audit log y generar sus códigos.
      const result = sanitize({
        data: {
          otpauthUri: 'otpauth://totp/user@ejemplo.co?secret=JBSWY3DPEHPK3PXP&issuer=iWana',
          qrCodeBase64: 'data:image/png;base64,iVBORw0KGgo=',
        },
      });

      expect(findSurvivingSecrets(result)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('JBSWY3DPEHPK3PXP');
      expect(JSON.stringify(result)).not.toContain('iVBORw0KGgo');
    });

    it('cubre las variantes de secreto de segundo factor y recuperación', () => {
      const result = sanitize({
        data: { totpSeed: 'x', recoveryCodes: 'x', backupCode: 'x', qrCode: 'x' },
      });

      expect(Object.keys((result as { data: object }).data)).toEqual([]);
    });

    it('omite email aunque no empareje el patrón (va cifrado con AES)', () => {
      const result = sanitize({ data: { id: '1', email: 'cifrado==' } });

      expect(findSurvivingSecrets(result)).toEqual([]);
    });

    it('SEC-05/SWEEP: omite PII de CRM e identidad (incl. PartyContact.value)', () => {
      const result = sanitize({
        data: {
          id: 'party-1',
          documentNumber: 'DOC-FICT-001',
          phone: '3000000000',
          mobile: '3000000001',
          whatsapp: '3000000002',
          nit: '900000000',
          nitDv: '1',
          fullName: 'Persona Ficticia',
          firstName: 'Persona',
          lastName: 'Ficticia',
          displayName: 'Persona F.',
          legalName: 'Persona Ficticia SAS',
          businessName: 'Comercio Ficticio',
          address: 'Calle ficticia 1',
          birthDate: '1990-01-01',
          contactPhone: '6010000000',
          altContactPhone: '6010000001',
          adminEmail: 'admin@ejemplo.invalid',
          contactEmail: 'contacto@ejemplo.invalid',
          emailPrimary: 'primario@ejemplo.invalid',
          emailSecondary: 'secundario@ejemplo.invalid',
          emailEncrypted: 'iv:tag:cipher',
          phoneEncrypted: 'iv:tag:cipher2',
          value: 'contacto@ejemplo.invalid',
          status: 'ACTIVE',
        },
      });

      expect(findSurvivingSecrets(result)).toEqual([]);
      const data = (result as { data: Record<string, unknown> }).data;
      expect(data['id']).toBe('party-1');
      expect(data['status']).toBe('ACTIVE');
      expect(data).not.toHaveProperty('value');
      expect(data).not.toHaveProperty('documentNumber');
      expect(data).not.toHaveProperty('adminEmail');
      expect(data).not.toHaveProperty('emailEncrypted');
      expect(data).not.toHaveProperty('businessName');
      expect(JSON.stringify(result)).not.toContain('DOC-FICT-001');
      expect(JSON.stringify(result)).not.toContain('contacto@ejemplo.invalid');
      expect(JSON.stringify(result)).not.toContain('Comercio Ficticio');
    });
  });

  describe('hueco SEC-05: PII que el patrón antiguo dejaba pasar', () => {
    // Asimetría real hallada en `tenant_iwana.audit_logs`: en el MISMO DTO,
    // `purchasingContactEmail` se omitía y `purchasingContactPhone` se
    // guardaba en claro, con forma de teléfono.
    it('omite phone y email del mismo DTO, sin asimetría', () => {
      const result = sanitize({
        data: {
          id: 'sup-1',
          purchasingContactEmail: 'compras@ejemplo.invalid',
          purchasingContactPhone: '6010000000',
          purchasingContactName: 'Persona Ficticia',
        },
      });

      const data = (result as { data: Record<string, unknown> }).data;
      expect(data).toEqual({ id: 'sup-1' });
    });

    it.each([
      'primaryPhone',
      'siteContactPhone',
      'installationAddress',
      'serviceAddress',
      'fiscalAddress',
      'supplierNit',
      'holderDocumentNumber',
      'altContactName',
      'siteContactName',
      'technicianName',
      'uploadedByName',
      'directedToName',
      'personName',
      'customerDisplayName',
      'expedienteFullName',
      'fiscalName',
      'suggestedPartyName',
      'latitude',
      'longitude',
      'description',
      'title',
      'sector',
      'municipality',
      'sourceDetail',
    ])('omite %s', (key) => {
      const result = sanitize({ data: { [key]: 'valor-ficticio' } });

      expect(Object.keys((result as { data: object }).data)).toEqual([]);
    });

    it('omite latitude/longitude numéricos (no solo string)', () => {
      const result = sanitize({ data: { latitude: 4.711, longitude: -74.072, id: '1' } });
      expect((result as { data: Record<string, unknown> }).data).toEqual({ id: '1' });
    });
  });

  describe('fidelidad del registro', () => {
    // Estas claves son el motivo de que el sufijo `name$` a secas se descartara:
    // un barrido ciego las habría vaciado. `schemaName` en particular es lo que
    // permite trazar qué tenant se aprovisionó.
    it.each([
      ['schemaName', 'tenant_demo'],
      ['categoryName', 'Routers'],
      ['fileName', 'contrato.pdf'],
      ['productName', 'Plan 300 megas'],
      ['taxName', 'IVA 19'],
      ['queueName', 'tenant-provisioning'],
      ['typeName', 'stock_count_status'],
      ['columnName', 'mfa_secret'],
      ['siteName', 'Nodo Norte'],
      ['entityName', 'ExpedienteRecord'],
    ])('conserva %s: es dato de negocio, no PII', (key, value) => {
      const result = sanitize({ data: { [key]: value } });

      expect((result as { data: Record<string, unknown> }).data[key]).toBe(value);
    });

    it('conserva unit y sus derivados: "unit" termina en "nit" pero no es un NIT', () => {
      const result = sanitize({
        data: { unit: 'METRO', measurementUnit: 'KM', businessUnit: 'Norte' },
      });

      expect((result as { data: unknown }).data).toEqual({
        unit: 'METRO',
        measurementUnit: 'KM',
        businessUnit: 'Norte',
      });
    });

    it('conserva las direcciones técnicas: identifican una máquina, no un domicilio', () => {
      const result = sanitize({
        data: { ipAddress: '10.0.0.1', macAddress: 'AA:BB:CC:DD:EE:FF', remoteAddress: '10.0.0.2' },
      });

      expect((result as { data: unknown }).data).toEqual({
        ipAddress: '10.0.0.1',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        remoteAddress: '10.0.0.2',
      });
    });

    it('conserva actorName: es el sujeto del asiento y el timeline lo lee de vuelta', () => {
      const result = sanitize({ data: { actorName: 'Operador Ficticio', userId: 'u-1' } });

      expect((result as { data: Record<string, unknown> }).data).toEqual({
        actorName: 'Operador Ficticio',
        userId: 'u-1',
      });
    });

    it('conserva piiaAccess: su valor es el nombre del campo, no el dato', () => {
      const result = sanitize({
        data: { piiaAccess: 'documentNumber', source: 'findById' },
      });

      expect((result as { data: Record<string, unknown> }).data).toEqual({
        piiaAccess: 'documentNumber',
        source: 'findById',
      });
    });

    it('conserva passwordResetRequired: es booleano, no un secreto', () => {
      const result = sanitize({
        data: { passwordResetRequired: true, passwordResetExpiresAt: new Date(0) },
      });

      const data = (result as { data: Record<string, unknown> }).data;
      expect(data['passwordResetRequired']).toBe(true);
      expect(data['passwordResetExpiresAt']).toBeInstanceOf(Date);
    });

    it('conserva las fechas como Date y no las vacía a {}', () => {
      const createdAt = new Date('2026-07-19T12:00:00.000Z');
      const result = sanitize({ data: { id: '1', createdAt } });

      expect((result as { data: Record<string, unknown> }).data['createdAt']).toEqual(createdAt);
    });

    it('conserva la forma de arrays anidados', () => {
      const result = sanitize({ data: { items: [{ id: '1' }, { id: '2' }] } });

      expect((result as { data: { items: unknown[] } }).data.items).toEqual([
        { id: '1' },
        { id: '2' },
      ]);
    });

    it('no altera los valores no sensibles', () => {
      const result = sanitize({ data: { id: 'abc', total: 42, activo: false, nulo: null } });

      expect((result as { data: unknown }).data).toEqual({
        id: 'abc',
        total: 42,
        activo: false,
        nulo: null,
      });
    });
  });

  describe('robustez', () => {
    it('corta la recursión en estructuras muy profundas sin desbordar', () => {
      let deep: Record<string, unknown> = { secretToken: 'fondo' };
      for (let i = 0; i < 40; i += 1) {
        deep = { nivel: deep };
      }

      const result = sanitize({ data: deep });

      expect(JSON.stringify(result)).not.toContain('fondo');
      expect(JSON.stringify(result)).toContain('PROFUNDIDAD_EXCEDIDA');
    });

    it('tolera referencias circulares', () => {
      const circular: Record<string, unknown> = { id: '1' };
      circular['self'] = circular;

      expect(() => sanitize({ data: circular })).not.toThrow();
    });

    it('mantiene el comportamiento previo: null si no es objeto plano', () => {
      expect(sanitize(null)).toBeNull();
      expect(sanitize('texto')).toBeNull();
      expect(sanitize([{ id: '1' }])).toBeNull();
    });
  });
});
