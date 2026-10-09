// The distribution: everything a fork changes and the framework never
// hardcodes. This file belongs to the distribution (today weaponized.js),
// not to the framework; when the two split, it stays with the distribution.
// Everything that shows the hub's name, its default relays or its apps reads
// it. The model is in docs/architecture.md, "Framework, distributions, apps".
//
//   mounts   what the start page and the switcher show: app code (apps.js)
//            mounted on a space. A mount may rename the app and change its
//            icon; the id is this hub's route (<id>/) and the i18n key of
//            its card text (hub.<id>.text). Core apps (settings, chat) need
//            no mount. `space` is the community a feed or market serves;
//            null until spaces exist (see the architecture document).
//   policy   userMounts: may a user follow a space this hub does not ship?
export const DISTRIBUTION = {
  id: 'weaponized',
  name: 'weaponized.js',
  shortName: 'weaponized',
  brandHtml: 'weaponized<span class="wjs-brand-ext">.js</span>',
  homepage: 'https://derlocke-ng.github.io/weaponized-js/',
  repo: 'https://github.com/derlocke-ng/weaponized-js',
  relays: ['wss://nos.lol', 'wss://relay.damus.io', 'wss://nostr.mom', 'wss://relay.primal.net'],
  policy: { userMounts: false },
  mounts: [
    { id: 'loadout', app: 'loadout', featured: true, isNew: true },
    { id: 'payload', app: 'payload' },
    { id: 'pongjs', app: 'pongjs' },
    { id: 'devboard', app: 'devboard', space: null, isNew: true },
    { id: 'enigmajs', app: 'enigmajs' },
  ],
};
