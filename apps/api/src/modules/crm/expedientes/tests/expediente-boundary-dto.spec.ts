import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import {
  ConsentStatus,
  ConsentType,
  ConsentChannel,
  ContactChannel,
  ContactResult,
  Feasibility,
} from '@iwana/shared';
import {
  CreateConsentDto,
  RevokeConsentDto,
  CONSENT_LEGAL_VERSION,
} from '../dto/create-consent.dto';
import { CreateContactAttemptDto } from '../dto/create-contact-attempt.dto';
import { CreateCoverageCheckDto } from '../dto/create-coverage-check.dto';
import { CreateExpedienteDto } from '../dto/create-expediente.dto';
import { TransitionStatusDto } from '../dto/transition-status.dto';
import { UpdateSectionBodyDto } from '../dto/update-section.dto';

describe('Expedientes boundary DTOs', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  it('preserva fullName y source antes de la validacion Zod del create', async () => {
    await expect(
      validationPipe.transform(
        { fullName: 'Empresa Demo SAS', source: 'Manual' },
        buildBodyMetadata(CreateExpedienteDto),
      ),
    ).resolves.toMatchObject({
      fullName: 'Empresa Demo SAS',
      source: 'Manual',
    });
  });

  it('preserva data antes de la validacion Zod del patch de seccion', async () => {
    await expect(
      validationPipe.transform(
        { data: { phonePrimary: '3001112233' } },
        buildBodyMetadata(UpdateSectionBodyDto),
      ),
    ).resolves.toMatchObject({
      data: { phonePrimary: '3001112233' },
    });
  });

  it('preserva targetStatus y reason antes de la validacion Zod de transicion', async () => {
    await expect(
      validationPipe.transform(
        { targetStatus: 'PRECALIFICADO', reason: 'Datos completos' },
        buildBodyMetadata(TransitionStatusDto),
      ),
    ).resolves.toMatchObject({
      targetStatus: 'PRECALIFICADO',
      reason: 'Datos completos',
    });
  });

  it('preserva channel, result y durationMinutes del intento de contacto', async () => {
    await expect(
      validationPipe.transform(
        {
          channel: ContactChannel.TELEFONO,
          result: ContactResult.EXITOSO,
          durationMinutes: 8,
          notes: 'Seguimiento inicial',
        },
        buildBodyMetadata(CreateContactAttemptDto),
      ),
    ).resolves.toMatchObject({
      channel: ContactChannel.TELEFONO,
      result: ContactResult.EXITOSO,
      durationMinutes: 8,
      notes: 'Seguimiento inicial',
    });
  });

  it('preserva consentimiento y motivo de revocacion antes de la validacion Zod', async () => {
    await expect(
      validationPipe.transform(
        {
          consentType: ConsentType.TRATAMIENTO_DATOS,
          status: ConsentStatus.ACEPTADO,
          channel: ConsentChannel.PRESENCIAL,
          legalTextVersion: CONSENT_LEGAL_VERSION,
          evidenceRef: 'consent://evidence/1',
        },
        buildBodyMetadata(CreateConsentDto),
      ),
    ).resolves.toMatchObject({
      consentType: ConsentType.TRATAMIENTO_DATOS,
      status: ConsentStatus.ACEPTADO,
      channel: ConsentChannel.PRESENCIAL,
      legalTextVersion: CONSENT_LEGAL_VERSION,
      evidenceRef: 'consent://evidence/1',
    });

    await expect(
      validationPipe.transform(
        { reason: 'Solicitud del titular' },
        buildBodyMetadata(RevokeConsentDto),
      ),
    ).resolves.toMatchObject({ reason: 'Solicitud del titular' });
  });

  it('preserva payload de cobertura con coordenadas y snapshot operativo', async () => {
    await expect(
      validationPipe.transform(
        {
          latitude: 4.60971,
          longitude: -74.08175,
          addressUsed: 'Calle 100 # 8-55',
          result: Feasibility.VIABLE,
          technologyAvailable: 'FTTH',
          distanceM: 125,
          snapshotJson: { nodeId: 'NODO-100', ports: 4 },
        },
        buildBodyMetadata(CreateCoverageCheckDto),
      ),
    ).resolves.toMatchObject({
      latitude: 4.60971,
      longitude: -74.08175,
      addressUsed: 'Calle 100 # 8-55',
      result: Feasibility.VIABLE,
      technologyAvailable: 'FTTH',
      distanceM: 125,
      snapshotJson: { nodeId: 'NODO-100', ports: 4 },
    });
  });

  it('preserva campos de identificacion persona natural a traves del validation pipe', async () => {
    await expect(
      validationPipe.transform(
        {
          data: {
            personType: 'PERSONA_NATURAL',
            firstName: 'Laura',
            lastName: 'Perez',
            documentType: 'CC',
            documentNumber: '1012345678',
          },
        },
        buildBodyMetadata(UpdateSectionBodyDto),
      ),
    ).resolves.toMatchObject({
      data: {
        personType: 'PERSONA_NATURAL',
        firstName: 'Laura',
        lastName: 'Perez',
        documentType: 'CC',
        documentNumber: '1012345678',
      },
    });
  });

  it('preserva campos de identificacion persona juridica a traves del validation pipe', async () => {
    await expect(
      validationPipe.transform(
        {
          data: {
            personType: 'PERSONA_JURIDICA',
            companyName: 'Empresa Demo SAS',
            primaryContactName: 'Laura Perez',
            primaryContactRole: 'Representante legal',
            documentType: 'NIT',
            documentNumber: '900123456',
          },
        },
        buildBodyMetadata(UpdateSectionBodyDto),
      ),
    ).resolves.toMatchObject({
      data: {
        personType: 'PERSONA_JURIDICA',
        companyName: 'Empresa Demo SAS',
        primaryContactName: 'Laura Perez',
        primaryContactRole: 'Representante legal',
        documentType: 'NIT',
        documentNumber: '900123456',
      },
    });
  });
});

function buildBodyMetadata(metatype: ArgumentMetadata['metatype']): ArgumentMetadata {
  return {
    type: 'body',
    metatype,
    data: '',
  };
}
