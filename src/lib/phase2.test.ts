import { describe, it, expect } from 'vitest';
import { sanitizeSuggestion, confidenceLabel } from './productIdentify';
import { reviewVehicle } from './vehicleReview';

describe('AI product suggestions', () => {
  it('strips authenticity, grading and serial claims from specs', () => {
    const s = sanitizeSuggestion({ matches: [{ name: 'Switch', confidence: 0.9, specs: { color: 'Red', authenticity: 'Genuine', serial_number: 'X1', grade: '10' } }] });
    expect(s.matches[0].specs).toEqual({ color: 'Red' });
  });
  it('labels low confidence as uncertain', () => { expect(confidenceLabel(0.2)).toBe('Uncertain'); });
  it('handles garbage output safely', () => { expect(sanitizeSuggestion('nope').matches).toEqual([]); });
});

describe('vehicle review', () => {
  const ok = { title: '2018 Civic', description: 'Runs great', product_details: { mileage: '42000', odometer_status: 'actual', title_status: 'Clean', vin_masked: '1HGCM826*****4352' } };
  it('passes a compliant listing', () => { expect(reviewVehicle(ok)).toEqual([]); });
  it('blocks a full VIN in the description', () => {
    expect(reviewVehicle({ ...ok, description: 'VIN 1HGCM82633A004352' }).some(f => f.level === 'block')).toBe(true);
  });
  it('blocks missing mileage', () => {
    expect(reviewVehicle({ ...ok, product_details: { ...ok.product_details, mileage: '' } }).map(f => f.text)).toContain('Mileage missing');
  });
});
