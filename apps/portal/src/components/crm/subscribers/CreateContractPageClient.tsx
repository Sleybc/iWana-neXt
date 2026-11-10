'use client';

import { useParams, useRouter } from 'next/navigation';
import { CreateContractForm } from './CreateContractDialog';
import { ServicePageFrame } from './ServicePageFrame';
import { subscriberServicesHref, useSubscriber360 } from './use-subscriber-360';

/**
 * Alta de contrato en página completa (spec MOD05 UISP §3 E y §4): los mismos campos,
 * validaciones y punto de servicio que el panel, en dos columnas con secundarios
 * plegables y la vista previa del primer cobro.
 */
export function CreateContractPageClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subscriberId = typeof params?.id === 'string' ? params.id : '';
  const { data, loading, error, reload } = useSubscriber360(subscriberId);
  const back = () => router.push(subscriberServicesHref(subscriberId));
  const subscriber = data?.subscriber ?? null;
  const blocked = Boolean(subscriber?.privacyRestricted);

  return (
    <ServicePageFrame
      subscriberId={subscriberId}
      loading={loading && !data}
      error={data ? null : error}
      onRetry={() => void reload()}
      notFound={
        blocked
          ? {
              title: 'No puedes agregar servicios a este suscriptor',
              description: 'Sus datos están bloqueados por una solicitud de privacidad.',
            }
          : null
      }
    >
      {() =>
        subscriber ? (
          <CreateContractForm
            layout="page"
            subscriberId={subscriberId}
            personType={subscriber.personType}
            onClose={back}
            onSuccess={async () => back()}
          />
        ) : null
      }
    </ServicePageFrame>
  );
}
