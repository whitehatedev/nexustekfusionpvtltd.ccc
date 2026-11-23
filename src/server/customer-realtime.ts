import { EventEmitter } from 'events';

export interface CustomerStreamEventPayload {
  type: 'enquiry' | 'service_record' | 'order' | 'project' | 'payment' | 'notification' | 'cart' | 'profile';
  action: string;
  id?: string | number;
  summary?: string;
  timestamp: string;
}

const customerStreamEmitter = new EventEmitter();
customerStreamEmitter.setMaxListeners(400);

export function emitCustomerStreamEvent(
  userId: number | null | undefined,
  event: Omit<CustomerStreamEventPayload, 'timestamp'> & { timestamp?: string }
): void {
  if (!userId || !Number.isFinite(userId)) return;
  const payload: CustomerStreamEventPayload = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  };
  customerStreamEmitter.emit(`customer:${userId}`, payload);
}

export function subscribeCustomerStream(
  userId: number,
  listener: (payload: CustomerStreamEventPayload) => void
): () => void {
  const channel = `customer:${userId}`;
  customerStreamEmitter.on(channel, listener);
  return () => {
    customerStreamEmitter.off(channel, listener);
  };
}
