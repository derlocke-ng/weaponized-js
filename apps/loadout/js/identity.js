// Your key, as the site keeps it (shared/account.js). Signing in and out
// happens on the site's settings page; Loadout only reads the result.

import * as account from '../../shared/account.js';
import { fingerprint } from '../../shared/events.js';

export const { loadIdentity, saveIdentity, npub } = account;
export { fingerprint };
