import { detectOffPlatform } from './offPlatform';
import { ODOMETER_STATUSES } from './vehicleListing';

export type ReviewFlag = { level: 'block' | 'warn'; text: string };
/** Read-only compliance checks for an automotive listing's public fields. */
export function reviewVehicle(l: { title?: string | null; description?: string | null; product_details?: Record<string, string> | null }): ReviewFlag[] {
  const d = l.product_details ?? {};
  const flags: ReviewFlag[] = [];
  const text = `${l.title ?? ''} ${l.description ?? ''} ${Object.values(d).join(' ')}`;
  if (/\b[A-HJ-NPR-Z0-9]{17}\b/i.test(text)) flags.push({ level: 'block', text: 'Possible full VIN visible in public text' });
  if (d.vin) flags.push({ level: 'block', text: 'Full VIN stored on public listing' });
  if (!d.mileage || !/^\d+$/.test(d.mileage)) flags.push({ level: 'block', text: 'Mileage missing' });
  if (!ODOMETER_STATUSES.some(s => s.value === d.odometer_status)) flags.push({ level: 'block', text: 'Odometer status missing' });
  else if (d.odometer_status !== 'actual') flags.push({ level: 'warn', text: `Odometer: ${ODOMETER_STATUSES.find(s => s.value === d.odometer_status)?.label}` });
  if (!d.title_status) flags.push({ level: 'warn', text: 'Title status not provided' });
  else if (d.title_status !== 'Clean') flags.push({ level: 'warn', text: `Title: ${d.title_status}` });
  const off = detectOffPlatform(text);
  if (off.risk === 'high' || off.risk === 'medium') flags.push({ level: off.risk === 'high' ? 'block' : 'warn', text: `Off-platform contact/payment risk (${off.terms.slice(0, 3).join(', ')})` });
  return flags;
}
