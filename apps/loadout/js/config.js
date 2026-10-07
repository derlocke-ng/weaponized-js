export const APP_NAME = 'Loadout';

// Relays only pass signed and (for private boards) encrypted data around; the
// kiwi-network relays come first because they are self-hosted.
export const DEFAULT_RELAYS = [
  'https://gun.kiwi-network.eu/herbhub-relay/gun',
  'https://gun2.kiwi-network.eu/herbhub-relay/gun',
  'https://gun.defucc.me/gun',
  'https://gun.o8.is/gun',
  'https://relay.peer.ooo/gun',
];

// Name of gun's IndexedDB store, so we never mix with other gun apps that share
// the github.io origin.
export const STORE_FILE = 'loadout';

// Paths inside a board's user graph (~<board pub>) that editors may write.
export const BOARD_PATHS = ['meta', 'items', 'doc'];

export const LIMITS = {
  title: 120,
  doc: 200_000,
};
