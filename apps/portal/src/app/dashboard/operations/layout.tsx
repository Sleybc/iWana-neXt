// apps/portal/src/app/dashboard/operations/layout.tsx
// Marco continuo del módulo Operaciones (spec 2026-09-13 §4.3; UX spec §4.1):
// PageHeader + pestañas de módulo nunca se desmontan entre sub-rutas
// (mecanismo 1 de §4.4). El PageHeader sube desde OperationsClient.tsx:1121;
// eso preserva la aserción e2e `heading 'Operaciones'` de
// e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:877 sin tocar el
// test. Server Component: solo los fragmentos cliente (pestañas, CTA) lo son.
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { OperationsCreateTaskAction } from '@/components/operations/OperationsCreateTaskAction';
import { OperationsModuleTabs } from '@/components/operations/OperationsModuleTabs';

export const metadata = {
  title: 'Operaciones | Portal Empresarial',
  description: 'Ejecución operativa transversal con responsable y destinatario explícitos.',
};

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Operaciones"
        subtitle="Crea, despacha y sigue tareas con responsable y destinatario explícitos."
        actions={<OperationsCreateTaskAction />}
      />
      <OperationsModuleTabs />
      {children}
    </div>
  );
}
