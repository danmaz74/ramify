import { join } from 'node:path';
import { z } from 'zod';
import { modulePathSchema, sha256Schema } from '../interfaces/protocol/evidence.js';
import { recordRefSchema } from '../run/records.js';
import { slugSchema } from '../analysis/records.js';
import { testSelectionPolicySchema } from '../work/iterations.js';

/*
 * The durable records of one agreement between a consumer and a provider:
 * the contract that states it, the one obligation the provider carries, and
 * one requirement per consumer attached to it.
 *
 * There is one obligation per contract. A second consumer of the same
 * agreement adds its own requirement and nothing else, so a shared
 * obligation is one provider execution per revision while each consumer
 * verifies separately.
 *
 * Every record is immutable and committed by one run-log event. A revision
 * is a new file at the next number; nothing is rewritten, and no record
 * carries a status field. Whether a delegation is finished is in the log.
 */

const text = z.string().min(1);

/** `ct-001`, the count of committed contracts. */
export type ContractId = string;
/** `ob-ct-001`, derived from the contract it belongs to. */
export type ObligationId = string;
/** `rq-001`, the count of committed requirements. */
export type RequirementId = string;

export const contractId = (count: number): ContractId => `ct-${String(count).padStart(3, '0')}`;
export const obligationId = (contract: ContractId): ObligationId => `ob-${contract}`;
export const requirementId = (count: number): RequirementId => `rq-${String(count).padStart(3, '0')}`;

/** The contract a requirement's obligation belongs to, from the obligation's derived name. */
export const contractOfObligation = (obligation: ObligationId): ContractId => obligation.replace(/^ob-/, '');

/**
 * Where the contract-authority rule places the agreement: with the
 * capability's implementation, with the consumer that defined the port, or
 * at the common ancestor of two peers. Mere reuse never creates a neutral
 * definitions module, so `independent` states which ancestor owns it and
 * why.
 */
export const contractAuthoritySchema = z.object({
  kind: z.enum(['provider', 'consumer', 'independent']),
  owner: modulePathSchema,
  rationale: text,
}).strict();
export type ContractAuthority = z.infer<typeof contractAuthoritySchema>;

/**
 * `access-only` establishes access to behavior that already exists: an
 * exposure change, integrated with the real provider, with no fake and no
 * obligation.
 */
export const contractModeSchema = z.enum(['fake-backed', 'access-only']);
export type ContractMode = z.infer<typeof contractModeSchema>;

/** One artifact of the agreement, with the bytes it had when the gate passed. */
const artifact = z.object({ path: text, exports: z.array(text), hash: sha256Schema }).strict();

/** Where an owner, or an ancestor that re-exposes what it received, exposes an original. */
export const exposureChannelSchema = z.enum(['parent', 'descendants']);

/**
 * An original's exposure as the architect view records it: where its owner
 * exposes it, and each ancestor that re-exposes it and where to, nearest
 * first. Empty `to` and `reexposed` are an original no declaration exposes.
 */
export const exposureChainSchema = z.object({
  to: z.array(exposureChannelSchema),
  reexposed: z.array(z.object({ by: modulePathSchema, to: z.array(exposureChannelSchema).min(1) }).strict()),
}).strict();
export type ExposureChain = z.infer<typeof exposureChainSchema>;

/**
 * The real provider export one fake export stands for: the file of the
 * provider module that holds it, or will hold it, and its export name. The
 * file need not exist when the agreement is established. `exposure` is the
 * exposure the agreement declares for the real export; the fake is compared
 * with it while the real export does not exist, and with the real export as
 * the architect view records it once it does.
 */
export const standsForSchema = z.object({
  /** The fake's exported name, one of its artifact's `exports`. */
  fake: text,
  path: text,
  export: text,
  exposure: exposureChainSchema,
}).strict();
export type StandsFor = z.infer<typeof standsForSchema>;

/** A fake file of the agreement, and the real export each of its exported names stands for. */
const fakeArtifact = artifact.extend({ standsFor: z.array(standsForSchema) }).strict();

export const contractRecordSchema = z.object({
  schema: z.literal('ramify-agent.contract/2'),
  id: text,
  revision: z.int().positive(),
  /** The registry entry of the capability this agreement is for. */
  capability: recordRefSchema,
  /**
   * The placement decision that placed the capability. It is null where the
   * initial analysis's own entry assignment placed it and no decision was
   * made: the field records that rather than naming a decision nobody took.
   */
  decision: z.string().nullable(),
  authority: contractAuthoritySchema,
  provider: modulePathSchema,
  behavior: text,
  mode: contractModeSchema,
  artifacts: z.object({
    interface: z.array(artifact),
    conformance: z.array(z.object({ path: text, hash: sha256Schema }).strict()),
    /**
     * `.fake` files whose exported names carry `Fake`, the contract gate
     * verifies both, and each name's real export: a fake is exactly as
     * importable as what it stands for.
     */
    fake: z.array(fakeArtifact),
    exposure: z.array(z.object({ path: text, declaration: text }).strict()),
  }).strict(),
  establishedBy: z.object({ iteration: text, gate: text }).strict(),
}).strict();
export type ContractRecord = z.infer<typeof contractRecordSchema>;

export const providerObligationSchema = z.object({
  schema: z.literal('ramify-agent.provider-obligation/1'),
  id: text,
  /** Equal to the contract revision it was registered at. */
  revision: z.int().positive(),
  contract: recordRefSchema,
  capability: slugSchema,
  provider: modulePathSchema,
  behavior: text,
  /** The conformance suite, run against the real provider and against nothing else. */
  evidence: z.object({ conformance: z.array(text), against: z.literal('real') }).strict(),
}).strict();
export type ProviderObligation = z.infer<typeof providerObligationSchema>;

export const consumerRequirementSchema = z.object({
  schema: z.literal('ramify-agent.consumer-requirement/1'),
  id: text,
  /** Equal to the contract revision. */
  revision: z.int().positive(),
  /** The original consumer work item; the identity stays stable across revisions. */
  workItem: text,
  consumer: modulePathSchema,
  /** The capability the consumer is implementing: the tail of the dependency edge. */
  forCapability: slugSchema,
  obligation: text,
  contractRevision: z.int().positive(),
  behavior: text,
  /** What verification replaces: the consumer's own tests, and where the fake is held. */
  evidence: z.object({
    tests: testSelectionPolicySchema,
    fakeInjections: z.array(text),
  }).strict(),
}).strict();
export type ConsumerRequirement = z.infer<typeof consumerRequirementSchema>;

/** Where an agreement's records are materialized, relative to the run's directory. */
export const contractsLayout = {
  contract: (id: ContractId, revision: number): string => join('contracts', id, `${revision}.json`),
  obligation: (id: ObligationId, revision: number): string => join('obligations', id, `${revision}.json`),
  requirement: (id: RequirementId, revision: number): string => join('requirements', id, `${revision}.json`),
} as const;

/** The schema literal of each kind, for a reader that answers unsupported version. */
export const contractSchemas = {
  contract: { schema: 'ramify-agent.contract/2', body: contractRecordSchema },
  obligation: { schema: 'ramify-agent.provider-obligation/1', body: providerObligationSchema },
  requirement: { schema: 'ramify-agent.consumer-requirement/1', body: consumerRequirementSchema },
} as const;
