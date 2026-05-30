'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Radar,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import { crmApi, type ExpedienteRecord } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { getStatusMeta, formatCrmDate } from './expedientes/expediente-ui';

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
    const load = async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
        }
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
        if (!silent) {
          setLoading(false);
        }
      }
    };

    void load();
  }, []);

  const metrics = useMemo(() => {
    const data = summary?.data ?? {};

    return {
      total: summary?.total ?? null,
      nuevos: (data.NUEVO_POTENCIAL ?? 0) + (data.PRECALIFICADO ?? 0),
      evaluacion: (data.VALIDANDO_COBERTURA ?? 0) + (data.EN_COTIZACION ?? 0),
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
      description: 'Nuevos y precalificados',
    },
    {
      label: 'Evaluación',
      value: loading ? '...' : String(metrics.evaluacion),
      description: 'Cobertura y cotización',
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
      helper: 'Nuevo potencial y precalificado',
      icon: Radar,
      tone: 'bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary/15 dark:text-iwana-primary-300',
    },
    {
      label: 'Evaluación comercial',
      value: metrics.evaluacion,
      helper: 'Validando cobertura y en cotización',
      icon: Target,
      tone: 'bg-iwana-secondary/15 text-iwana-secondary-700 dark:bg-iwana-secondary/20 dark:text-iwana-secondary',
    },
    {
      label: 'Instalación',
      value: metrics.instalacion,
      helper: 'Listos o agendados para ejecución',
      icon: Activity,
      tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    },
    {
      label: 'Activos',
      value: metrics.activos,
      helper: 'Cierre histórico ya convertido a suscriptor',
      icon: ShieldCheck,
      tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
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

      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el CRM"
          description={error}
          icon={AlertTriangle}
        />
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen CRM">
        {compactMetrics.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              {item.label}
            </p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-iwana-primary dark:text-white">
              {item.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {item.description}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader className="border-b border-gray-100 dark:border-dark-border">
            <CardTitle className="text-lg font-bold">Oportunidades recientes</CardTitle>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              Casos recientes con acceso directo al detalle de la oportunidad.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3">
                <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
                <PortalSkeletonBlock className="h-10 flex-1 rounded-xl" />
              </div>
            ) : recentExpedientes.length === 0 ? (
              <PortalEmptyState
                title="Sin oportunidades recientes"
                description="Cuando el tenant empiece a registrar prospectos, aquí aparecerán los accesos directos al expediente."
              />
            ) : (
              recentExpedientes.map((expediente) => (
                <Link
                  key={expediente.id}
                  href={`/dashboard/crm/expedientes/${expediente.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 px-4 py-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-iwana-primary/25 hover:bg-iwana-primary-50/50 dark:border-dark-border dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold text-gray-900 dark:text-white">
                      {expediente.fullName}
                    </span>
                    <span className="mt-1 block text-xs tracking-wide text-gray-500 dark:text-gray-400">
                      {formatCrmDate(expediente.createdAt)} · {expediente.source}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <Badge variant={getStatusMeta(expediente.status).variant}>
                      {getStatusMeta(expediente.status).label}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-gray-100 dark:border-dark-border">
            <CardTitle className="text-lg font-bold">Lectura rápida del pipeline</CardTitle>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              Vista compacta para no recargar la entrada del módulo.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-5 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
                Preparando la lectura compacta del pipeline.
              </div>
            ) : (
              pipelineRows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${row.tone}`}
                        aria-hidden="true"
                      >
                        <row.icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                          {row.label}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.helper}
                        </p>
                      </div>
                    </div>
                    <Badge variant="neutral">{row.value}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-gray-100 dark:border-dark-border">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5 text-iwana-primary" aria-hidden="true" />
            Suscriptores
          </CardTitle>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            Acceso directo al listado operativo de suscriptores de la empresa.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              El módulo concentra seguimiento comercial y postventa.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Entra al listado para operar altas, detalle y transición de estado.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/crm/subscribers">
              Ver suscriptores
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
