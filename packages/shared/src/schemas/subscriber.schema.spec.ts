import { CustomerSegment } from '../enums/customer-segment.enum';
import { ConsentChannel } from '../enums/crm/consent-channel.enum';
import { DocumentType } from '../enums/document-type.enum';
import { PersonType } from '../enums/person-type.enum';
import { PartyRoleType } from '../enums/parties/party-role-type.enum';
import { SubscriberStatus } from '../enums/subscriber-status.enum';
import { RUT_RESPONSIBILITIES, VatResponsibility } from '../enums/vat-responsibility.enum';
import {
  CreateSubscriberSchema,
  legalRepresentativeSchema,
  nitVerificationDigitSchema,
  rutResponsibilitiesSchema,
  SubscriberListFiltersSchema,
  SubscriberPrimaryServiceSchema,
  SubscriberQueueCountsSchema,
  SearchSubscribersSchema,
  SUBSCRIBER_FISCAL_DATA_INCOMPLETE,
  SUBSCRIBER_FISCAL_MISSING_FIELDS,
  type SubscriberDetail,
  TransitionSubscriberStatusSchema,
  UpdateSubscriberSchema,
} from './subscriber.schema';

const naturalSubscriber = {
  personType: PersonType.NATURAL,
  customerSegment: CustomerSegment.RESIDENTIAL,
  documentType: DocumentType.CC,
  documentNumber: 'SYNTHETIC-NATURAL-001',
  firstName: 'Nombre sintético',
  lastName: 'Apellido sintético',
  stratum: 2,
  address: 'Dirección sintética',
  email: 'natural@example.invalid',
  vatResponsibility: VatResponsibility.NO_RESPONSABLE,
  rutResponsibilities: ['O-13'],
};

const juridicalSubscriber = {
  personType: PersonType.JURIDICA,
  customerSegment: CustomerSegment.CORPORATE,
  nit: '900000001',
  nitVerificationDigit: '9',
  businessName: 'Empresa sintética',
  address: 'Dirección sintética',
  email: 'empresa@example.invalid',
  vatResponsibility: VatResponsibility.RESPONSABLE,
  rutResponsibilities: ['O-15', 'O-47'],
  legalRepresentative: {
    fullName: 'Representante sintético',
    documentType: DocumentType.CC,
    documentNumber: 'DOC-SYNTHETIC-001',
  },
};

describe('subscriber shared schemas · MOD05 B1', () => {
  it('expone el contrato del servicio principal y permite null cuando no hay contratos elegibles', () => {
    expect(
      SubscriberPrimaryServiceSchema.parse({
        contractId: '00000000-0000-4000-8000-000000000001',
        planName: 'Plan sintético',
        status: 'ACTIVE',
        city: 'Ciudad sintética',
        alias: 'Servicio sintético',
      }),
    ).toEqual({
      contractId: '00000000-0000-4000-8000-000000000001',
      planName: 'Plan sintético',
      status: 'ACTIVE',
      city: 'Ciudad sintética',
      alias: 'Servicio sintético',
    });
    expect(SubscriberPrimaryServiceSchema.nullable().parse(null)).toBeNull();
    expect(
      SubscriberPrimaryServiceSchema.safeParse({
        contractId: 'invalid',
        planName: null,
        status: 'TERMINATED',
        city: null,
        alias: null,
      }).success,
    ).toBe(false);
  });

  it('valida conteos de cola enteros no negativos', () => {
    expect(
      SubscriberQueueCountsSchema.parse({
        active: 1,
        suspended: 2,
        contactPending: 3,
        fiscalIncomplete: 4,
        withoutLiveServices: 5,
      }),
    ).toEqual({
      active: 1,
      suspended: 2,
      contactPending: 3,
      fiscalIncomplete: 4,
      withoutLiveServices: 5,
    });
    expect(
      SubscriberQueueCountsSchema.safeParse({
        active: -1,
        suspended: 2,
        contactPending: 3,
        fiscalIncomplete: 4,
        withoutLiveServices: 5,
      }).success,
    ).toBe(false);
  });

  it('tipa los tres filtros de cola como booleanos opcionales', () => {
    expect(
      SubscriberListFiltersSchema.parse({
        contactPending: true,
        fiscalIncomplete: false,
        withoutLiveServices: true,
      }),
    ).toEqual({
      contactPending: true,
      fiscalIncomplete: false,
      withoutLiveServices: true,
    });
    expect(SubscriberListFiltersSchema.safeParse({ contactPending: 'true' }).success).toBe(false);
    expect(SubscriberListFiltersSchema.parse({})).toEqual({});
  });

  it('fija el contrato de completitud fiscal que consume API y portal', () => {
    expect(SUBSCRIBER_FISCAL_DATA_INCOMPLETE).toBe('SUBSCRIBER_FISCAL_DATA_INCOMPLETE');
    expect(SUBSCRIBER_FISCAL_MISSING_FIELDS).toEqual([
      'VAT_RESPONSIBILITY',
      'RUT_RESPONSIBILITIES',
      'NIT_VERIFICATION_DIGIT',
      'LEGAL_REPRESENTATIVE',
    ]);
  });

  it('publishes the frozen IVA, RUT and Party role values', () => {
    expect(VatResponsibility).toEqual({
      RESPONSABLE: 'RESPONSABLE',
      NO_RESPONSABLE: 'NO_RESPONSABLE',
    });
    expect(RUT_RESPONSIBILITIES).toEqual(['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN']);
    expect(PartyRoleType.LEGAL_REPRESENTATIVE).toBe('LEGAL_REPRESENTATIVE');
  });

  it('requires and retains IVA responsibility and the non-empty RUT catalog for a natural person', () => {
    const result = CreateSubscriberSchema.safeParse(naturalSubscriber);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: ['O-13'],
    });
  });

  it('requires IVA responsibility and RUT responsibilities for both person types', () => {
    for (const subscriber of [naturalSubscriber, juridicalSubscriber]) {
      expect(
        CreateSubscriberSchema.safeParse({
          ...subscriber,
          vatResponsibility: undefined,
          rutResponsibilities: undefined,
        }).success,
      ).toBe(false);
      expect(
        CreateSubscriberSchema.safeParse({ ...subscriber, rutResponsibilities: [] }).success,
      ).toBe(false);
      expect(
        CreateSubscriberSchema.safeParse({ ...subscriber, rutResponsibilities: ['UNLISTED'] })
          .success,
      ).toBe(false);
    }
  });

  it('requires a one-digit verification digit and a natural-person representative for a company', () => {
    expect(CreateSubscriberSchema.safeParse(juridicalSubscriber).success).toBe(true);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        nitVerificationDigit: undefined,
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        nitVerificationDigit: '12',
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        legalRepresentative: undefined,
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        legalRepresentative: {
          ...juridicalSubscriber.legalRepresentative,
          documentType: 'INVALID',
        },
      }).success,
    ).toBe(false);
  });

  it('accepts the new optional fields on updates and does not expose the legacy representative UUID', () => {
    const result = UpdateSubscriberSchema.safeParse({
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['R-99-PN'],
      legalRepresentative: juridicalSubscriber.legalRepresentative,
      legalRepresentativeId: '00000000-0000-4000-8000-000000000001',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['R-99-PN'],
      legalRepresentative: juridicalSubscriber.legalRepresentative,
    });
    expect(result.data).not.toHaveProperty('legalRepresentativeId');
  });
});

const SYNTHETIC_LEGAL_TEXT_ID = '00000000-0000-4000-8000-000000000001';

const syntheticAuthorization = {
  purpose: 'TRATAMIENTO_CONTRACTUAL',
  granted: true,
  legalTextId: SYNTHETIC_LEGAL_TEXT_ID,
};

describe('subscriber shared schemas · MOD05 deuda · alta, autorizaciones y edición por sección', () => {
  it('exige al menos un canal de contacto en el alta natural y jurídica', () => {
    const naturalSinContacto = { ...naturalSubscriber, email: undefined };
    const naturalResult = CreateSubscriberSchema.safeParse(naturalSinContacto);
    expect(naturalResult.success).toBe(false);
    if (!naturalResult.success) {
      expect(naturalResult.error.issues.map((issue) => issue.message)).toContain(
        'Registra al menos un teléfono o un correo.',
      );
    }
    expect(
      CreateSubscriberSchema.safeParse({ ...naturalSinContacto, phone: '3000000009' }).success,
    ).toBe(true);

    const juridicaSinContacto = { ...juridicalSubscriber, email: undefined };
    expect(CreateSubscriberSchema.safeParse(juridicaSinContacto).success).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({ ...juridicaSinContacto, phone: '3000000009' }).success,
    ).toBe(true);
  });

  it('exige el medio de autorización cuando llegan autorizaciones y las conserva', () => {
    const sinCanal = CreateSubscriberSchema.safeParse({
      ...naturalSubscriber,
      authorizations: [syntheticAuthorization],
    });
    expect(sinCanal.success).toBe(false);
    if (!sinCanal.success) {
      expect(sinCanal.error.issues.map((issue) => issue.message)).toContain(
        'Debe indicar el medio por el que se obtuvo la autorización.',
      );
    }

    const conCanal = CreateSubscriberSchema.safeParse({
      ...naturalSubscriber,
      authorizations: [syntheticAuthorization],
      authorizationChannel: ConsentChannel.TELEFONO,
    });
    expect(conCanal.success).toBe(true);
    if (!conCanal.success) return;
    expect(conCanal.data.authorizations).toEqual([syntheticAuthorization]);

    expect(
      CreateSubscriberSchema.safeParse({ ...naturalSubscriber, authorizations: [] }).success,
    ).toBe(true);
  });

  it('rechaza autorizaciones con propósito, texto legal o claves fuera del contrato', () => {
    const base = {
      ...naturalSubscriber,
      authorizationChannel: ConsentChannel.TELEFONO,
    };
    expect(
      CreateSubscriberSchema.safeParse({
        ...base,
        authorizations: [{ ...syntheticAuthorization, purpose: 'PROPOSITO_INVALIDO' }],
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...base,
        authorizations: [{ ...syntheticAuthorization, legalTextId: 'no-uuid' }],
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...base,
        authorizations: [{ ...syntheticAuthorization, extra: 'no permitido' }],
      }).success,
    ).toBe(false);
  });

  it('permite editar por secciones con el contrato compartido', () => {
    // Sección Identificación (persona jurídica)
    expect(
      UpdateSubscriberSchema.safeParse({
        personType: PersonType.JURIDICA,
        nit: '900000001',
        nitVerificationDigit: '9',
        businessName: 'Empresa sintética',
        legalRepresentative: juridicalSubscriber.legalRepresentative,
      }).success,
    ).toBe(true);

    // Sección Datos fiscales
    expect(
      UpdateSubscriberSchema.safeParse({
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
      }).success,
    ).toBe(true);

    // Sección Contacto y Dirección, con los nulos permitidos del contrato
    expect(
      UpdateSubscriberSchema.safeParse({
        email: 'nuevo-contacto@example.invalid',
        phone: '3000000010',
        address: 'Dirección sintética 2',
        city: 'Ciudad sintética',
        stratum: null,
        expedienteId: null,
        manualOverrideReason: null,
      }).success,
    ).toBe(true);
  });

  it('rechaza RUT vacío o repetido y DV no numérico también en la edición', () => {
    const vacio = rutResponsibilitiesSchema.safeParse([]);
    expect(vacio.success).toBe(false);
    if (!vacio.success) {
      expect(vacio.error.issues[0]?.message).toBe(
        'Selecciona al menos una responsabilidad del RUT',
      );
    }
    const repetido = rutResponsibilitiesSchema.safeParse(['O-13', 'O-13']);
    expect(repetido.success).toBe(false);
    if (!repetido.success) {
      expect(repetido.error.issues[0]?.message).toBe('No repitas responsabilidades del RUT');
    }

    expect(nitVerificationDigitSchema.safeParse('8').success).toBe(true);
    expect(nitVerificationDigitSchema.safeParse('').success).toBe(false);
    expect(nitVerificationDigitSchema.safeParse('x').success).toBe(false);
    expect(nitVerificationDigitSchema.safeParse('12').success).toBe(false);

    expect(UpdateSubscriberSchema.safeParse({ rutResponsibilities: [] }).success).toBe(false);
    expect(
      UpdateSubscriberSchema.safeParse({ rutResponsibilities: ['O-47', 'O-47'] }).success,
    ).toBe(false);
    expect(UpdateSubscriberSchema.safeParse({ nitVerificationDigit: 'x' }).success).toBe(false);
  });

  it('valida el representante legal con nombre, tipo y documento dentro del contrato', () => {
    expect(
      legalRepresentativeSchema.safeParse(juridicalSubscriber.legalRepresentative).success,
    ).toBe(true);
    expect(
      legalRepresentativeSchema.safeParse({
        ...juridicalSubscriber.legalRepresentative,
        fullName: '',
      }).success,
    ).toBe(false);
    expect(
      legalRepresentativeSchema.safeParse({
        ...juridicalSubscriber.legalRepresentative,
        documentNumber: '12',
      }).success,
    ).toBe(false);
    expect(
      legalRepresentativeSchema.safeParse({
        ...juridicalSubscriber.legalRepresentative,
        documentType: 'TIPO_INEXISTENTE',
      }).success,
    ).toBe(false);
    expect(
      UpdateSubscriberSchema.safeParse({
        legalRepresentative: {
          fullName: '',
          documentType: DocumentType.CC,
          documentNumber: 'DOC-SYNTHETIC-002',
        },
      }).success,
    ).toBe(false);
  });

  it('fija el contrato de búsqueda: sin criterios o con criterios mezclados falla', () => {
    const sinCriterios = SearchSubscribersSchema.safeParse({});
    expect(sinCriterios.success).toBe(false);
    if (!sinCriterios.success) {
      expect(sinCriterios.error.issues.map((issue) => issue.message)).toContain(
        'Debe proporcionar al menos un criterio de búsqueda',
      );
    }

    const mezclado = SearchSubscribersSchema.safeParse({
      documentNumber: 'SYNTHETIC-1',
      search: 'sintético',
    });
    expect(mezclado.success).toBe(false);
    if (!mezclado.success) {
      expect(mezclado.error.issues.map((issue) => issue.message)).toContain(
        'La búsqueda libre no se combina con criterios exactos',
      );
    }

    expect(SearchSubscribersSchema.safeParse({ documentNumber: 'SYNTHETIC-1' }).success).toBe(true);
    expect(SearchSubscribersSchema.safeParse({ nit: 'SYNTHETIC-1' }).success).toBe(true);
    expect(SearchSubscribersSchema.safeParse({ email: 'sintetico@example.invalid' }).success).toBe(
      true,
    );
    expect(SearchSubscribersSchema.safeParse({ phone: 'SYNTHETIC-1' }).success).toBe(true);
    expect(SearchSubscribersSchema.safeParse({ search: 'sintético' }).success).toBe(true);
  });

  it('fija la transición de estado del catálogo compartido', () => {
    expect(
      TransitionSubscriberStatusSchema.safeParse({ targetStatus: SubscriberStatus.ACTIVE }).success,
    ).toBe(true);
    expect(
      TransitionSubscriberStatusSchema.safeParse({
        targetStatus: SubscriberStatus.SUSPENDED,
        reason: 'Motivo sintético',
      }).success,
    ).toBe(true);
    expect(TransitionSubscriberStatusSchema.safeParse({ targetStatus: 'NO_EXISTE' }).success).toBe(
      false,
    );
    expect(
      TransitionSubscriberStatusSchema.safeParse({
        targetStatus: SubscriberStatus.CANCELLED,
        reasonCode: 'SOLICITUD_TITULAR',
      }).success,
    ).toBe(true);
    expect(
      TransitionSubscriberStatusSchema.safeParse({
        targetStatus: SubscriberStatus.CANCELLED,
        reason: 'texto libre que no es un código',
      }).success,
    ).toBe(false);
    expect(
      TransitionSubscriberStatusSchema.safeParse({
        targetStatus: SubscriberStatus.CANCELLED,
        reasonCode: 'DESCARTE_EXPEDIENTE',
      }).success,
    ).toBe(false);
  });

  it('fija el contrato de completitud fiscal consumido por alta, activación y contratación', () => {
    const incompleto = CreateSubscriberSchema.safeParse({
      ...naturalSubscriber,
      vatResponsibility: undefined,
    });
    expect(incompleto.success).toBe(false);

    const detalleConCompletitud: Pick<SubscriberDetail, 'fiscalCompleteness'> = {
      fiscalCompleteness: {
        complete: false,
        missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
      },
    };
    expect(detalleConCompletitud.fiscalCompleteness).toEqual({
      complete: false,
      missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
    });

    expect(SUBSCRIBER_FISCAL_DATA_INCOMPLETE).toBe('SUBSCRIBER_FISCAL_DATA_INCOMPLETE');
    for (const field of SUBSCRIBER_FISCAL_MISSING_FIELDS) {
      expect([
        'VAT_RESPONSIBILITY',
        'RUT_RESPONSIBILITIES',
        'NIT_VERIFICATION_DIGIT',
        'LEGAL_REPRESENTATIVE',
      ]).toContain(field);
    }
  });
});
