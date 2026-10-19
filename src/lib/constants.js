// Ported from App.Formulas in the Power App (reference/powerapp-src/App.pa.yaml).

export const MIN_LEAD_DAYS = 3;        // nfMinLeadDays
export const CUTOFF_HOUR = 15;         // nfCutOffHour
export const AO_TURNAROUND_HOURS = 24; // nfAOTurnaroundHours
// Buyer scorecard targets (new; not in the Power App). Change here if the team agrees other SLAs.
export const BUYER_PICKUP_HOURS = 24;  // a buyer accepts a locked brief within this many hours
export const BUYER_SETUP_HOURS = 48;   // average Lock → set up in DV360

export const ROLES = ['Planner', 'Ad Ops', 'Gatekeeper', 'Buyer', 'Admin'];
export const AD_OPS_ROLES = ['Ad Ops', 'Admin'];        // nfIsAdOps
export const GATE_ROLES = ['Gatekeeper', 'Buyer', 'Admin']; // nfIsGate

export const STATUSES = ['Draft', 'Returned', 'With Ad Ops', 'With Gatekeeper', 'Locked', 'In set-up', 'Set up', 'Cancelled'];
export const LOCKED_STATUSES = ['Locked', 'In set-up', 'Set up'];

export const OBJS = [
  { name: 'Raise_awareness_of_my_brand_or_product', abv: 'aw' },
  { name: 'Drive_online_action_or_visits', abv: 'cva' },
  { name: 'Drive_offline_or_instore_sales', abv: 'cvo' },
  { name: 'Drive_app_installs_or_engagements', abv: 'cons' },
  { name: 'PerfOfflineSales_US_Only', abv: 'cvo-us' },
];

export const DEVICES = [
  { name: 'All', abv: 'all' }, { name: 'Connected TV', abv: 'CTV' }, { name: 'Desktop', abv: 'Desk' },
  { name: 'DOOH', abv: 'DOOH' }, { name: 'Mobile', abv: 'Mob' }, { name: 'Tablet', abv: 'Tab' },
];

export const SUST = [
  { name: 'No optimisation', abv: 'na' },
  { name: 'Creative weight optimized', abv: 'cwopt' },
  { name: 'Wifi Targeting', abv: 'wifitg' },
  { name: 'Both Creative weight optimized & Wifi targeting', abv: 'cwopt-wifitg' },
];

export const LANGS = [
  { name: 'ALL', abv: 'ALL' }, { name: 'Thai', abv: 'TH' }, { name: 'English', abv: 'EN' }, { name: 'Chinese', abv: 'ZH' },
  { name: 'Japanese', abv: 'JA' }, { name: 'Korean', abv: 'KO' }, { name: 'Burmese', abv: 'MY' }, { name: 'Malay', abv: 'MS' },
  { name: 'Vietnamese', abv: 'VI' }, { name: 'Laothian', abv: 'LO' }, { name: 'Cambodian', abv: 'KM' }, { name: 'Indonesian', abv: 'IN' },
];

export const AUDS = [
  { name: 'Combined 1P (1P + LAL)', abv: 'Combined 1P', type: '1P' },
  { name: '1P Cookies (Google Analytics)', abv: 'Cookies', type: '1P' },
  { name: '1P Cookies (Floodlights)', abv: 'Cookies', type: '1P' },
  { name: '1P Cookies LAL', abv: 'Cookies LAL', type: '1P' },
  { name: '1P PII CRM', abv: 'CRM', type: '1P' },
  { name: '1P PII CRM LAL', abv: 'CRM LAL', type: '1P' },
  { name: '1P Cross Brand', abv: 'Cross Brand', type: '1P' },
  { name: '2P LAL', abv: '2P LAL', type: '2P' },
  { name: '2P-Publisher', abv: '2P-Publisher', type: '2P' },
  { name: '2P Retail', abv: '2P Retail', type: '2P' },
  { name: 'Affinity Audiences', abv: 'Affinity', type: '2P' },
  { name: 'Bid Manager Audiences', abv: 'Bid Manager', type: '2P' },
  { name: 'Category targeting', abv: 'Category', type: '2P' },
  { name: 'Custom lists (Custom Affinity or Custom Intent)', abv: 'Custom lists', type: '2P' },
  { name: 'Combined 2P (2P + LAL)', abv: 'Combined 2P', type: '2P' },
  { name: 'Contextual targeting 2P', abv: 'Contextual 2P', type: '2P' },
  { name: 'Demographics Audiences', abv: 'Demographics', type: '2P' },
  { name: 'In-market Audiences', abv: 'In-Market', type: '2P' },
  { name: 'Keyword targeting', abv: 'Keyword', type: '2P' },
  { name: 'Life Events audiences', abv: 'Life Events', type: '2P' },
  { name: 'Viewed any video from a channel', abv: 'YT viewers', type: '2P' },
  { name: 'Viewed certain videos', abv: 'YT viewers', type: '2P' },
  { name: 'Viewed any video (as an ad) from a channel', abv: 'YT viewers', type: '2P' },
  { name: 'Viewed certain videos (as ads)', abv: 'YT viewers', type: '2P' },
  { name: 'Subscribed to a channel', abv: 'YT susbcribers', type: '2P' },
  { name: 'Visited a channel homepage', abv: 'YTC visit', type: '2P' },
  { name: 'Liked any video from a channel', abv: 'YT video like', type: '2P' },
  { name: 'Added any video from a channel to a playlist', abv: 'YTC add', type: '2P' },
  { name: 'Shared any video from a channel', abv: 'YTC share', type: '2P' },
  { name: 'Contextual targeting 3P', abv: 'Contextual 3P', type: '3P' },
  { name: '3P Audiences', abv: 'Audiences', type: '3P' },
  { name: '3P Custom Audiences', abv: 'Custom', type: '3P' },
  { name: 'Any audiences built off 3P data', abv: 'Audiences', type: '3P' },
];

export const CATS = [
  ['fragrance', 'frag'], ['fragrance-women', 'fraw'], ['fragrance-men', 'fram'], ['fragrance-home', 'frah'],
  ['hair', 'hair'], ['hair-care', 'haca'], ['hair-color', 'haco'], ['hair-texture', 'hate'], ['hair-styling', 'hast'],
  ['hair-tool', 'hato'], ['hygiene', 'hygi'], ['hygiene-bath', 'hyba'], ['hygiene-deodorants', 'hyde'],
  ['hygiene-shaving', 'hysh'], ['hygiene-men', 'hyme'], ['make-up', 'make'], ['make-up-eye', 'maky'],
  ['make-up-face', 'makf'], ['make-up-lip', 'makl'], ['make-up-nail', 'makn'], ['oral-cosmetics', 'oral'],
  ['oral-cosmetics-sundries-cosmetic-devices', 'ocsc'], ['oral-cosmetics-sundries-oral-cosmetics', 'ocso'],
  ['oral-cosmetics-sundries-sundries', 'ocss'], ['skin-care', 'skin'], ['skin-care-face-caring', 'skfc'],
  ['skin-care-body-caring', 'skbc'], ['skin-care-face-cleansing', 'skcl'], ['skin-care-instrumental-cosmetics', 'skic'],
  ['skin-care-men', 'skme'], ['skin-care-sun', 'sksu'], ['treatment', 'treat'], ['treatment-face', 'trfc'],
  ['treatment-body', 'trbc'], ['treatment-aftersun', 'tras'], ['treatment-sun', 'trsu'], ['treatment-men', 'trme'],
  ['baby-care', 'bbca'], ['multi', 'multi'], ['all', 'all'], ['other', 'othr'], ['branded', 'brde'],
  ['brand-purpose', 'brpu'], ['brand-cause', 'brca'], ['brand-identity', 'brid'], ['miscellaneous', 'misc'],
  ['services', 'serv'], ['cosmetic-devices', 'cosde'], ['CA&E', 'CA&E'], ['Sustainability', 'Sustainability'],
].map(([name, abv]) => ({ name, abv }));

// Dropdown choices, as in the Power App controls.
export const OPT = {
  team: ['CPD', 'Non-CPD'],
  objective: ['Awareness', 'Consideration', 'Action'],
  kpiModel: ['CPM', 'CPV', 'CPC', 'CPA', 'CPCV'],
  briefType: ['New', 'Extension', 'Update'],
  yesNo: ['No', 'Yes'],
  channel: ['YouTube', 'Non-YouTube'],
  ioType: ['Video', 'Display', 'TrueView', 'Audio', 'DOOH'],
  ytFormats: ['VRC', 'VVC', 'Non-skip', 'Bumper', 'Shorts'],
  otherFormats: ['Display', 'Video', 'Audio', 'CTV / OTT', 'Native'],
  pacing: ['Even', 'ASAP', 'Ahead'],
  buyingType: ['Open auction', 'PG', 'PMP'],
  ioKpi: ['CPV', 'CPM', 'Viewability', 'CPIAVC', 'CPA', 'CPC', 'CTR'],
  freqPeriod: ['Day', 'Week', 'Month', 'Lifetime'],
  bidStrategy: ['Target CPM', 'Target CPV', 'Max CPM', 'Fixed CPM', 'Maximize conversions', 'Target CPA'],
  dealType: ['OpenEx', 'Other', 'Preferred deals', 'Private auction', 'Programmatic Guaranteed', 'Tag based', 'Youtube'],
  ytLiType: ['bumper', 'dco', 'demand gen', 'director mix', 'discovery', 'display', 'for-reach', 'for-shopping', 'in-feed',
    'in-stream skip', 'in-stream non-skip', 'masthead', 'outstream', 'video-action', 'video-reach', 'video-view',
    'vto-instream', 'youtube-short'],
  gender: ['M-W', 'W', 'M'],
  environment: ['All', 'App', 'Web'],
  serviceDisc: ['NO', 'YES'],
  assetSource: ['DMI', 'DMIedit', 'Local', 'Influencer-Creator', 'Consumer'],
  ctaCode: ['ADD-TO-CART', 'BOOK-NOW', 'BUY', 'BUY-NOW', 'CALL', 'CALL-ME', 'CONTACT-US', 'CONTEST', 'COUPON',
    'DISCOVER-NOW', 'DONATE', 'DONATE-NOW', 'DOWNLOAD', 'EVENT-RSVP', 'GET-DIRECTIONS', 'GET-OFFER', 'INSTALL-APP',
    'KNOW-MORE', 'LEARN-MORE', 'LIKE-PAGE', 'NO-BUTTON', 'OPEN-LINK', 'ORDER-NOW', 'OTHER', 'PLAY-GAME',
    'PRODUCT-TEST', 'RATINGS-REVIEW', 'SAMPLE-REQUEST', 'SHARE', 'SHOP-NOW', 'SIGN-UP', 'SUBSCRIBE', 'UPDATE-APP',
    'WATCH-MORE', 'WATCH-VIDEO'],
  skippable: ['skip', 'unskip', 'multi', 'display'],
  adBuyingType: ['DirectBuying', 'Programmatic', 'ProgrammaticDeal', 'Other'],
  rotation: ['no', 'sequential', 'even', 'custom', 'optimized'],
  redirect: ["L'Oréal D2C", "L'Oréal non-D2C", 'E-retailers', 'Others', 'None'],
  action: ['New', 'Update', 'Pause', 'No change'],
  changeType: [
    'Major: budget, audience, flight, KPI, buying type or test design',
    'Minor: same-spec creative swap or landing URL fix',
  ],
};

// brADFmt.Items: ad format choices depend on the IO channel and type.
export function adFormatOptions(channel, ioType) {
  if (channel === 'YouTube') return [...OPT.ytLiType, 'VideoLandScape', 'VideoSquare', 'VideoPortrait'];
  switch (ioType) {
    case 'Video': return ['VideoLandScape', 'VideoSquare', 'VideoPortrait'];
    case 'Audio': return ['Audio'];
    case 'TrueView': return [...OPT.ytLiType];
    default: return ['300x250', '728x90', '160x600', '300x600', '970x250', '320x50', '320x100', '320x480', '336x280',
      '970x90', 'nativead', 'interstitial', 'takeover', 'masthead', 'richmedia'];
  }
}

// YouTube line item type that goes with each YouTube format.
export function ytTypeForFormat(f) {
  switch (f) {
    case 'VRC': return 'for-reach';
    case 'VVC': return 'video-view';
    case 'Non-skip': return 'in-stream non-skip';
    case 'Bumper': return 'bumper';
    case 'Shorts': return 'youtube-short';
    default: return 'for-reach';
  }
}
