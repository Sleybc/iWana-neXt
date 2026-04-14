'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MapPinned } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import type { CoverageNodeConfig, CreateCommercialNodeDto, UpdateCommercialNodeDto } from '@/lib/api-client';

const nodeSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(150, 'Maximo 150 caracteres.'),
  latitude: z.number().min(-90, 'Latitud minima -90.').max(90, 'Latitud maxima 90.'),
  longitude: z.number().min(-180, 'Longitud minima -180.').max(180, 'Longitud maxima 180.'),
  isActive: z.boolean(),
});

type NodeFormValues = z.infer<typeof nodeSchema>;

interface CoverageNodeDialogProps {
  open: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  node: CoverageNodeConfig | null;
  defaultCoordinates: { lat: number; lng: number } | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateCommercialNodeDto | UpdateCommercialNodeDto) => Promise<void>;
}

export function CoverageNodeDialog({
  open,
  canEdit,
  isSubmitting,
  node,
  defaultCoordinates,
  onOpenChange,
  onSubmit,
}: CoverageNodeDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NodeFormValues>({
    resolver: zodResolver(nodeSchema),
    defaultValues: {
      name: '',
      latitude: 4.6097,
      longitude: -74.0817,
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (node) {
      reset({
        name: node.name,
        latitude: node.latitude,
        longitude: node.longitude,
        isActive: node.isActive,
      });
      return;
    }

    reset({
      name: '',
      latitude: defaultCoordinates?.lat ?? 4.6097,
      longitude: defaultCoordinates?.lng ?? -74.0817,
      isActive: true,
    });
  }, [defaultCoordinates, node, open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="node-dialog"
        aria-labelledby="node-dialog-title"
        aria-describedby="node-dialog-description"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
              <MapPinned className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Nodo comercial
              </p>
              <DialogTitle id="node-dialog-title">{node ? 'Editar nodo' : 'Nuevo nodo'}</DialogTitle>
            </div>
          </div>
          <DialogDescription id="node-dialog-description">
            Define nombre, coordenadas y estado del nodo comercial.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Input
            id="node-name"
            label="Nombre"
            disabled={!canEdit || isSubmitting}
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              id="node-latitude"
              type="number"
              step="0.000001"
              label="Latitud"
              disabled={!canEdit || isSubmitting}
              error={errors.latitude?.message}
              {...register('latitude', { valueAsNumber: true })}
            />
            <Input
              id="node-longitude"
              type="number"
              step="0.000001"
              label="Longitud"
              disabled={!canEdit || isSubmitting}
              error={errors.longitude?.message}
              {...register('longitude', { valueAsNumber: true })}
            />
          </div>

          <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-[#f8faf5] px-3 py-2 text-sm font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
            <input type="checkbox" disabled={!canEdit || isSubmitting} {...register('isActive')} />
            Nodo activo
          </label>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting} disabled={!canEdit || isSubmitting}>
              {node ? 'Guardar cambios' : 'Crear nodo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
