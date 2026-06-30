import { BadRequestException, Injectable } from '@nestjs/common';
import { PersonType, VatTreatment, TaxRegime, CustomerSegment } from '@iwana/shared';
import { Subscriber } from './entities/subscriber.entity';

/**
 * Motor IVA colombiano para servicios de Internet.
 *
 * Regla (Ley 1819/2016, Estatuto Tributario Arts. 476-477):
 * - NATURAL + estrato 1-2 → EXEMPT (gravado tarifa 0%, se declara)
 * - NATURAL + estrato 3   → EXCLUDED (fuera del régimen, no se declara)
 * - NATURAL + estrato 4-6 → STANDARD (IVA 19%)
 * - JURIDICA (cualquier segmento) → STANDARD (IVA 19%)
 *
 * customerSegment NO afecta el cálculo de IVA.
 * Las entidades gubernamentales (GOVERNMENT) pagan IVA al 19%.
 */
@Injectable()
export class VatTreatmentService {
  /**
   * Calcula el tratamiento IVA según tipo de persona y estrato.
   * customerSegment se incluye para validación futura pero NO afecta el resultado.
   */
  resolve(
    personType: PersonType,
    stratum: number | null,
    _segment?: CustomerSegment,
  ): VatTreatment {
    // Persona jurídica (cualquier segmento incluyendo GOVERNMENT): siempre IVA 19%
    if (personType === PersonType.JURIDICA) {
      return VatTreatment.STANDARD;
    }

    // Persona natural: depende del estrato
    if (stratum === null || stratum === undefined) {
      throw new BadRequestException(
        'Estrato es obligatorio para persona natural. No se puede calcular tratamiento IVA sin estrato.',
      );
    }

    if (stratum < 1 || stratum > 6) {
      throw new BadRequestException(`Estrato debe ser entre 1 y 6. Recibido: ${stratum}`);
    }

    if (stratum <= 2) return VatTreatment.EXEMPT;
    if (stratum === 3) return VatTreatment.EXCLUDED;
    return VatTreatment.STANDARD;
  }

  /**
   * Calcula el régimen tributario según tipo de persona.
   */
  resolveTaxRegime(personType: PersonType): TaxRegime {
    return personType === PersonType.JURIDICA ? TaxRegime.COMMON : TaxRegime.SIMPLIFIED;
  }

  /**
   * Valida que los campos obligatorios según tipo de persona estén presentes.
   * Retorna un array de errores. Vacío = válido.
   */
  validateRequiredFields(personType: PersonType, data: Partial<Subscriber>): string[] {
    const errors: string[] = [];

    if (personType === PersonType.NATURAL) {
      if (!data.documentType) errors.push('documentType es obligatorio para persona natural');
      if (!data.documentNumberEncrypted) errors.push('documentNumber es obligatorio');
      if (!data.firstName) errors.push('firstName es obligatorio para persona natural');
      if (!data.lastName) errors.push('lastName es obligatorio para persona natural');
      if (data.stratum === null || data.stratum === undefined) {
        errors.push('stratum es obligatorio para persona natural');
      }
      if (
        data.stratum !== null &&
        data.stratum !== undefined &&
        (data.stratum < 1 || data.stratum > 6)
      ) {
        errors.push('stratum debe ser entre 1 y 6');
      }
    }

    if (personType === PersonType.JURIDICA) {
      if (!data.nit) errors.push('nit es obligatorio para persona jurídica');
      if (!data.businessName) errors.push('businessName es obligatorio para persona jurídica');
    }

    // Campos compartidos obligatorios para ambos tipos
    if (!data.emailEncrypted) errors.push('email es obligatorio');
    if (!data.phoneEncrypted) errors.push('phone es obligatorio');
    if (!data.address) errors.push('address es obligatorio');

    return errors;
  }

  /**
   * Aplica el tratamiento IVA y régimen tributario a un subscriber parcial.
   * Útil para calcular automáticamente al crear o actualizar.
   */
  applyTaxFields(
    personType: PersonType,
    stratum: number | null,
    segment: CustomerSegment,
  ): {
    vatTreatment: VatTreatment;
    taxRegime: TaxRegime;
  } {
    return {
      vatTreatment: this.resolve(personType, stratum, segment),
      taxRegime: this.resolveTaxRegime(personType),
    };
  }
}
