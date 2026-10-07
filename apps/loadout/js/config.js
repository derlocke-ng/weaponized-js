export const APP_NAME = 'Loadout';

export { DEFAULT_RELAYS } from '../../shared/relays.js';

export const LIMITS = {
  title: 120,
  // Notes are one encrypted, gzipped event each; this keeps them under relay
  // message limits with room to spare.
  doc: 60_000,
};
