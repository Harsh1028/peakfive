export const HAMILTON_REPORT = {
  url: "https://www.hamilton.ca/sites/default/files/2026-02/waterdistribution-drinking-water-systems-annual-water-quality-report-2025.pdf",
  title: "City of Hamilton, 2025 Drinking Water Systems Annual Water Quality and Summary Report",
  facility: "Woodward Treatment Plant · Hamilton, Woodward Subsystem",
  systemId: "220003118",
  reportingYear: 2025,
  publicationYear: 2026,
  table: "Table 2-3 · printed page 12",
};

export const HAMILTON_PRODUCTION = [
  { month: "January", monthlyMl: 6776, averageDailyMl: 219, maximumDailyMl: 273 },
  { month: "February", monthlyMl: 6309, averageDailyMl: 225, maximumDailyMl: 264 },
  { month: "March", monthlyMl: 7439, averageDailyMl: 240, maximumDailyMl: 364 },
  { month: "April", monthlyMl: 6921, averageDailyMl: 231, maximumDailyMl: 287 },
  { month: "May", monthlyMl: 6962, averageDailyMl: 225, maximumDailyMl: 286 },
  { month: "June", monthlyMl: 7311, averageDailyMl: 244, maximumDailyMl: 286 },
  { month: "July", monthlyMl: 7968, averageDailyMl: 257, maximumDailyMl: 383 },
  { month: "August", monthlyMl: 7483, averageDailyMl: 241, maximumDailyMl: 415 },
  { month: "September", monthlyMl: 7002, averageDailyMl: 233, maximumDailyMl: 395 },
  { month: "October", monthlyMl: 6650, averageDailyMl: 215, maximumDailyMl: 327 },
  { month: "November", monthlyMl: 6220, averageDailyMl: 207, maximumDailyMl: 263 },
  { month: "December", monthlyMl: 6523, averageDailyMl: 210, maximumDailyMl: 268 },
] as const;

export function productionSummary() {
  return {
    annualMl: HAMILTON_PRODUCTION.reduce((total, row) => total + row.monthlyMl, 0),
    highestMonthly: HAMILTON_PRODUCTION.reduce((a, b) => b.monthlyMl > a.monthlyMl ? b : a),
    highestDaily: HAMILTON_PRODUCTION.reduce((a, b) => b.maximumDailyMl > a.maximumDailyMl ? b : a),
  };
}