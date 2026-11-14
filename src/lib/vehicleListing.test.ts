import { describe, it, expect } from 'vitest';
import { maskVin, isValidVin, validateVehicleDetails, decodeVin, estimateVehicleTransport } from './vehicleListing';
import { validateProductDetails } from './marketplaceDepartments';
const VIN = '1HGCM82633A004352';
describe('vehicle listings', () => {
  it('masks VIN, never exposing the full 17 characters', () => { expect(maskVin(VIN)).toBe('1HGCM826*****4352'); expect(maskVin(VIN)).not.toContain(VIN); });
  it('rejects VINs with I/O/Q or wrong length', () => { expect(isValidVin('1HGCM82633A00435')).toBe(false); expect(isValidVin('1HGCM82633A00435O')).toBe(false); expect(isValidVin(VIN)).toBe(true); });
  it('requires mileage', () => expect(validateVehicleDetails({ odometer_status: 'actual' })).toMatch(/Mileage/));
  it('requires odometer status', () => expect(validateVehicleDetails({ mileage: '1000' })).toMatch(/Odometer/));
  it('accepts all four odometer statuses', () => { for (const s of ['actual','exceeds_mechanical_limits','not_actual','unknown']) expect(validateVehicleDetails({ mileage: '5', odometer_status: s })).toBeNull(); });
  it('refuses to save a full VIN publicly', () => expect(validateVehicleDetails({ mileage: '5', odometer_status: 'actual', vin: VIN })).toBeTruthy());
  it('automotive validation enforces vehicle rules; other departments do not', () => { expect(validateProductDetails({}, 'automotive')).toBeTruthy(); expect(validateProductDetails({}, 'electronics')).toBeNull(); });
  it('decodes NHTSA results', async () => {
    const f = (async () => new Response(JSON.stringify({ Results: [{ ModelYear: '2003', Make: 'HONDA', Model: 'Accord' }] }))) as typeof fetch;
    expect(await decodeVin(VIN, f)).toMatchObject({ year: '2003', make: 'HONDA', model: 'Accord' });
  });
  it('transport is always labeled an estimate', () => { const e = estimateVehicleTransport(1000); expect(e.isEstimate).toBe(true); expect(e.disclaimer).toMatch(/not a carrier quote/); expect(e.low).toBe(750); expect(e.high).toBe(1400); });
});
