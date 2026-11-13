/** Policy registry used by the CLI. E3 policy families register here by id. */
import type { Policy } from './runner.js';

/** Builds a fresh policy; per-run state (if any) must live in the returned object. */
export type PolicyFactory = () => Policy;

/** Registered policies, keyed by the id used with `--policy`. Populated by E3. */
export const POLICIES: Readonly<Record<string, PolicyFactory>> = {};
