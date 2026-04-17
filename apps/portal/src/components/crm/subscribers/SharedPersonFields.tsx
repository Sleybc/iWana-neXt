'use client';

import { Input, Select } from '@iwana/ui';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { SubscriberFormValues } from './SubscriberForm';
import { CUSTOMER_SEGMENT_OPTIONS } from './subscriber-ui';

interface SharedPersonFieldsProps {
  register: UseFormRegister<SubscriberFormValues>;
  errors: FieldErrors<SubscriberFormValues>;
}

export function SharedPersonFields({ register, errors }: SharedPersonFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Select
          label="Segmento"
          className="h-11"
          options={[...CUSTOMER_SEGMENT_OPTIONS]}
          {...register('customerSegment')}
        >
          <option value="">Selecciona</option>
        </Select>
        {errors.customerSegment && (
          <p className="mt-1 text-xs text-rose-600">{errors.customerSegment.message}</p>
        )}
      </div>
      <div>
        <Input label="Correo" type="email" className="h-11" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
      </div>
      <div>
        <Input label="Teléfono" className="h-11" {...register('phone')} />
        {errors.phone && <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>}
      </div>
      <div>
        <Input label="WhatsApp" className="h-11" {...register('whatsapp')} />
        {errors.whatsapp && <p className="mt-1 text-xs text-rose-600">{errors.whatsapp.message}</p>}
      </div>
      <div className="md:col-span-2">
        <Input label="Dirección" className="h-11" {...register('address')} />
        {errors.address && <p className="mt-1 text-xs text-rose-600">{errors.address.message}</p>}
      </div>
      <div>
        <Input label="Barrio" className="h-11" {...register('neighborhood')} />
        {errors.neighborhood && (
          <p className="mt-1 text-xs text-rose-600">{errors.neighborhood.message}</p>
        )}
      </div>
      <div>
        <Input label="Ciudad" className="h-11" {...register('city')} />
        {errors.city && <p className="mt-1 text-xs text-rose-600">{errors.city.message}</p>}
      </div>
      <div>
        <Input label="Departamento" className="h-11" {...register('department')} />
        {errors.department && (
          <p className="mt-1 text-xs text-rose-600">{errors.department.message}</p>
        )}
      </div>
      <div>
        <Input label="Código postal" className="h-11" {...register('postalCode')} />
        {errors.postalCode && (
          <p className="mt-1 text-xs text-rose-600">{errors.postalCode.message}</p>
        )}
      </div>
    </div>
  );
}
