import { Button } from '@iwana/ui';
import { toDialablePhone } from '@iwana/shared';

interface SubscriberContactActionsProps {
  name: string;
  phone?: string | null | undefined;
  altContactPhone?: string | null | undefined;
  whatsapp?: string | null | undefined;
  countryPrefix: string;
  hidden?: boolean;
}

function firstDialablePhone(
  candidates: Array<string | null | undefined>,
  countryPrefix: string,
): string | null {
  for (const candidate of candidates) {
    const dialablePhone = toDialablePhone(candidate, countryPrefix);
    if (dialablePhone) return dialablePhone;
  }

  return null;
}

export function SubscriberContactActions({
  name,
  phone,
  altContactPhone,
  whatsapp,
  countryPrefix,
  hidden = false,
}: SubscriberContactActionsProps) {
  if (hidden) return null;

  const callPhone = firstDialablePhone([phone, altContactPhone], countryPrefix);
  const whatsappPhone = firstDialablePhone([whatsapp, phone], countryPrefix);
  const hasPhoneData = Boolean(phone?.trim() || altContactPhone?.trim() || whatsapp?.trim());
  const showInvalidPhoneNotice = hasPhoneData && !callPhone && !whatsappPhone;

  if (!callPhone && !whatsappPhone && !showInvalidPhoneNotice) return null;

  return (
    <div className="space-y-2">
      {callPhone || whatsappPhone ? (
        <div className="flex flex-wrap gap-2">
          {callPhone ? (
            <Button asChild variant="secondary" className="min-h-11">
              <a href={`tel:${callPhone}`} aria-label={`Llamar a ${name}`}>
                Llamar
              </a>
            </Button>
          ) : null}
          {whatsappPhone ? (
            <Button asChild variant="secondary" className="min-h-11">
              <a
                href={`https://wa.me/${whatsappPhone.slice(1)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Escribir por WhatsApp a ${name}`}
              >
                WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
      {showInvalidPhoneNotice ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Teléfono sin formato válido
        </p>
      ) : null}
    </div>
  );
}
