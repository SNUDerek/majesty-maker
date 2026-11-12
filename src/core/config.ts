/**
 * Typed rules configuration, validation, variant merging, hashing, and the
 * unresolved-parameter register (T0.3).
 *
 * `RulesConfig` is inferred from a single runtime schema, so the TypeScript
 * type and the JSON validation can never drift apart. Rule values stay plain;
 * anything not confirmed by the design docs is flagged in the parallel
 * `provenance` map (dotted path -> status + note). `getUnresolved` reads that
 * map so reports can list every simulation assumption.
 *
 * Core stays pure: callers pass already-parsed JSON (files are read by the
 * simulation adapter or by tests).
 */

import { UINT32_RANGE } from './rng.js';
import type { Estate, JobId, LunarPhase, RestId, TutorId, ActivityId, ZodiacSign } from './types.js';

// ---------------------------------------------------------------------------
// Runtime id lists (Record<T, true> forces each list to be complete)
// ---------------------------------------------------------------------------

function allOf<T extends string>(members: Record<T, true>): readonly T[] {
  return Object.keys(members) as T[];
}

const ESTATES = allOf<Estate>({ bellatores: true, oratores: true, laboratores: true });
const ZODIAC_SIGNS = allOf<ZodiacSign>({
  aries: true, taurus: true, gemini: true, cancer: true, leo: true, virgo: true,
  libra: true, scorpio: true, sagittarius: true, capricorn: true, aquarius: true, pisces: true,
});
const TUTOR_IDS = allOf<TutorId>({ hedge_knight: true, hermit: true, smuggler: true });
const JOB_IDS = allOf<JobId>({ stables: true, alehouse: true, village_watch: true, scriptorium: true });
const REST_IDS = allOf<RestId>({ rest_home: true, bathhouse: true, shrine: true, banquet: true });
const ACTIVITY_IDS: readonly ActivityId[] = [...TUTOR_IDS, ...JOB_IDS, ...REST_IDS];
const LUNAR_PHASES = allOf<LunarPhase>({ new: true, waxing: true, full: true, waning: true });

const ITEM_KINDS = ['consumable', 'equipment'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Which inventory slot each item effect belongs to. */
const ITEM_EFFECT_KIND = {
  reduce_fatigue: 'consumable',
  reduce_melancholy: 'consumable',
  reroll_failed_check: 'consumable',
  reduce_failure_fatigue: 'equipment',
  success_bonus_vs_threat: 'equipment',
  coin_penalty_pct: 'equipment',
} as const satisfies Record<string, ItemKind>;
export type ItemEffect = keyof typeof ITEM_EFFECT_KIND;
const ITEM_EFFECTS = Object.keys(ITEM_EFFECT_KIND) as ItemEffect[];

const PARAMETER_STATUSES = ['confirmed', 'experimental', 'tbd'] as const;
export type ParameterStatus = (typeof PARAMETER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Schema DSL
// ---------------------------------------------------------------------------

interface IntSchema { readonly kind: 'int'; readonly min: number; readonly max: number }
interface BoolSchema { readonly kind: 'bool' }
interface StringSchema { readonly kind: 'string' }
interface EnumSchema<V extends string = string> { readonly kind: 'enum'; readonly values: readonly V[] }
interface NullableSchema<S extends Schema = Schema> { readonly kind: 'nullable'; readonly inner: S }
interface ArraySchema<S extends Schema = Schema> {
  readonly kind: 'array';
  readonly items: S;
  readonly minLength: number;
}
interface ObjectSchema<F extends Readonly<Record<string, Schema>> = Readonly<Record<string, Schema>>> {
  readonly kind: 'object';
  readonly fields: F;
}
/** An object with exactly the given keys, all sharing one value schema. */
interface RecordSchema<K extends string = string, S extends Schema = Schema> {
  readonly kind: 'record';
  readonly keys: readonly K[];
  readonly values: S;
}
/** An object with arbitrary string keys. */
interface MapSchema<S extends Schema = Schema> { readonly kind: 'map'; readonly values: S }

type Schema =
  | IntSchema
  | BoolSchema
  | StringSchema
  | EnumSchema
  | NullableSchema
  | ArraySchema
  | ObjectSchema
  | RecordSchema
  | MapSchema;

type Infer<S> = S extends IntSchema
  ? number
  : S extends BoolSchema
    ? boolean
    : S extends StringSchema
      ? string
      : S extends EnumSchema<infer V>
        ? V
        : S extends NullableSchema<infer I>
          ? Infer<I> | null
          : S extends ArraySchema<infer I>
            ? readonly Infer<I>[]
            : S extends ObjectSchema<infer F>
              ? { readonly [K in keyof F]: Infer<F[K]> }
              : S extends RecordSchema<infer K, infer V>
                ? { readonly [P in K]: Infer<V> }
                : S extends MapSchema<infer V>
                  ? { readonly [key: string]: Infer<V> }
                  : never;

const int = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): IntSchema => ({
  kind: 'int',
  min,
  max,
});
const nonNegative = int(0);
const positive = int(1);
/** Integer percentage multiplier (100 = x1.0). */
const percent = int(0);
const bool: BoolSchema = { kind: 'bool' };
const str: StringSchema = { kind: 'string' };
const oneOf = <V extends string>(values: readonly V[]): EnumSchema<V> => ({ kind: 'enum', values });
const nullable = <S extends Schema>(inner: S): NullableSchema<S> => ({ kind: 'nullable', inner });
const arrayOf = <S extends Schema>(items: S, minLength = 0): ArraySchema<S> => ({
  kind: 'array',
  items,
  minLength,
});
const object = <const F extends Readonly<Record<string, Schema>>>(fields: F): ObjectSchema<F> => ({
  kind: 'object',
  fields,
});
const recordOf = <K extends string, S extends Schema>(keys: readonly K[], values: S): RecordSchema<K, S> => ({
  kind: 'record',
  keys,
  values,
});
const mapOf = <S extends Schema>(values: S): MapSchema<S> => ({ kind: 'map', values });

// ---------------------------------------------------------------------------
// RulesConfig schema
// ---------------------------------------------------------------------------

const burdenPair = object({ fatigue: nonNegative, melancholy: nonNegative });

const rulesConfigSchema = object({
  /** Identifier recorded in reports; variants override it. */
  id: str,
  calendar: object({
    totalWeeks: positive,
    weeksPerMonth: positive,
    /** Zodiac birth-month mapping uses the twelve-month civil year. */
    monthsPerYear: int(12, 12),
    startYear: int(),
    startAge: nonNegative,
    deadlineAge: positive,
  }),
  startingState: object({
    baseStat: nonNegative,
    zodiacBonus: nonNegative,
    zodiacEstate: recordOf(ZODIAC_SIGNS, oneOf(ESTATES)),
    treasury: nonNegative,
    fatigue: nonNegative,
    melancholy: nonNegative,
    statMin: nonNegative,
    statMax: positive,
    treasuryMax: positive,
    /** Item id -> count; used by scenario tests and item variants. */
    startingInventory: mapOf(positive),
  }),
  classes: object({
    tutors: recordOf(
      TUTOR_IDS,
      object({
        target: oneOf(ESTATES),
        gain: nonNegative,
        opposing: oneOf(ESTATES),
        opposingLoss: nonNegative,
        cost: nonNegative,
      }),
    ),
    tutorBurden: recordOf(TUTOR_IDS, burdenPair),
  }),
  jobs: object({
    /** Flat points added to the checked stat before clamping (tech §5). */
    baseSuccessBonus: int(),
    successMin: int(0, 100),
    successMax: int(0, 100),
    definitions: recordOf(
      JOB_IDS,
      object({
        /** Stat checked for success; null means the job always succeeds. */
        checkStat: nullable(oneOf(ESTATES)),
        success: object({
          coin: nonNegative,
          /** Sides of an extra Coin die (0 = none), e.g. Alehouse +d10. */
          coinDie: int(0, UINT32_RANGE),
          gainStat: oneOf(ESTATES),
          gain: nonNegative,
          fatigue: nonNegative,
          melancholy: nonNegative,
        }),
        failure: object({ coin: nonNegative, fatigue: nonNegative, melancholy: nonNegative }),
      }),
    ),
  }),
  /** Burden reductions are stored as positive magnitudes. */
  rest: recordOf(REST_IDS, object({ cost: nonNegative, fatigue: nonNegative, melancholy: nonNegative })),
  astrology: object({
    /** Lunar phase for each week of the month, in order. */
    lunarPhaseByWeek: arrayOf(oneOf(LUNAR_PHASES), 1),
    solar: object({
      /** Month distances from the birth month that trigger each aspect. */
      distances: object({
        return: arrayOf(nonNegative),
        opposition: arrayOf(nonNegative),
        trine: arrayOf(nonNegative),
        square: arrayOf(nonNegative),
      }),
      returnTutorGainPct: percent,
      returnBanquetCostPct: percent,
      oppositionJobBurdenPct: percent,
      trineJobSuccessPts: int(),
      squareTutorGainPct: percent,
      squareTutorMelancholyPct: percent,
    }),
    newMoon: object({
      activities: arrayOf(oneOf(ACTIVITY_IDS)),
      /** Percentage points added to payout/stat-gain multipliers; 0 = off. */
      activityBonus: nonNegative,
      /** Encounter-skip fee in Coin; null = skipping disabled. */
      skipFee: nullable(nonNegative),
    }),
    waxing: object({ mode: oneOf(['single', 'compounding'] as const), bonusPct: percent }),
    fullMoon: object({
      surgeEstates: arrayOf(oneOf(ESTATES)),
      /** Percentage points added to surging home activities; 0 = off. */
      surge: nonNegative,
      advantageMultiplierPct: percent,
      pilgrimageBurdenPenaltyPct: percent,
    }),
    waning: object({ paidRestRecoveryPct: percent, appliesToRestAtHome: bool }),
  }),
  encounters: object({
    /** Relative weights for drawing each threat Estate. */
    distribution: recordOf(ESTATES, nonNegative),
    /** Each Estate's key beats the Estate it maps to. */
    beats: recordOf(ESTATES, oneOf(ESTATES)),
    matchupPct: object({ advantage: percent, neutral: percent, disadvantage: percent }),
    successMin: int(0, 100),
    successMax: int(0, 100),
    rewardCoinDie: int(1, UINT32_RANGE),
    failurePenalty: nonNegative,
  }),
  route: object({
    regularSegments: positive,
    encountersPerSegment: positive,
    finalEncounters: positive,
    /** Road bonus per regular segment; length must equal regularSegments. */
    roadBonus: arrayOf(int(), 1),
    finalRoadBonus: int(),
    departureFee: nonNegative,
  }),
  failure: object({
    retreatLootRetentionPct: int(0, 100),
    retreatToll: nonNegative,
    wipeoutMedicalFeeMax: nonNegative,
    wipeoutConvalescenceWeeks: nonNegative,
    wipeoutBurdenReset: oneOf(['zero', 'unchanged'] as const),
    homeCollapse: object({ forcedWeek: bool, recovery: nonNegative }),
    purseProtection: object({ appliesToLabFailures: bool }),
  }),
  items: object({
    acquisition: oneOf(['disabled', 'test_table'] as const),
    maxEquipment: nonNegative,
    maxConsumables: nonNegative,
    /**
     * Experimental weighted item rewards; sampled only in test_table mode.
     * Weight 0 excludes an item (variants deep-merge maps, so they cannot delete keys).
     */
    testRewardTable: mapOf(nonNegative),
    /** Item id -> definition (from content/items.json). */
    catalog: mapOf(
      object({
        name: str,
        kind: oneOf(ITEM_KINDS),
        effect: oneOf(ITEM_EFFECTS),
        amount: nonNegative,
        /** Approach (or, for threat bonuses, threat) Estate the effect is tied to. */
        estate: nullable(oneOf(ESTATES)),
      }),
    ),
  }),
  /** Dotted config path -> status/note. Unlisted values are confirmed. */
  provenance: mapOf(object({ status: oneOf(PARAMETER_STATUSES), note: str })),
});

export type RulesConfig = Infer<typeof rulesConfigSchema>;
export type ItemDefinition = RulesConfig['items']['catalog'][string];
export type JobDefinition = RulesConfig['jobs']['definitions'][JobId];

export interface UnresolvedParameter {
  readonly path: string;
  readonly status: Exclude<ParameterStatus, 'confirmed'>;
  readonly note: string;
  readonly value: unknown;
}

export class ConfigError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid rules config:\n  ${errors.join('\n  ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function checkSchema(schema: Schema, value: unknown, path: string, errors: string[]): void {
  const at = path === '' ? '(root)' : path;
  switch (schema.kind) {
    case 'int':
      if (!Number.isSafeInteger(value)) {
        errors.push(`${at}: expected an integer`);
      } else if ((value as number) < schema.min || (value as number) > schema.max) {
        errors.push(`${at}: ${value} is outside [${schema.min}, ${schema.max}]`);
      }
      return;
    case 'bool':
      if (typeof value !== 'boolean') errors.push(`${at}: expected a boolean`);
      return;
    case 'string':
      if (typeof value !== 'string') errors.push(`${at}: expected a string`);
      return;
    case 'enum':
      if (typeof value !== 'string' || !schema.values.includes(value)) {
        errors.push(`${at}: expected one of ${schema.values.join(', ')}`);
      }
      return;
    case 'nullable':
      if (value !== null) checkSchema(schema.inner, value, path, errors);
      return;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${at}: expected an array`);
        return;
      }
      if (value.length < schema.minLength) {
        errors.push(`${at}: expected at least ${schema.minLength} entries`);
      }
      value.forEach((item, index) => checkSchema(schema.items, item, `${path}[${index}]`, errors));
      return;
    case 'object':
    case 'record': {
      if (!isPlainObject(value)) {
        errors.push(`${at}: expected an object`);
        return;
      }
      const keys = schema.kind === 'object' ? Object.keys(schema.fields) : schema.keys;
      for (const key of keys) {
        if (!Object.hasOwn(value, key)) {
          errors.push(`${join(path, key)}: missing`);
        } else {
          const fieldSchema = schema.kind === 'object' ? (schema.fields[key] as Schema) : schema.values;
          checkSchema(fieldSchema, value[key], join(path, key), errors);
        }
      }
      for (const key of Object.keys(value)) {
        if (!keys.includes(key)) errors.push(`${join(path, key)}: unknown key`);
      }
      return;
    }
    case 'map':
      if (!isPlainObject(value)) {
        errors.push(`${at}: expected an object`);
        return;
      }
      for (const [key, entry] of Object.entries(value)) {
        checkSchema(schema.values, entry, join(path, key), errors);
      }
      return;
  }
}

function valueAt(root: unknown, path: string): { found: boolean; value: unknown } {
  let current = root;
  for (const key of path.split('.')) {
    if (!isPlainObject(current) || !Object.hasOwn(current, key)) return { found: false, value: undefined };
    current = current[key];
  }
  return { found: true, value: current };
}

/** Cross-field rules that the structural schema cannot express. */
function semanticErrors(config: RulesConfig): string[] {
  const errors: string[] = [];
  const { calendar, startingState, jobs, encounters, route, astrology, items } = config;

  if (calendar.totalWeeks % calendar.weeksPerMonth !== 0) {
    errors.push('calendar.totalWeeks: must be a whole number of months');
  }
  if (calendar.deadlineAge <= calendar.startAge) {
    errors.push('calendar.deadlineAge: must be greater than startAge');
  }
  if (astrology.lunarPhaseByWeek.length !== calendar.weeksPerMonth) {
    errors.push('astrology.lunarPhaseByWeek: length must equal calendar.weeksPerMonth');
  }

  if (startingState.statMin > startingState.statMax) {
    errors.push('startingState.statMin: must not exceed statMax');
  }
  if (
    startingState.baseStat < startingState.statMin ||
    startingState.baseStat + startingState.zodiacBonus > startingState.statMax
  ) {
    errors.push('startingState.baseStat: base stat plus zodiac bonus must lie within [statMin, statMax]');
  }
  if (startingState.treasury > startingState.treasuryMax) {
    errors.push('startingState.treasury: must not exceed treasuryMax');
  }
  for (const itemId of Object.keys(startingState.startingInventory)) {
    if (!Object.hasOwn(items.catalog, itemId)) {
      errors.push(`startingState.startingInventory.${itemId}: unknown item`);
    }
  }

  for (const [tutorId, tutor] of Object.entries(config.classes.tutors)) {
    if (tutor.target === tutor.opposing) {
      errors.push(`classes.tutors.${tutorId}: target and opposing stat must differ`);
    }
  }

  for (const [section, range] of [
    ['jobs', jobs],
    ['encounters', encounters],
  ] as const) {
    if (range.successMin > range.successMax) errors.push(`${section}.successMin: must not exceed successMax`);
  }

  const beaten = Object.entries(encounters.beats);
  if (beaten.some(([estate, target]) => estate === target)) {
    errors.push('encounters.beats: an Estate cannot beat itself');
  }
  if (new Set(beaten.map(([, target]) => target)).size !== ESTATES.length) {
    errors.push('encounters.beats: each Estate must be beaten by exactly one other');
  }
  const threatWeight = Object.values(encounters.distribution).reduce((sum, weight) => sum + weight, 0);
  if (!Number.isSafeInteger(threatWeight) || threatWeight <= 0 || threatWeight > UINT32_RANGE) {
    errors.push('encounters.distribution: total weight must be in [1, 2^32]');
  }

  if (route.roadBonus.length !== route.regularSegments) {
    errors.push(
      `route.roadBonus: has ${route.roadBonus.length} entries but route.regularSegments is ${route.regularSegments}`,
    );
  }

  const seenDistances = new Map<number, string>();
  for (const [aspect, distances] of Object.entries(astrology.solar.distances)) {
    for (const distance of distances) {
      if (distance >= calendar.monthsPerYear) {
        errors.push(`astrology.solar.distances.${aspect}: ${distance} is not a valid month distance`);
      }
      const other = seenDistances.get(distance);
      if (other !== undefined) {
        errors.push(`astrology.solar.distances.${aspect}: ${distance} is already used by ${other}`);
      }
      seenDistances.set(distance, aspect);
    }
  }

  for (const [itemId, item] of Object.entries(items.catalog)) {
    if (ITEM_EFFECT_KIND[item.effect] !== item.kind) {
      errors.push(`items.catalog.${itemId}: effect ${item.effect} requires kind ${ITEM_EFFECT_KIND[item.effect]}`);
    }
    if (item.kind === 'equipment' && item.estate === null) {
      errors.push(`items.catalog.${itemId}: equipment effects need an estate`);
    }
  }

  for (const itemId of Object.keys(items.testRewardTable)) {
    if (!Object.hasOwn(items.catalog, itemId)) {
      errors.push(`items.testRewardTable.${itemId}: unknown item`);
    }
  }
  const rewardWeight = Object.values(items.testRewardTable).reduce((sum, weight) => sum + weight, 0);
  if (items.acquisition === 'test_table' && rewardWeight === 0) {
    errors.push('items.testRewardTable: total weight must be positive when acquisition is test_table');
  }
  if (!Number.isSafeInteger(rewardWeight) || rewardWeight > UINT32_RANGE) {
    errors.push('items.testRewardTable: total weight must fit in the RNG range (2^32)');
  }

  for (const path of Object.keys(config.provenance)) {
    if (path === 'provenance' || path.startsWith('provenance.') || !valueAt(config, path).found) {
      errors.push(`provenance.${path}: does not name a config value`);
    }
  }

  return errors;
}

/** Returns every problem found in `value`; an empty list means it is a valid RulesConfig. */
export function validateConfig(value: unknown): string[] {
  const errors: string[] = [];
  checkSchema(rulesConfigSchema, value, '', errors);
  return errors.length > 0 ? errors : semanticErrors(value as RulesConfig);
}

// ---------------------------------------------------------------------------
// Loading and variants
// ---------------------------------------------------------------------------

/** Deep-merges plain objects; arrays and scalars in the overlay replace the base. */
function mergeOverlay(base: unknown, overlay: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay;
  const keys = new Set([...Object.keys(base), ...Object.keys(overlay)]);
  // Object.fromEntries defines own properties, so a "__proto__" key cannot touch prototypes.
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      Object.hasOwn(overlay, key) ? mergeOverlay(base[key], overlay[key]) : base[key],
    ]),
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export interface ConfigSources {
  /** Parsed content/rules.default.json (without an items catalog). */
  readonly rules: unknown;
  /** Parsed content/items.json: item id -> definition. */
  readonly items: unknown;
  /** Parsed variant overlays, applied in order on top of the rules. */
  readonly variants?: readonly unknown[];
}

/**
 * Builds a validated, frozen RulesConfig: rules + items catalog, then each
 * variant overlay merged on top. Throws ConfigError listing every problem.
 */
export function loadConfig({ rules, items, variants = [] }: ConfigSources): RulesConfig {
  for (const [label, part] of [['rules', rules], ['items', items], ...variants.map((v, i) => [`variants[${i}]`, v])] as const) {
    if (!isPlainObject(part)) throw new ConfigError([`${label}: expected a JSON object`]);
  }
  let merged = mergeOverlay(rules, { items: { catalog: items } });
  for (const variant of variants) merged = mergeOverlay(merged, variant);

  const errors = validateConfig(merged);
  if (errors.length > 0) throw new ConfigError(errors);
  return deepFreeze(merged as RulesConfig);
}

/** Applies variant overlays to an already-loaded config (handy for scenario tests). */
export function withOverrides(config: RulesConfig, ...variants: readonly unknown[]): RulesConfig {
  let merged: unknown = config;
  for (const variant of variants) {
    if (!isPlainObject(variant)) throw new ConfigError(['variant: expected a JSON object']);
    merged = mergeOverlay(merged, variant);
  }
  const errors = validateConfig(merged);
  if (errors.length > 0) throw new ConfigError(errors);
  return deepFreeze(merged as RulesConfig);
}

// ---------------------------------------------------------------------------
// Unresolved-parameter register
// ---------------------------------------------------------------------------

/** Every non-confirmed parameter with its current value, sorted by path. */
export function getUnresolved(config: RulesConfig): UnresolvedParameter[] {
  return Object.entries(config.provenance)
    .filter((entry): entry is [string, { status: UnresolvedParameter['status']; note: string }] =>
      entry[1].status !== 'confirmed',
    )
    .map(([path, { status, note }]) => ({ path, status, note, value: valueAt(config, path).value }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** JSON with object keys sorted recursively, so key order never affects the output. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/** FNV-1a 64-bit over UTF-8 bytes, as 16 lowercase hex digits. */
export function fnv1a64(text: string): string {
  let hash = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash = ((hash ^ BigInt(byte)) * FNV64_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Stable identifier for a config: FNV-1a 64 of its canonical JSON. */
export function hashConfig(config: RulesConfig): string {
  return fnv1a64(canonicalJson(config));
}
