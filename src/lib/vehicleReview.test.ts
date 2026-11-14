import { describe, it, expect } from 'vitest';
import { reviewVehicle } from './vehicleReview';
import { sanitizeSuggestion, confidenceLabel } from './productIdentify';

const good = { title: '2018 Honda Civic', description: 'Runs great.', product_details: { mileage: '42000', odometer_status: 'actual', title_status: 'Clean', vin_masked: '1HGCM826*****4352' } };
const texts = (l: Parameters<typeof reviewVehicle>[0]) => reviewVehicle(l).map(f => f.text).join('|');

describe('vehicle review flags', () => {
  it('clean listing has no flags', () => expect(reviewVehicle(good)).toEqual([]));
  it('flags missing mileage', () => expect(texts({ ...good, product_details: { ...good.product_details, mileage: '' } })).toContain('Mileage missing'));
  it('flags missing odometer status', () => expect(texts({ ...good, product_details: { ...good.product_details, odometer_status: '' } })).toContain('Odometer status missing'));
  it('flags title problems', () => expect(texts({ ...good, product_details: { ...good.product_details, title_status: 'Salvage' } })).toContain('Title: Salvage'));
  it('flags a full VIN in listing text', () => expect(texts({ ...good, description: 'VIN 1HGCM82633A004352' })).toContain('full VIN'));
  it('flags off-platform payment', () => expect(texts({ ...good, description: 'Pay me on Venmo or Zelle to save fees, text me' })).toContain('Off-platform'));
  it('is read-only: input is not modified', () => { const l = structuredClone(good); reviewVehicle(l); expect(l).toEqual(good); });
});

describe('AI identification safeguards', () => {
  it('keeps at most four matches, best first', () => {
    const s = sanitizeSuggestion({ matches: [1, 2, 3, 4, 5].map(i => ({ name: `M${i}`, confidence: i / 10 })) });
    expect(s.matches.map(m => m.name)).toEqual(['M5', 'M4', 'M3', 'M2']);
  });
  it('labels confidence', () => {
    expect(confidenceLabel(0.9)).toBe('Likely match');
    expect(confidenceLabel(0.5)).toBe('Possible match');
    expect(confidenceLabel(0.2)).toBe('Uncertain');
  });
  it('strips invented authenticity, grade and serial claims', () => {
    const s = sanitizeSuggestion({ matches: [{ name: 'X', confidence: 0.2, specs: { authenticity: 'Genuine', grade: 'PSA 10', serial_number: '123', color: 'Black' } }] });
    expect(s.matches[0].specs).toEqual({ color: 'Black' });
  });
});
