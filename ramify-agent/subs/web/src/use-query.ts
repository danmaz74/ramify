import { useCallback, useEffect, useState } from 'react';

export type QueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'failed'; readonly error: Error };

/**
 * Runs `load` when `key` changes and on `reload`. A reload keeps showing the
 * previous answer until the new one arrives; a new key shows loading; an
 * answer for a superseded request is dropped. `load` is identified by `key`.
 */
export function useQuery<T>(key: string, load: () => Promise<T>): { state: QueryState<T>; reload: () => void; reloading: boolean } {
  const [answer, setAnswer] = useState<{ key: string; state: QueryState<T> }>({ key, state: { status: 'loading' } });
  const [generation, setGeneration] = useState(0);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    let current = true;
    const settle = (state: QueryState<T>) => {
      if (!current) return;
      setAnswer({ key, state });
      setReloading(false);
    };
    load().then(
      data => settle({ status: 'ready', data }),
      (error: unknown) => settle({ status: 'failed', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => { current = false; };
  }, [key, generation]);
  const reload = useCallback(() => {
    setReloading(true);
    setGeneration(value => value + 1);
  }, []);
  return { state: answer.key === key ? answer.state : { status: 'loading' }, reload, reloading };
}
