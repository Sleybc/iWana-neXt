import { Subscriber } from './entities/subscriber.entity';

/** Canal real disponible según las columnas cifradas del suscriptor. */
export function hasRealContact(
  subscriber: Partial<Pick<Subscriber, 'emailEncrypted' | 'phoneEncrypted'>>,
): boolean {
  return subscriber.emailEncrypted != null || subscriber.phoneEncrypted != null;
}
