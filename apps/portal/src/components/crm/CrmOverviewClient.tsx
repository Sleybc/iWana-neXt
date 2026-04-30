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
      helper: 'Clientes ya cerrados en el pipeline',
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

      <div className="px-6 space-y-6">
        {error && (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-[var(--shadow-iwana-card)] dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <Card className="overflow-hidden border border-gray-100 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border">
          <CardContent className="p-0">
            <div className="border-b border-gray-100 bg-[linear-gradient(135deg,rgba(23,22,58,0.98)_0%,rgba(52,46,82,0.96)_62%,rgba(106,122,28,0.9)_100%)] px-6 py-6 text-white dark:border-dark-border">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/65">
                    Radar comercial
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
                    Panorama inmediato del pipeline de la empresa
                  </h2>
                  <p className="mt-2 text-sm text-white/72 md:text-base">
                    Vista ejecutiva para identificar carga operativa, oportunidades recientes y
                    avance hacia cierre sin entrar todavía al detalle del expediente.
                  </p>
                </div>
                <div className="grid min-w-[240px] gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
                      Total abierto
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">
                      {loading ? '...' : String(metrics.total ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
                      En evaluación
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">
                      {loading ? '...' : String(metrics.evaluacion)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
                      En cierre
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">
                      {loading ? '...' : String(metrics.instalacion + metrics.activos)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Resumen CRM"
            >
              {compactMetrics.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[20px] border border-gray-100 bg-white px-5 py-5 shadow-[var(--shadow-iwana-card)] transition-transform duration-200 hover:-translate-y-0.5 dark:border-dark-border dark:bg-dark-surface-3"
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
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Card>
            <CardHeader className="border-b border-gray-100 dark:border-dark-border">
              <CardTitle className="text-lg font-bold">Oportunidades recientes</CardTitle>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Casos recientes con acceso directo al detalle de la oportunidad.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-[#f8faf5] px-4 py-6 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                  <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
                  Consolidando las oportunidades con movimiento más reciente.
                </div>
              ) : recentExpedientes.length === 0 ? (
                <div className="rounded-[24px] border border-gray-200 bg-[#f8faf5] px-4 py-6 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                  <p className="font-semibold text-gray-800 dark:text-white">
                    Sin oportunidades recientes
                  </p>
                  <p className="mt-1 leading-6 text-gray-500 dark:text-gray-400">
                    Cuando el tenant empiece a registrar prospectos, aquí aparecerán los accesos
                    directos al expediente.
                  </p>
                </div>
              ) : (
                recentExpedientes.map((expediente) => (
                  <Link
                    key={expediente.id}
                    href={`/dashboard/crm/expedientes/${expediente.id}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 px-4 py-4 shadow-[var(--shadow-iwana-card)] transition-all hover:-translate-y-0.5 hover:border-iwana-primary/25 hover:bg-iwana-primary-50/50 dark:border-dark-border dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10"
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
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-[#f8faf5] px-4 py-5 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                  <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
                  Preparando la lectura compacta del pipeline.
                </div>
              ) : (
                pipelineRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-[var(--shadow-iwana-card)] dark:border-dark-border dark:bg-dark-surface-3"
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
              Acceso directo al listado operativo de suscriptores de la empresa, con alta, detalle y
              transición de estado.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                El módulo ya concentra el seguimiento comercial y postventa del cliente.
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Si aún no hay métricas agregadas disponibles para esta vista, entra al módulo para
                operar el detalle.
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
    </div>
  );
}
