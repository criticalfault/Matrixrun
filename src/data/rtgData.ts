import type { RTGEntry, SubsystemRatings } from '@/types';

function rtg(
  id: string, name: string, region: string, code: string,
  sec: string, access: number, control: number, index: number, files: number, slave: number,
): RTGEntry {
  const match = sec.match(/^(Blue|Green|Orange|Red|UV)-(\d+)$/);
  if (!match) throw new Error(`Bad security string: ${sec}`);
  const subsystems: SubsystemRatings = { access, control, index, files, slave };
  return {
    id, name, region, code,
    securityCode: match[1] as RTGEntry['securityCode'],
    securityValue: parseInt(match[2]),
    subsystems,
  };
}

// ─── North American RTGs ──────────────────────────────────────────────────────

const NORTH_AMERICA: RTGEntry[] = [
  // California Free State
  rtg('na-cfs-noc', 'California Free State North', 'North America', 'NA/CFS-N', 'Green-4', 5, 6, 6, 6, 6),
  rtg('na-cfs-soc', 'California Free State South', 'North America', 'NA/CFS-S', 'Green-4', 6, 8, 7, 6, 7),
  // Confederated American States
  rtg('na-cas-ce',  'CAS Central',   'North America', 'NA/CAS-CE', 'Green-3', 6, 8, 7, 8, 7),
  rtg('na-cas-gu',  'CAS Gulf',      'North America', 'NA/CAS-GU', 'Green-3', 6, 8, 6, 8, 8),
  rtg('na-cas-sb',  'CAS Seaboard',  'North America', 'NA/CAS-SB', 'Green-3', 6, 8, 7, 8, 8),
  rtg('na-cas-tx',  'CAS Texas',     'North America', 'NA/CAS-TX', 'Green-3', 6, 8, 7, 8, 8),
  // Denver
  rtg('na-den',    'Denver',        'North America', 'NA/DEN',    'Orange-4', 8, 9, 7, 6, 6),
  // NAN Member States
  rtg('na-nan-alm', 'Algonkian-Manitou', 'North America', 'NA/ALM', 'Green-4', 7, 8, 7, 6, 6),
  rtg('na-nan-ath', 'Athabascan',        'North America', 'NA/ATH', 'Green-3', 6, 8, 6, 6, 6),
  rtg('na-nan-pue', 'Pueblo Council',    'North America', 'NA/PUE', 'Orange-5', 7, 8, 7, 7, 7),
  rtg('na-nan-sls', 'Salish-Shidhe',     'North America', 'NA/SLS', 'Green-3', 6, 8, 7, 6, 6),
  rtg('na-nan-sio', 'Sioux Nation',      'North America', 'NA/SIO', 'Orange-3', 7, 8, 6, 7, 7),
  rtg('na-nan-tpa', 'Trans-Polar Aleut', 'North America', 'NA/TPA', 'Green-2', 6, 7, 6, 7, 6),
  rtg('na-nan-ute', 'Ute Nation',        'North America', 'NA/UTE', 'Orange-3', 7, 8, 6, 7, 7),
  // Other NA nations
  rtg('na-que', 'Québec',      'North America', 'NA/QU', 'Green-2', 6, 8, 8, 7, 7),
  rtg('na-tir', 'Tír Tairngire','North America','NA/TT', 'Green-2', 7, 8, 8, 7, 7),
  rtg('na-tsi', 'Tsimshian',   'North America', 'NA/TS', 'Orange-4', 8, 8, 8, 8, 8),
  // UCAS
  rtg('na-ucas-mw', 'UCAS Midwest',       'North America', 'NA/UCAS-MW', 'Green-4', 7, 7, 6, 6, 6),
  rtg('na-ucas-ne', 'UCAS Northeast',     'North America', 'NA/UCAS-NE', 'Green-3', 6, 8, 7, 6, 6),
  rtg('na-ucas-nc', 'UCAS North Central', 'North America', 'NA/UCAS-NC', 'Green-4', 6, 8, 6, 6, 6),
  rtg('na-ucas-sea','Seattle',            'North America', 'NA/SEA',     'Green-5', 9, 9, 6, 8, 6),
  rtg('na-ucas-so', 'UCAS South',         'North America', 'NA/UCAS-SO', 'Green-4', 7, 8, 6, 6, 6),
  rtg('na-ucas-we', 'UCAS West',          'North America', 'NA/UCAS-WE', 'Green-4', 6, 8, 8, 6, 6),
];

// ─── African & Asian RTGs ─────────────────────────────────────────────────────

const AFRICA_ASIA: RTGEntry[] = [
  rtg('af-asa', 'Asante Nation',            'Africa/Asia', 'AF/ASA', 'Blue-2',   3, 5, 4, 3, 3),
  rtg('af-bau', 'Baule Empire',             'Africa/Asia', 'AF/BAU', 'Blue-3',   4, 5, 4, 3, 3),
  rtg('as-can', 'Canton Confederation',     'Africa/Asia', 'AS/CAN', 'Green-4',  6, 7, 5, 6, 6),
  rtg('as-kro', 'Free City of Kronstadt',   'Africa/Asia', 'AS/KRO', 'Orange-3', 7, 6, 4, 6, 6),
  rtg('as-gua', 'Guangxi',                  'Africa/Asia', 'AS/GUA', 'Blue-3',   4, 4, 4, 4, 2),
  rtg('as-hk',  'Hong Kong',                'Africa/Asia', 'AS/HK',  'Orange-6', 8, 9, 8, 7, 7),
  rtg('as-kor', 'Korea',                    'Africa/Asia', 'AS/KOR', 'Green-4',  7, 8, 7, 7, 7),
  rtg('as-man', 'Manchuria',                'Africa/Asia', 'AS/MAN', 'Green-2',  5, 6, 4, 4, 3),
  rtg('as-eas', 'Russia East',              'Africa/Asia', 'AS/RUS-EAS', 'Green-2',  4, 5, 5, 5, 5),
  rtg('as-mos', 'Russia Moscow',            'Africa/Asia', 'AS/RUS-MOS', 'Orange-2', 7, 6, 5, 6, 6),
  rtg('as-sib', 'Russia Siberia',           'Africa/Asia', 'AS/RUS-SIB', 'Green-2',  4, 5, 4, 5, 5),
  rtg('as-vla', 'Russia Vladivostok',       'Africa/Asia', 'AS/RUS-VLA', 'Orange-2', 7, 6, 5, 6, 6),
  rtg('as-yak', 'Yakut',                    'Africa/Asia', 'AS/YAK', 'Blue-2',   3, 3, 2, 2, 2),
];

// ─── Central/South American RTGs ─────────────────────────────────────────────

const CENTRAL_SOUTH_AMERICA: RTGEntry[] = [
  // Amazonia
  rtg('sa-ama-ce', 'Amazonia Central', 'Central/South America', 'SA/AMA-CE', 'Green-6', 9, 8, 8, 8, 7),
  rtg('sa-ama-no', 'Amazonia North',   'Central/South America', 'SA/AMA-NO', 'Green-6', 9, 8, 8, 5, 5),
  rtg('sa-ama-su', 'Amazonia South',   'Central/South America', 'SA/AMA-SU', 'Green-6', 9, 8, 5, 8, 8),
  rtg('sa-ven',    'Venezuela',        'Central/South America', 'SA/VEN',    'Green-3', 4, 4, 3, 3, 4),
  // Aztlan
  rtg('ca-az-ba', 'Aztlan Baja California', 'Central/South America', 'CA/AZ-BA', 'Orange-3', 8, 8, 5, 7, 7),
  rtg('ca-az-ce', 'Aztlan Central',         'Central/South America', 'CA/AZ-CE', 'Orange-5', 8, 8, 5, 7, 7),
  rtg('ca-az-no', 'Aztlan North',           'Central/South America', 'CA/AZ-NO', 'Orange-5', 9, 8, 6, 7, 7),
  rtg('ca-az-su', 'Aztlan South',           'Central/South America', 'CA/AZ-SU', 'Orange-5', 8, 8, 6, 7, 7),
  rtg('ca-az-yu', 'Aztlan Yucatan',         'Central/South America', 'CA/AZ-YU', 'Orange-3', 9, 8, 6, 7, 7),
  // Caribbean League
  rtg('ca-cl-ber', 'Caribbean Bermuda',     'Central/South America', 'CA/CL-BER', 'Green-2', 6, 6, 6, 6, 6),
  rtg('ca-cl-cu',  'Caribbean Cuba',        'Central/South America', 'CA/CL-CU',  'Green-4', 8, 8, 7, 7, 8),
  rtg('ca-cl-gr',  'Caribbean Grenada',     'Central/South America', 'CA/CL-GR',  'Orange-4', 8, 8, 8, 7, 7),
  rtg('ca-cl-ja',  'Caribbean Jamaica',     'Central/South America', 'CA/CL-JA',  'Green-3', 6, 7, 6, 6, 6),
  rtg('ca-cl-fla', 'South Florida',         'Central/South America', 'CA/CL-FLA', 'Green-2', 6, 8, 7, 6, 6),
  rtg('ca-cl-vi',  'Virgin Islands',        'Central/South America', 'CA/CL-VI',  'Green-2', 6, 8, 7, 6, 6),
  rtg('sa-per',    'Peru',                  'Central/South America', 'SA/PER',    'Orange-4', 8, 7, 7, 7, 7),
];

// ─── European RTGs ────────────────────────────────────────────────────────────

const EUROPE: RTGEntry[] = [
  // Allied German States
  rtg('eu-adl-bp',  'Badensian Palatinate',           'Europe', 'EU/ADL-BP',  'Green-4',  6, 8, 6, 6, 6),
  rtg('eu-adl-bav', 'Bavaria',                         'Europe', 'EU/ADL-BAV', 'Green-4',  6, 7, 6, 6, 6),
  rtg('eu-adl-ber', 'Berlin',                          'Europe', 'EU/ADL-BER', 'Orange-4', 6, 8, 7, 7, 7),
  rtg('eu-adl-bra', 'Brandenburg',                     'Europe', 'EU/ADL-BRA', 'Green-4',  6, 8, 6, 6, 6),
  rtg('eu-adl-pom', 'Duchy of Pomorp',                 'Europe', 'EU/ADL-POM', 'Orange-5', 8, 10, 9, 9, 9),
  rtg('eu-adl-fra', 'Franconia',                       'Europe', 'EU/ADL-FRA', 'Green-3',  6, 8, 6, 6, 6),
  rtg('eu-adl-ham', 'Free City of Hamburg',            'Europe', 'EU/ADL-HAM', 'Orange-4', 6, 8, 6, 7, 6),
  rtg('eu-adl-gfr', 'Greater Frankfurt',               'Europe', 'EU/ADL-GFR', 'Green-3',  6, 8, 6, 6, 6),
  rtg('eu-adl-hn',  'Hessen-Nassau',                   'Europe', 'EU/ADL-HN',  'Green-4',  6, 8, 6, 6, 6),
  rtg('eu-adl-mar', 'Marienbad League',                'Europe', 'EU/ADL-MAR', 'Green-3',  6, 8, 6, 6, 6),
  rtg('eu-adl-ndb', 'North German League',             'Europe', 'EU/ADL-NDB', 'Green-3',  6, 8, 6, 6, 6),
  rtg('eu-adl-nr',  'North Rhine-Ruhr',                'Europe', 'EU/ADL-NR',  'Green-4',  6, 8, 6, 6, 6),
  rtg('eu-adl-sax', 'Saxony',                          'Europe', 'EU/ADL-SAX', 'Green-3',  6, 8, 7, 6, 6),
  rtg('eu-adl-thu', 'Thüringen',                       'Europe', 'EU/ADL-THU', 'Green-3',  6, 8, 6, 6, 6),
  rtg('eu-adl-ksw', 'Troll Kingdom of the Black Forest','Europe','EU/ADL-KSW', 'Green-4',  6, 8, 6, 6, 6),
  rtg('eu-adl-wes', 'Westphalia',                      'Europe', 'EU/ADL-WES', 'Orange-3', 6, 8, 6, 6, 6),
  rtg('eu-adl-wl',  'Westrhine-Luxembourg',            'Europe', 'EU/ADL-WL',  'Green-4',  7, 8, 7, 7, 6),
  rtg('eu-adl-wur', 'Württemberg',                     'Europe', 'EU/ADL-WUR', 'Green-4',  6, 8, 6, 6, 6),
  // Austria
  rtg('eu-ac',  'Austria Central',          'Europe', 'EU/AC',  'Green-4',  8, 8, 6, 6, 7),
  rtg('eu-aw',  'Austria West',             'Europe', 'EU/AW',  'Orange-5', 8, 10, 7, 7, 7),
  rtg('eu-fsk', 'Free State of Königsberg', 'Europe', 'EU/FSK', 'Red-4',    9, 9, 7, 9, 7),
  rtg('eu-uk',  'Great Britain',            'Europe', 'EU/UK',  'Orange-5', 7, 8, 7, 9, 7),
  rtg('eu-por', 'Portugal',                 'Europe', 'EU/POR', 'Green-3',  6, 7, 5, 7, 6),
  rtg('eu-se',  'Swiss Confederation',      'Europe', 'EU/SE',  'Orange-5', 7, 9, 8, 7, 8),
  rtg('eu-csf', 'Swiss-French Confederation','Europe','EU/CSF', 'Green-3',  6, 8, 7, 6, 6),
  rtg('eu-tno', 'Tír na nÓg',              'Europe', 'EU/TNO', 'Orange-5', 9, 9, 7, 8, 8),
  rtg('eu-nl',  'United Netherlands',       'Europe', 'EU/NL',  'Green-4',  7, 9, 6, 7, 6),
  rtg('eu-vat', 'Vatican City',             'Europe', 'EU/VAT', 'Red-6',    11, 9, 8, 7, 7),
];

// ─── All RTGs combined ────────────────────────────────────────────────────────

export const ALL_RTGS: RTGEntry[] = [
  ...NORTH_AMERICA,
  ...AFRICA_ASIA,
  ...CENTRAL_SOUTH_AMERICA,
  ...EUROPE,
];

export const RTG_REGIONS = [
  'North America',
  'Africa/Asia',
  'Central/South America',
  'Europe',
] as const;

export type RTGRegion = typeof RTG_REGIONS[number];

export function getRTGsByRegion(): Record<RTGRegion, RTGEntry[]> {
  return {
    'North America': NORTH_AMERICA,
    'Africa/Asia': AFRICA_ASIA,
    'Central/South America': CENTRAL_SOUTH_AMERICA,
    'Europe': EUROPE,
  };
}
