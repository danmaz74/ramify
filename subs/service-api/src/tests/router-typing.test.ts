import type { inferRouterInputs, TRPCQueryProcedure } from '@trpc/server';
import { describe, expectTypeOf, it } from 'vitest';
import type { SymbolDetail } from '../../../analysis/subs/typescript/src/interfaces/source.js';
import type { ContextRevision, ContextStatus } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { DependencyViewResult } from '../interfaces/explorer-dependencies.js';
import type { ServerStatusResult } from '../interfaces/explorer-service.js';
import type { createProjectExplorerModel, ExplorerProjectionResult } from '../project-view.js';
import type { ExplorerProcedures, ExplorerRouter } from '../router.js';

/**
 * The declared projection and router types, restated independently.
 *
 * Runtime tests cannot show that a declared signature states exactly the type
 * the body produces, because a widened declaration satisfies every call. These
 * assertions fail the build instead: each one repeats the contract as it stood
 * when the signatures were written down, so a later widening cannot pass
 * unnoticed. `Identical` is the compiler's own type-identity relation, which
 * unlike assignability rejects a wider or a narrower restatement.
 */

type Identical<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2) ? true : false;

type Inputs = inferRouterInputs<ExplorerRouter>;
type Definition<Name extends keyof ExplorerProcedures> =
  ExplorerProcedures[Name] extends TRPCQueryProcedure<infer Shape> ? Shape : never;
type Output<Name extends keyof ExplorerProcedures> = Definition<Name>['output'];

type Ready = Extract<ExplorerProjectionResult, { status: 'ready' }>;
type Unavailable = Extract<ExplorerProjectionResult, { status: 'unavailable' }>;
type ExplorerModule = Ready['view']['modules'][number];

describe('the projection result', () => {
  it('is the declared result of the projection', () => {
    expectTypeOf<Identical<ReturnType<typeof createProjectExplorerModel>, ExplorerProjectionResult>>()
      .toEqualTypeOf<true>();
  });

  it('carries the encoded-size limit only when the model exceeds it', () => {
    expectTypeOf<Identical<Unavailable, {
      status: 'unavailable';
      reason: string;
      limit?: { readonly maximumBytes: number; readonly observedBytes: number } | undefined;
    }>>().toEqualTypeOf<true>();
  });

  it('answers one revision with the projected view', () => {
    expectTypeOf<Identical<Ready['revision'], ContextRevision>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Ready['view']['state'], 'complete' | 'partial'>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Ready['view']['summary'], {
      owners: number;
      ownedFiles: number;
      edges: number;
      accessOccurrences: number;
      selectedSymbols: number;
      deniedAccesses: number;
      limitedAccesses: number;
      coverageNotes: number;
    }>>().toEqualTypeOf<true>();
  });

  it('states each module measurement and every export capability', () => {
    expectTypeOf<Identical<ExplorerModule['metrics'], {
      ownedFiles: number;
      subtreeFiles: number;
      dependencies: number;
      dependents: number;
      accessOccurrences: number;
      selectedSymbols: number;
      deniedAccesses: number;
      limitedAccesses: number;
      approximateIcs: number;
    }>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<ExplorerModule['files'][number], {
      path: string;
      area: 'ordinary' | 'tests';
      kind: 'resource' | 'source';
    }>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<ExplorerModule['exports'][number]['capability'],
      'resource' | 'type' | 'unknown' | 'value' | 'value-and-type'>>().toEqualTypeOf<true>();
  });
});

describe('the explorer router', () => {
  it('keeps every procedure input inferred from its parser', () => {
    expectTypeOf<Identical<Inputs['serverStatus'], void | undefined>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Inputs['projectView'], { revision?: string | undefined }>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Inputs['dependencyView'], { revision: string }>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Inputs['explorerDetails'], {
      revision: string;
      requests: {
        original: { kind: 'code' | 'resource'; owner: string; file: string; binding: string };
        exportName: string;
      }[];
    }>>().toEqualTypeOf<true>();
  });

  it('answers with the owned result vocabulary', () => {
    expectTypeOf<Identical<Output<'serverStatus'>, ServerStatusResult>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Output<'dependencyView'>, DependencyViewResult>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Output<'projectView'>,
      ExplorerProjectionResult | { status: 'pending'; current: ContextStatus }>>().toEqualTypeOf<true>();
    expectTypeOf<Identical<Output<'explorerDetails'>,
      | { status: 'superseded'; reason: string }
      | { status: 'unavailable'; reason: string; revision?: undefined; details?: undefined }
      | { reason?: undefined; status: 'ready'; revision: ContextRevision; details: readonly SymbolDetail[] }
    >>().toEqualTypeOf<true>();
  });
});
