import { CommercialClient } from '@/components/commercial/CommercialClient';
import { isCommercialTabParam } from '@/components/commercial/commercial-tab-params';

export const metadata = {
  title: 'Comercial | Portal Empresarial',
};

type CommercialPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

function resolveInitialTab(rawTab?: string | string[]): string | undefined {
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  if (!candidate || !isCommercialTabParam(candidate)) {
    return undefined;
  }

  return candidate;
}

export default async function CommercialPage({ searchParams }: CommercialPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolveInitialTab(resolvedSearchParams?.tab);

  if (initialTab) {
    return <CommercialClient initialTab={initialTab} />;
  }

  return <CommercialClient />;
}
