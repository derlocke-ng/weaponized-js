// Loadout's own account settings (kind 30791, d = 'loadout'): the starters
// and their templates. The mechanics live in shared/settings.js.

import { AccountSettings } from '../../shared/settings.js';
import { pool, db, sync } from './net.js';

export class Settings extends AccountSettings {
  constructor(identity) {
    super(identity, { pool, db, sync }, 'loadout');
  }
}
