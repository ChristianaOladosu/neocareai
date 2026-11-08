import { EventEmitter } from 'node:events';
// In-process event bus. The WebSocket layer subscribes and forwards hospital-scoped events.
export interface DomainEvent { type: string; hospitalId: string; payload: Record<string, unknown>; }
export const bus = new EventEmitter();
export const publish = (e: DomainEvent) => bus.emit('event', e);
