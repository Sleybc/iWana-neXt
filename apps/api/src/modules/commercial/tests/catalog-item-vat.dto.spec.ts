// Spec MOD14 2026-11-12 R1/R2: validación HTTP de los campos de IVA por ítem del catálogo.
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { VatConcept, VatTreatment } from '@iwana/shared';
import { createGlobalValidationPipe } from '../../../common/pipes/global-validation.pipe';
import { CreateServiceCatalogItemDto } from '../dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from '../dto/update-catalog-item.dto';

const pipe = createGlobalValidationPipe();
const meta = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});

describe('DTO del catálogo — IVA por ítem', () => {
  const base = {
    name: 'Servicio sintético',
    vatConcept: VatConcept.INDEPENDENT_SERVICE,
    chargeType: 'RECURRING',
  };

  it('acepta tratamiento y normaliza la base legal a código en mayúsculas', async () => {
    const dto = (await pipe.transform(
      { ...base, vatTreatment: VatTreatment.EXEMPT, vatLegalBasis: ' et_476_7 ' },
      meta(CreateServiceCatalogItemDto),
    )) as CreateServiceCatalogItemDto;

    expect(dto.vatTreatment).toBe(VatTreatment.EXEMPT);
    expect(dto.vatLegalBasis).toBe('ET_476_7');
  });

  it.each([
    [{ vatTreatment: 'ZERO' }],
    [{ vatLegalBasis: 'base legal con espacios' }],
    [{ vatLegalBasis: 'X' }],
    [{ installationVatTreatment: 'OTRO' }],
  ])('rechaza valores fuera del contrato %#', async (extra) => {
    await expect(
      pipe.transform({ ...base, ...extra }, meta(CreateServiceCatalogItemDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el PATCH admite el IVA de la instalación y conserva lo omitido', async () => {
    const dto = (await pipe.transform(
      { installationVatTreatment: VatTreatment.STANDARD },
      meta(UpdateCatalogItemDto),
    )) as UpdateCatalogItemDto;

    expect(dto.installationVatTreatment).toBe(VatTreatment.STANDARD);
    expect(dto.vatTreatment).toBeUndefined();
    expect(dto.installationVatLegalBasis).toBeUndefined();
  });
});
