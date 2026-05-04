'use client';

import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { ArrowRight, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

export function SubscribersLandingClient() {
  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="Suscriptores"
        subtitle="Módulo CRM para gestión de suscriptores activos y su ciclo de vida."
      />

      <Card>
        <CardHeader className="border-b border-gray-100 dark:border-dark-border">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5 text-iwana-primary" aria-hidden="true" />
            Vista inicial del módulo
          </CardTitle>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            La experiencia completa de listado, detalle 360° y formulario discriminado se habilita
            en esta fase. Esta ruta ya queda operativa para navegación y trazabilidad.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Mientras se completa la implementación, puedes continuar en el flujo comercial actual
            desde Expedientes.
          </p>
          <Button asChild>
            <Link href="/dashboard/crm/expedientes">
              Ir a Expedientes
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
