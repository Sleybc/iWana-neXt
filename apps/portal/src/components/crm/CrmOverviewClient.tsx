'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { ArrowRight, Loader2 } from 'lucide-react';
import { crmApi, type ExpedienteRecord } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { EXPEDIENTE_STATUS_META, formatCrmDate } from './expedientes/expediente-ui';

interface PipelineSummary {
  data: Record<string, number>;
  total: number;
}

export function CrmOverviewClient() {
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [recentExpedientes, setRecentExpedientes] = useState<ExpedienteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [pipelineSummary, latestExpedientes] = await Promise.all([
          crmApi.getPipelineSummary(),
          crmApi.listExpedientes({ limit: 5 }),
        ]);

        setSummary(pipelineSummary);
        setRecentExpedientes(latestExpedientes.data);
      } catch (err) {
        console.error(err);
        setError('No fue posible cargar el resumen operativo del CRM.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const metrics = useMemo(() => {
    const data = summary?.data ?? {};

    return {
      total: summary?.total ?? null,
      nuevos: (data.NUEVO_POTENCIAL ?? 0) + (data.CONTACTADO ?? 0) + (data.PENDIENTE_DATOS ?? 0),
      evaluacion:
        (data.PRECALIFICADO ?? 0) +
        (data.VALIDANDO_COBERTURA ?? 0) +
        (data.VIABLE_COMERCIALMENTE ?? 0) +
        (data.EN_COTIZACION ?? 0) +
        (data.PENDIENTE_DECISION ?? 0),
      instalacion: (data.LISTO_PARA_INSTALACION ?? 0) + (data.INSTALACION_AGENDADA ?? 0),
      activos: data.CLIENTE_ACTIVO ?? 0,
    };
  }, [summary]);

  const compactMetrics = [
    {
      label: 'Total',
      value: loading ? '...' : String(metrics.total ?? 0),
      description: 'Oportunidades abiertas en el tenant',
    },
    {
      label: 'Prospección',
      value: loading ? '...' : String(metrics.nuevos),
      description: 'Nuevos, contactados o pendientes de datos',
    },
    {
      label: 'Evaluación',
      value: loading ? '...' : String(metrics.evaluacion),
      description: 'Cobertura, cotización o decisión',
    },
    {
      label: 'Cierre',
      value: loading ? '...' : String(metrics.instalacion + metrics.activos),
      description: 'Instalación, agendados y clientes activos',
    },
  ];

  const pipelineRows = [
    {
      label: 'Prospección activa',
      value: metrics.nuevos,
      helper: 'Nuevo, contactado y pendiente de datos',
    },
    {
      label: 'Evaluación comercial',
      value: metrics.evaluacion,
      helper: 'Viabilidad, cotización y decisión',
    },
    {
      label: 'Instalación',
      value: metrics.instalacion,
      helper: 'Listos o agendados para ejecución',
    },
    {
      label: 'Activos',
      value: metrics.activos,
      helper: 'Clientes ya cerrados en el pipeline',
    },
  ];

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="CRM operativo"
        subtitle="Entrada rápida al pipeline y a las oportunidades con movimiento reciente."
        actions={
          <Button asChild>
            <Link href="/dashboard/crm/expedientes">
              Ver oportunidades
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <div className="px-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen CRM">
              {compactMetrics.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Oportunidades recientes</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Casos recientes con acceso directo al detalle de la oportunidad.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
                  Cargando oportunidades recientes...
                </div>
              ) : recentExpedientes.length === 0 ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                  Aún no hay oportunidades registradas en el tenant.
                </div>
              ) : (
                recentExpedientes.map((expediente) => (
                  <Link
                    key={expediente.id}
                    href={`/dashboard/crm/expedientes/${expediente.id}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3 transition-colors hover:border-iwana-primary hover:bg-iwana-primary-50 dark:border-dark-border dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900 dark:text-white">
                        {expediente.fullName}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {formatCrmDate(expediente.createdAt)} · {expediente.source}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <Badge variant={EXPEDIENTE_STATUS_META[expediente.status].variant}>
                        {EXPEDIENTE_STATUS_META[expediente.status].label}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lectura rápida del pipeline</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Vista compacta para no recargar la entrada del módulo.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Cargando resumen...</div>
              ) : (
                pipelineRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-border"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {row.label}
                      </p>
                      <Badge variant="neutral">{row.value}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.helper}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
