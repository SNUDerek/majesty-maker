/** Public API of the Hidden Scion rules engine (tech §9). */
export { applyAction, createCampaign, getAvailableActions } from './reducer.js';
export { getCalendar } from './calendar.js';
export { getDerivedStats } from './derived.js';
export {
  previewApproaches,
  previewHomeActivity,
  type ActivityOutcome,
  type ApproachPreview,
  type EncounterOdds,
  type FailurePenalty,
  type HomePreview,
} from './preview.js';
export {
  ConfigError,
  getUnresolved,
  hashConfig,
  loadConfig,
  validateConfig,
  withOverrides,
  type ConfigSources,
  type RulesConfig,
  type UnresolvedParameter,
} from './config.js';
export * from './types.js';
