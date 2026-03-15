import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { TenantCreateForm } from '@/components/tenants/TenantCreateForm';

export default function TenantNewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Nueva empresa" subtitle="Alta de tenant y bootstrap inicial" />
      <Card>
        <CardHeader>
          <CardTitle>Crear empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
