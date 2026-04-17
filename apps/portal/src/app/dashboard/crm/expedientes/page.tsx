'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@iwana/ui';
import { AcquisitionChannel } from '@iwana/shared';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircleDashed,
  User,
  FileText,
  Filter,
  Loader2,
  MapPin,
  Plus,
  Search,
} from 'lucide-react';
import {
  ApiError,
  crmApi,
  ExpedienteRecord,
  ExpedienteStatus,
  usersApi,
  InternalUser,
} from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  EXPEDIENTE_STATUS_META,
  getStatusMeta,
  formatAcquisitionChannel,
  formatCrmDate,
  formatMunicipio,
} from '@/components/crm/expedientes/expediente-ui';

function validateCreateValues(values: {
  fullName: string;
  acquisitionChannel: string;
  originadorId: string;
}): string | null {
  const fullName = values.fullName.trim();

  if (!fullName || !values.acquisitionChannel) {
    return 'Nombre completo y origen son obligatorios para crear la oportunidad.';
  }

  if (fullName.length > 160) {
    return 'El nombre completo no puede superar 160 caracteres.';
  }

  return null;
}

function formatApiError(error: ApiError): string {
  if (error.code !== 'VALIDATION_ERROR' || !error.details || typeof error.details !== 'object') {
    return error.message;
  }

  const details = error.details as {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };

  const fieldMessages = Object.entries(details.fieldErrors ?? {})
    .flatMap(([, messages]) => messages ?? [])
    .filter((message): message is string => Boolean(message));
  const formMessages = (details.formErrors ?? []).filter((message): message is string =>
    Boolean(message),
  );
  const validationMessages = [...fieldMessages, ...formMessages];

  if (validationMessages.length === 0) {
    return 'Verifica nombre completo y origen antes de crear la oportunidad.';
  }

  return validationMessages.join(' ');
}

export default function ExpedientesPage() {
  const [expedientes, setExpedientes] = useState<ExpedienteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ExpedienteStatus | ''>('');
  const [search, setSearch] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [createValues, setCreateValues] = useState({
    fullName: '',
    acquisitionChannel: 'OTRO',
    originadorId: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<InternalUser[]>([]);

  useEffect(() => {
    void loadExpedientes();
    void loadEmployees();
  }, [statusFilter, search, documentNumber]);

  const loadExpedientes = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const filters: {
        status?: ExpedienteStatus;
        search?: string;
        documentNumber?: string;
        limit: number;
      } = { limit: 100 };
      if (statusFilter) filters.status = statusFilter as ExpedienteStatus;
      if (search) filters.search = search;
      if (documentNumber.trim()) filters.documentNumber = documentNumber.trim();

      const response = await crmApi.listExpedientes(filters);
      setExpedientes(response.data);
      setTotal(response.total);
    } catch (err) {
      console.error('Error loading expedientes:', err);
      setError('No fue posible cargar las oportunidades del tenant.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await usersApi.list({ status: 'ACTIVE', limit: 200 });
      setEmployees(response.data);
    } catch {
      // Si no se pueden cargar los empleados, el dropdown queda vacío pero no bloquea el formulario
    }
  };

  const handleCreateNew = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateCreateValues(createValues);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const payload: {
        fullName: string;
        acquisitionChannel: AcquisitionChannel;
      } = {
        fullName: createValues.fullName.trim(),
        acquisitionChannel: createValues.acquisitionChannel as AcquisitionChannel,
      };

      const created = await crmApi.createExpediente(payload);

      if (createValues.originadorId) {
        try {
          await crmApi.createAttribution(created.data.id, {
            actorId: createValues.originadorId,
            acquisitionChannel: createValues.acquisitionChannel as AcquisitionChannel,
          });
        } catch {
          // La atribución falló pero el expediente se creó. No bloqueamos al usuario.
        }
      }

      setCreateValues({ fullName: '', acquisitionChannel: 'OTRO', originadorId: '' });
      await loadExpedientes();
    } catch (err) {
      console.error('Error creating expediente:', err);
      setError(
        err instanceof ApiError
          ? formatApiError(err)
          : err instanceof Error
            ? err.message
            : 'Error al crear oportunidad.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="CRM operativo"
        subtitle="Oportunidades comerciales para captación, calificación y cierre comercial del tenant."
        actions={<Badge variant="primary">{total} oportunidades</Badge>}
      />

      <div className="px-6 space-y-6">
        {error && (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-[var(--shadow-iwana-card)] dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-iwana-secondary-700" aria-hidden="true" />
              Crear nueva oportunidad
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Registra el potencial con el mínimo viable y completa la oportunidad a medida que
              avance el pipeline.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateNew} className="space-y-4" noValidate>
              <div className="grid gap-4 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
                <Input
                  id="expediente-full-name"
                  label="Nombre completo"
                  value={createValues.fullName}
                  onChange={(event) =>
                    setCreateValues((current) => ({ ...current, fullName: event.target.value }))
                  }
                  placeholder="Ej. Empresa Demo SAS"
                  maxLength={160}
                />
                <div>
                  <label
                    htmlFor="expediente-originador"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Origenador
                  </label>
                  <Select
                    id="expediente-originador"
                    value={createValues.originadorId}
                    onChange={(event) =>
                      setCreateValues((current) => ({
                        ...current,
                        originadorId: event.target.value,
                      }))
                    }
                    className="h-10"
                  >
                    <option value="">Sin asignar</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {[
                          employee.firstName,
                          employee.lastName,
                          employee.firstName || employee.lastName ? '—' : '',
                          employee.email,
                        ]
                          .filter(Boolean)
                          .join(' ')
                          .trim()}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label
                    htmlFor="expediente-acquisition-channel"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Origen
                  </label>
                  <Select
                    id="expediente-acquisition-channel"
                    value={createValues.acquisitionChannel}
                    onChange={(event) =>
                      setCreateValues((current) => ({
                        ...current,
                        acquisitionChannel: event.target.value,
                      }))
                    }
                    className="h-10"
                  >
                    {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" loading={creating} className="h-10">
                  {!creating && <Plus className="h-4 w-4" aria-hidden="true" />}
                  {creating ? 'Creando...' : 'Crear'}
                </Button>
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px_auto] lg:items-end">
              <div>
                <label
                  htmlFor="expediente-status-filter"
                  className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <Filter className="h-4 w-4 text-iwana-secondary-700" aria-hidden="true" />
                  Estado
                </label>
                <Select
                  id="expediente-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ExpedienteStatus | '')}
                  className="h-10"
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(EXPEDIENTE_STATUS_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                >
                  <Search className="h-4 w-4" />
                </span>
                <Input
                  id="expediente-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre del potencial..."
                  className="pl-10"
                />
              </div>

              <Input
                id="expediente-document-filter"
                label="Documento exacto"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Número de documento"
              />

              <div className="flex justify-start lg:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!statusFilter && !search && !documentNumber}
                  onClick={() => {
                    setStatusFilter('');
                    setSearch('');
                    setDocumentNumber('');
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-iwana-primary" aria-hidden="true" />
              Pipeline de oportunidades
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vista operacional del avance comercial con acceso rápido a cada oportunidad.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-14 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="h-5 w-5 animate-spin text-iwana-primary" aria-hidden="true" />
                Estamos consolidando el pipeline comercial del tenant.
              </div>
            ) : expedientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-iwana-primary/10 dark:bg-iwana-primary/20">
                  <CircleDashed
                    className="h-7 w-7 text-iwana-primary dark:text-iwana-primary-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Pipeline sin oportunidades activas
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Registra la primera oportunidad para habilitar seguimiento, calificación y
                    cierre comercial.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3">
                      <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                        Potencial
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                        Estado
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                        Fuente
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                        Ubicación
                      </th>
                      <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                        Creado
                      </th>
                      <th className="px-5 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                    {expedientes.map((expediente) => {
                      return (
                        <tr
                          key={expediente.id}
                          className="transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface-3"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iwana-primary/10 dark:bg-iwana-primary/20">
                                {expediente.personType === 'PERSONA_NATURAL' ? (
                                  <User
                                    className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Building2
                                    className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/dashboard/crm/expedientes/${expediente.id}`}
                                  className="block truncate font-medium text-gray-900 transition-colors hover:text-iwana-primary dark:text-white dark:hover:text-iwana-secondary"
                                >
                                  {expediente.fullName}
                                </Link>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  ID {expediente.id.slice(0, 8).toUpperCase()}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <Badge variant={getStatusMeta(expediente.status).variant}>
                              {getStatusMeta(expediente.status).label}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-gray-700 dark:text-gray-200">
                            <Badge variant="primary">
                              {formatAcquisitionChannel(expediente.acquisitionChannel)}
                            </Badge>
                            {expediente.sourceDetail && (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {expediente.sourceDetail}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                              <MapPin
                                className="h-4 w-4 text-iwana-secondary-700 dark:text-iwana-secondary"
                                aria-hidden="true"
                              />
                              <span>
                                {formatMunicipio(expediente.municipality || '') || 'Sin municipio'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                            {formatCrmDate(expediente.createdAt)}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button variant="ghost" asChild>
                              <Link href={`/dashboard/crm/expedientes/${expediente.id}`}>
                                Abrir
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
