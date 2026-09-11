// Independent service vocabulary from Plan 2. The full RamifyService interface
// requires the contexts owner's revision, status and outcome contracts.
export type ServiceOperation = 'openContext' | 'contextStatus' | 'check' | 'subscribe'
  | 'unsubscribe' | 'closeContext' | 'daemonStatus' | 'stopDaemon';
export type ServiceCapability = 'contexts' | 'check' | 'subscribe' | 'daemon-control';
export type ServiceErrorCode = 'invalid-request' | 'unsupported-operation'
  | 'unknown-context' | 'expired-generation' | 'resource-unavailable'
  | 'unknown-subscription' | 'wrong-instance' | 'stopping' | 'cancelled' | 'internal-error' | 'incompatible';
export interface ServiceError {
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}
export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ServiceError };
