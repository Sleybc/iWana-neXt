import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

/**
 * Errores de dominio de la supresión (Fase 1b, R2 a R5).
 *
 * Todo código cumple `^[A-Z][A-Z0-9_]{2,63}$` (§2.3). Los dos últimos los
 * lanza el puerto dentro de su transacción (los implementa B2); se definen
 * aquí para que el puerto y el servicio compartan el mismo contrato.
 */
export function erasureNotApplicable(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'PRIVACY_ERASURE_NOT_APPLICABLE',
    message: 'La anonimización solo aplica al resolver una solicitud de supresión.',
  });
}

export function erasureConfirmationRequired(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'PRIVACY_ERASURE_CONFIRMATION_REQUIRED',
    message: 'Resolver una supresión exige confirmar la anonimización con sus expedientes.',
  });
}

export function erasureIdentityRequired(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'PRIVACY_ERASURE_IDENTITY_REQUIRED',
    message: 'Verifica la identidad del solicitante antes de resolver la supresión.',
  });
}

export function erasureUnreconciledTitular(): ConflictException {
  return new ConflictException({
    code: 'PRIVACY_ERASURE_UNRECONCILED_TITULAR',
    message:
      'El documento del solicitante coincide con un suscriptor sin conciliar; ' +
      'concilia al titular antes de resolver la supresión.',
  });
}

export function erasureActiveAccount(): ConflictException {
  return new ConflictException({
    code: 'PRIVACY_ERASURE_ACTIVE_ACCOUNT',
    message:
      'El titular tiene una cuenta de usuario activa; dala de baja antes de resolver la supresión.',
  });
}

export function erasureCandidatesChanged(): ConflictException {
  return new ConflictException({
    code: 'PRIVACY_ERASURE_CANDIDATES_CHANGED',
    message:
      'Los expedientes del titular cambiaron desde la vista previa; ' +
      'revisa la vista previa antes de resolver la supresión.',
  });
}

export function erasureVerificationFailed(): ConflictException {
  return new ConflictException({
    code: 'PRIVACY_ERASURE_VERIFICATION_FAILED',
    message:
      'La verificación de residuales encontró datos personales sin anonimizar; ' +
      'nada se confirmó.',
  });
}
