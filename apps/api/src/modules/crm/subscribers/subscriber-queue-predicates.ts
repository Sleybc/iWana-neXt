/** Comparte las reglas SQL de lista y conteos para que ambos lados del chip coincidan. */
export const CONTACT_PENDING_SQL = '(s.email_encrypted IS NULL AND s.phone_encrypted IS NULL)';

export const HAS_LIVE_SERVICES_SQL = `EXISTS (
  SELECT 1
    FROM contracts live_contract
   WHERE live_contract.subscriber_id = s.id
     AND live_contract.tenant_id = s.tenant_id
     AND live_contract.deleted_at IS NULL
     AND live_contract.status::text IN ('ACTIVE', 'SUSPENDED')
)`;

const NIT_DIGITS_SQL = "regexp_replace(COALESCE(s.nit, ''), '[^0-9]', '', 'g')";
const NIT_WEIGHTED_SUM_SQL = `(
  SELECT COALESCE(
           SUM(substring(reverse(${NIT_DIGITS_SQL}) FROM nit_weight.position::integer FOR 1)::integer * nit_weight.weight),
           0
         )
    FROM unnest(ARRAY[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]::integer[])
         WITH ORDINALITY AS nit_weight(weight, position)
   WHERE nit_weight.position <= length(${NIT_DIGITS_SQL})
)`;
const EXPECTED_NIT_DIGIT_SQL = `(CASE
  WHEN (${NIT_WEIGHTED_SUM_SQL} % 11) < 2 THEN (${NIT_WEIGHTED_SUM_SQL} % 11)::text
  ELSE (11 - (${NIT_WEIGHTED_SUM_SQL} % 11))::text
END)`;
const NIT_VERIFICATION_INVALID_SQL = `(
  ${NIT_DIGITS_SQL} = ''
  OR length(${NIT_DIGITS_SQL}) > 15
  OR COALESCE(s.nit_verification_digit !~ '^[0-9]$', TRUE)
  OR COALESCE(${EXPECTED_NIT_DIGIT_SQL} <> s.nit_verification_digit, TRUE)
)`;

/**
 * Paridad con evaluateSubscriberFiscalCompleteness(); los cancelados nunca cuentan.
 * ADR-100 D1: exigir responsabilidades del RUT solo a jurídicas o responsables de IVA.
 */
export const FISCAL_INCOMPLETE_SQL = `(
  s.status::text <> 'CANCELLED'
  AND (
    s.vat_responsibility IS NULL
    OR (
      (s.person_type::text = 'JURIDICA' OR s.vat_responsibility::text = 'RESPONSABLE')
      AND COALESCE(cardinality(s.rut_responsibilities), 0) = 0
    )
    OR (
      s.person_type::text = 'JURIDICA'
      AND (
        ${NIT_VERIFICATION_INVALID_SQL}
        OR s.legal_representative_party_id IS NULL
      )
    )
  )
)`;
