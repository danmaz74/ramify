import type { DaemonService } from './interfaces/daemon.js';
interface Counters { connections: number; coalescedEvents: number; rejectedRequests: number; disconnectedSlowConsumers: number }
const counters = new WeakMap<DaemonService, Counters>();
export function transportCounters(service: DaemonService): Counters {
  let value = counters.get(service);
  if (!value) { value = { connections: 0, coalescedEvents: 0, rejectedRequests: 0, disconnectedSlowConsumers: 0 }; counters.set(service, value); }
  return value;
}
