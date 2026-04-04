'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { Loader2, Phone, PhoneOutgoing } from 'lucide-react';
import { crmApi, type ContactAttemptRecord, type CreateContactAttemptDto } from '@/lib/api-client';
import { getContactResultBadgeVariant, getContactChannelBadgeVariant } from './expediente-ui';

const CHANNEL_OPTIONS = [
  { value: 'TELEFONO', label: 'Teléfono' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'SMS', label: 'SMS' },
  { value: 'OTRO', label: 'Otro' },
];

const RESULT_OPTIONS = [
  { value: 'EXITOSO', label: 'Exitoso' },
  { value: 'NO_CONTESTA', label: 'No contesta' },
  { value: 'BUZON', label: 'Buzón de voz' },
  { value: 'OCUPADO', label: 'Ocupado' },
  { value: 'NUMERO_INVALIDO', label: 'Número inválido' },
  { value: 'RECHAZADO', label: 'Rechazado' },
  { value: 'REPROGRAMADO', label: 'Reprogramado' },
];

interface ContactAttemptsPanelProps {
  expedienteId: string;
}

export function ContactAttemptsPanel({ expedienteId }: ContactAttemptsPanelProps) {
  const [attempts, setAttempts] = useState<ContactAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateContactAttemptDto>({
    channel: 'TELEFONO',
    result: 'EXITOSO',
    durationMinutes: undefined,
    notes: undefined,
  });

  useEffect(() => {
    void loadAttempts();
  }, [expedienteId]);

  const loadAttempts = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      const response = await crmApi.listContactAttempts(expedienteId);
      setAttempts(response.data);
    } catch (err) {
      console.error(err);
      setError('No fue posible cargar los intentos de contacto.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      await crmApi.createContactAttempt(expedienteId, formData);
      await loadAttempts();
      setShowForm(false);
      setSuccessMessage('Intento de contacto registrado correctamente.');
      setFormData({
        channel: 'TELEFONO',
        result: 'EXITOSO',
        durationMinutes: undefined,
        notes: undefined,
      });
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No fue posible registrar el intento.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Intentos de contacto
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Registro de comunicaciones con el prospecto
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm(!showForm)}>
          <PhoneOutgoing className="mr-2 h-4 w-4" aria-hidden="true" />
          {showForm ? 'Cancelar' : 'Registrar intento'}
        </Button>
      </div>

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nuevo intento de contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="channel"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Canal
                </label>
                <select
                  id="channel"
                  value={formData.channel}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setFormData({ ...formData, channel: e.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                >
                  {CHANNEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="result"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Resultado
                </label>
                <select
                  id="result"
                  value={formData.result}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setFormData({ ...formData, result: e.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
                >
                  {RESULT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Input
              id="duration"
              type="number"
              label="Duración (minutos)"
              value={formData.durationMinutes ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  durationMinutes: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Duración de la llamada"
            />
            <div>
              <label
                htmlFor="notes"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Notas
              </label>
              <textarea
                id="notes"
                value={formData.notes ?? ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormData({ ...formData, notes: e.target.value || undefined })
                }
                placeholder="Observaciones del contacto..."
                rows={3}
                className="flex w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:focus:border-iwana-primary-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                loading={submitting}
                disabled={!formData.channel || !formData.result}
              >
                Registrar contacto
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-iwana-primary" aria-hidden="true" />
        </div>
      ) : attempts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-dark-border dark:bg-dark-surface-3">
          <Phone className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No hay intentos de contacto registrados.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-iwana-primary/10">
                    <Phone className="h-4 w-4 text-iwana-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getContactChannelBadgeVariant(attempt.channel)}>
                        {attempt.channel}
                      </Badge>
                      <Badge variant={getContactResultBadgeVariant(attempt.result)}>
                        {attempt.result}
                      </Badge>
                    </div>
                    {attempt.durationMinutes && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Duración: {attempt.durationMinutes} min
                      </p>
                    )}
                    {attempt.notes && (
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {attempt.notes}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(attempt.attemptedAt).toLocaleString('es-CO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
