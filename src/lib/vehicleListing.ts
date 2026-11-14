// Vehicle listing helpers. Phase 1 is migration-free: vehicle facts live in
// listings.product_details, which is publicly readable — so the full VIN is
// NEVER stored there. Only the masked form (vin_masked) is saved.
export const ODOMETER_STATUSES = [
  { value: 'actual', label: 'Actual mileage' },
  { value: 'exceeds_mechanical_limits', label: 'Exceeds mechanical limits' },
  { value: 'not_actual', label: 'Not actual (discrepancy)' },
  { value: 'unknown', label: 'Unknown' },
] as const;
export const TITLE_STATUSES = ['Clean', 'Rebuilt', 'Salvage', 'Missing'];

export function normalizeVin(vin: string) { return vin.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function isValidVin(vin: string) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(vin)); }
/** Public form: first 8 + 5 hidden + last 4. Never returns the full VIN. */
export function maskVin(vin: string) {
  const v = normalizeVin(vin);
  if (v.length !== 17) return '';
  return `${v.slice(0, 8)}*****${v.slice(13)}`;
}

export function validateVehicleDetails(d: Record<string, string>): string | null {
  if (!d.mileage || !/^\d+$/.test(d.mileage)) return 'Mileage is required for vehicles';
  if (!ODOMETER_STATUSES.some(s => s.value === d.odometer_status)) return 'Odometer status is required for vehicles';
  if (d.vin) return 'Full VIN must not be saved on a public listing';
  if (d.vin_masked && !/^[A-HJ-NPR-Z0-9]{8}\*{5}[A-HJ-NPR-Z0-9]{4}$/.test(d.vin_masked)) return 'Invalid VIN';
  return null;
}

export type VinDecode = { year?: string; make?: string; model?: string; trim?: string; body?: string; fuel?: string; drive?: string };
/** Free public NHTSA vPIC decoder (no key, no cost). Runs in the seller's browser only. */
export async function decodeVin(vin: string, fetcher: typeof fetch = fetch): Promise<VinDecode> {
  const v = normalizeVin(vin);
  if (!isValidVin(v)) throw new Error('Enter a valid 17-character VIN');
  const res = await fetcher(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`);
  if (!res.ok) throw new Error('VIN lookup unavailable — enter details manually');
  const r = (await res.json())?.Results?.[0] ?? {};
  const pick = (k: string) => (r[k] && String(r[k]).trim()) || undefined;
  return { year: pick('ModelYear'), make: pick('Make'), model: pick('Model'), trim: pick('Trim'), body: pick('BodyClass'), fuel: pick('FuelTypePrimary'), drive: pick('DriveType') };
}

export const TRANSPORT_DISCLAIMER = 'Informational estimate only — not a carrier quote. Actual prices come only from a verified transportation provider you choose, or use local pickup. PullBid Live has no transport partners.';
/** Rough reference range from distance. Never presented as a quote. */
export function estimateVehicleTransport(miles: number, enclosed = false) {
  const m = Math.max(0, Math.round(miles));
  const [lo, hi] = enclosed ? [1.1, 1.9] : [0.75, 1.4];
  const floor = 150;
  return { low: Math.max(floor, Math.round(m * lo)), high: Math.max(floor + 100, Math.round(m * hi)), isEstimate: true as const, disclaimer: TRANSPORT_DISCLAIMER };
}
