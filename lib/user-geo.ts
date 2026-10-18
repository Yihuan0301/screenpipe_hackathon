/**
 * 自家用户地域（按时区）— 来自运营看板快照，非 ASC。
 * 坐标取该时区代表城市，用于地图落点。
 */

export type UserGeoPoint = {
  timezone: string;
  count: number;
  pct: number;
  /** [lon, lat] */
  coordinates: [number, number];
  short: string;
};

/** IANA 时区 → 代表城市经纬度 */
const TZ_COORDS: Record<string, { coordinates: [number, number]; short: string }> =
  {
    "Asia/Shanghai": { coordinates: [121.47, 31.23], short: "SH" },
    "Europe/Paris": { coordinates: [2.35, 48.86], short: "PA" },
    "America/Toronto": { coordinates: [-79.38, 43.65], short: "TO" },
    UTC: { coordinates: [0, 0], short: "UTC" },
    "America/Vancouver": { coordinates: [-123.12, 49.28], short: "VA" },
    "Asia/Hong_Kong": { coordinates: [114.17, 22.32], short: "HK" },
    "Asia/Tokyo": { coordinates: [139.69, 35.68], short: "TK" },
    "Asia/Taipei": { coordinates: [121.57, 25.03], short: "TP" },
    "America/Los_Angeles": { coordinates: [-118.24, 34.05], short: "LA" },
    "Europe/Zurich": { coordinates: [8.54, 47.38], short: "ZH" },
    "America/Edmonton": { coordinates: [-113.49, 53.55], short: "ED" },
    "America/New_York": { coordinates: [-74.01, 40.71], short: "NY" },
    "Europe/Berlin": { coordinates: [13.41, 52.52], short: "BE" },
    "Asia/Singapore": { coordinates: [103.82, 1.35], short: "SG" },
    "Europe/London": { coordinates: [-0.13, 51.51], short: "LN" },
    "Africa/Dakar": { coordinates: [-17.44, 14.69], short: "DK" },
    "Africa/Conakry": { coordinates: [-13.71, 9.51], short: "CK" },
    "Africa/Lubumbashi": { coordinates: [27.48, -11.66], short: "LB" },
    "Europe/Brussels": { coordinates: [4.35, 50.85], short: "BR" },
    "America/Chicago": { coordinates: [-87.63, 41.88], short: "CH" },
    "America/Winnipeg": { coordinates: [-97.14, 49.9], short: "WP" },
    "Asia/Ho_Chi_Minh": { coordinates: [106.63, 10.82], short: "HCM" },
    "Europe/Rome": { coordinates: [12.5, 41.9], short: "RM" },
    "Africa/Algiers": { coordinates: [3.06, 36.75], short: "AL" },
    "Europe/Amsterdam": { coordinates: [4.9, 52.37], short: "AM" },
    "Asia/Bangkok": { coordinates: [100.5, 13.75], short: "BK" },
    "Africa/Abidjan": { coordinates: [-4.03, 5.36], short: "AB" },
    "Australia/Sydney": { coordinates: [151.21, -33.87], short: "SY" },
    "Asia/Seoul": { coordinates: [126.98, 37.57], short: "SE" },
    "Australia/Melbourne": { coordinates: [144.96, -37.81], short: "ME" },
    "America/Halifax": { coordinates: [-63.57, 44.65], short: "HX" },
    "Europe/Lisbon": { coordinates: [-9.14, 38.72], short: "LS" },
    "Africa/Casablanca": { coordinates: [-7.59, 33.57], short: "CS" },
    "Asia/Dubai": { coordinates: [55.27, 25.2], short: "DU" },
    "Asia/Almaty": { coordinates: [76.93, 43.24], short: "ALM" },
    "Europe/Luxembourg": { coordinates: [6.13, 49.61], short: "LU" },
    "America/Moncton": { coordinates: [-64.77, 46.09], short: "MO" },
    "Asia/Manila": { coordinates: [120.98, 14.6], short: "MN" },
    "Asia/Kuala_Lumpur": { coordinates: [101.69, 3.14], short: "KL" },
    "Europe/Madrid": { coordinates: [-3.7, 40.42], short: "MD" },
    "Africa/Douala": { coordinates: [9.7, 4.05], short: "DO" },
    "Africa/Kinshasa": { coordinates: [15.31, -4.33], short: "KI" },
    "Africa/Bamako": { coordinates: [-8.0, 12.65], short: "BM" },
    "Asia/Chongqing": { coordinates: [106.55, 29.56], short: "CQ" },
    "Africa/Niamey": { coordinates: [2.11, 13.51], short: "NI" },
    "Pacific/Auckland": { coordinates: [174.76, -36.85], short: "AK" },
    "Africa/Ouagadougou": { coordinates: [-1.52, 12.37], short: "OU" },
    "Europe/Helsinki": { coordinates: [24.94, 60.17], short: "HE" },
    "Asia/Muscat": { coordinates: [58.41, 23.59], short: "MU" },
    "America/Mexico_City": { coordinates: [-99.13, 19.43], short: "MX" },
  };

/** 运营看板导出的时区分布（count / pct） */
const RAW: { timezone: string; count: number; pct: number }[] = [
  { timezone: "Asia/Shanghai", count: 967, pct: 56.4 },
  { timezone: "Europe/Paris", count: 255, pct: 14.9 },
  { timezone: "America/Toronto", count: 115, pct: 6.7 },
  { timezone: "UTC", count: 40, pct: 2.3 },
  { timezone: "America/Vancouver", count: 34, pct: 2.0 },
  { timezone: "Asia/Hong_Kong", count: 28, pct: 1.6 },
  { timezone: "Asia/Tokyo", count: 20, pct: 1.2 },
  { timezone: "Asia/Taipei", count: 17, pct: 1.0 },
  { timezone: "America/Los_Angeles", count: 15, pct: 0.9 },
  { timezone: "Europe/Zurich", count: 14, pct: 0.8 },
  { timezone: "America/Edmonton", count: 14, pct: 0.8 },
  { timezone: "America/New_York", count: 13, pct: 0.8 },
  { timezone: "Europe/Berlin", count: 10, pct: 0.6 },
  { timezone: "Asia/Singapore", count: 9, pct: 0.5 },
  { timezone: "Europe/London", count: 9, pct: 0.5 },
  { timezone: "Africa/Dakar", count: 8, pct: 0.5 },
  { timezone: "Africa/Conakry", count: 7, pct: 0.4 },
  { timezone: "Africa/Lubumbashi", count: 7, pct: 0.4 },
  { timezone: "Europe/Brussels", count: 7, pct: 0.4 },
  { timezone: "America/Chicago", count: 7, pct: 0.4 },
  { timezone: "America/Winnipeg", count: 7, pct: 0.4 },
  { timezone: "Asia/Ho_Chi_Minh", count: 7, pct: 0.4 },
  { timezone: "Europe/Rome", count: 6, pct: 0.3 },
  { timezone: "Africa/Algiers", count: 5, pct: 0.3 },
  { timezone: "Europe/Amsterdam", count: 5, pct: 0.3 },
  { timezone: "Asia/Bangkok", count: 4, pct: 0.2 },
  { timezone: "Africa/Abidjan", count: 4, pct: 0.2 },
  { timezone: "Australia/Sydney", count: 4, pct: 0.2 },
  { timezone: "Asia/Seoul", count: 4, pct: 0.2 },
  { timezone: "Australia/Melbourne", count: 3, pct: 0.2 },
  { timezone: "America/Halifax", count: 3, pct: 0.2 },
  { timezone: "Europe/Lisbon", count: 3, pct: 0.2 },
  { timezone: "Africa/Casablanca", count: 3, pct: 0.2 },
  { timezone: "Asia/Dubai", count: 3, pct: 0.2 },
  { timezone: "Asia/Almaty", count: 2, pct: 0.1 },
  { timezone: "Europe/Luxembourg", count: 2, pct: 0.1 },
  { timezone: "America/Moncton", count: 2, pct: 0.1 },
  { timezone: "Asia/Manila", count: 2, pct: 0.1 },
  { timezone: "Asia/Kuala_Lumpur", count: 2, pct: 0.1 },
  { timezone: "Europe/Madrid", count: 2, pct: 0.1 },
  { timezone: "Africa/Douala", count: 2, pct: 0.1 },
  { timezone: "Africa/Kinshasa", count: 2, pct: 0.1 },
  { timezone: "Africa/Bamako", count: 2, pct: 0.1 },
  { timezone: "Asia/Chongqing", count: 2, pct: 0.1 },
  { timezone: "Africa/Niamey", count: 2, pct: 0.1 },
  { timezone: "Pacific/Auckland", count: 2, pct: 0.1 },
  { timezone: "Africa/Ouagadougou", count: 1, pct: 0.1 },
  { timezone: "Europe/Helsinki", count: 1, pct: 0.1 },
  { timezone: "Asia/Muscat", count: 1, pct: 0.1 },
  { timezone: "America/Mexico_City", count: 1, pct: 0.1 },
];

export const USER_GEO_POINTS: UserGeoPoint[] = RAW.map((row) => {
  const meta = TZ_COORDS[row.timezone];
  if (!meta) {
    throw new Error(`Missing coords for timezone: ${row.timezone}`);
  }
  return {
    timezone: row.timezone,
    count: row.count,
    pct: row.pct,
    coordinates: meta.coordinates,
    short: meta.short,
  };
});

export const USER_GEO_TOTAL = USER_GEO_POINTS.reduce((s, p) => s + p.count, 0);

export const USER_GEO_REGIONS = {
  华语区: ["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Chongqing"],
  欧洲: [
    "Europe/Paris",
    "Europe/Zurich",
    "Europe/Berlin",
    "Europe/London",
    "Europe/Brussels",
    "Europe/Rome",
    "Europe/Amsterdam",
    "Europe/Lisbon",
    "Europe/Luxembourg",
    "Europe/Madrid",
    "Europe/Helsinki",
  ],
  美洲: [
    "America/Toronto",
    "America/Vancouver",
    "America/Los_Angeles",
    "America/Edmonton",
    "America/New_York",
    "America/Chicago",
    "America/Winnipeg",
    "America/Halifax",
    "America/Moncton",
    "America/Mexico_City",
  ],
} as const;
