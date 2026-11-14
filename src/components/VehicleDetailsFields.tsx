import { useState } from 'react';
import { toast } from 'sonner';
import { ODOMETER_STATUSES, VEHICLE_TYPES, TRANSMISSIONS, TITLE_STATUSES, decodeVin, isValidVin, maskVin, estimateVehicleTransport } from '@/lib/vehicleListing';
import type { ProductDetails } from '@/lib/marketplaceDepartments';

export function VehicleDetailsFields({ details, onChange, fieldClass }: { details: ProductDetails; onChange: (d: ProductDetails) => void; fieldClass: string }) {
  // Full VIN stays in this component's memory only; just the masked form is saved.
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [miles, setMiles] = useState('');
  async function decode() {
    setBusy(true);
    try {
      const r = await decodeVin(vin);
      onChange({ ...details, vin_masked: maskVin(vin), ...(r.year && { year: r.year }), ...(r.make && { make: r.make }), ...(r.model && { model: r.model }), ...(r.trim && { trim: r.trim }), ...(r.body && { body: r.body }), ...(r.fuel && { fuel: r.fuel }) });
      toast.success('VIN decoded — review and edit any details');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const est = Number(miles) > 0 ? estimateVehicleTransport(Number(miles)) : null;
  return <div className="space-y-3 rounded-xl border border-border p-3">
    <label className="block text-xs text-muted-foreground">VIN (optional)
      <div className="mt-1 flex gap-2">
        <input aria-label="VIN" maxLength={17} className={fieldClass + ' mt-0 uppercase'} value={vin} onChange={e => { setVin(e.target.value); if (isValidVin(e.target.value)) onChange({ ...details, vin_masked: maskVin(e.target.value) }); }} />
        <button type="button" disabled={busy || !isValidVin(vin)} onClick={decode} className="shrink-0 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy ? '…' : 'Decode'}</button>
      </div>
      <span className="mt-1 block text-[11px]">🔒 The full VIN is never shown publicly{details.vin_masked ? ` — buyers see ${details.vin_masked}` : ''}.</span>
    </label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-xs text-muted-foreground">Mileage *
        <input aria-label="Mileage" required type="number" min="0" className={fieldClass} value={details.mileage ?? ''} onChange={e => onChange({ ...details, mileage: e.target.value })} />
      </label>
      <label className="block text-xs text-muted-foreground">Odometer status *
        <select aria-label="Odometer status" required className={fieldClass} value={details.odometer_status ?? ''} onChange={e => onChange({ ...details, odometer_status: e.target.value })}>
          <option value="">Select status</option>{ODOMETER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">Title status
        <select aria-label="Title status" className={fieldClass} value={details.title_status ?? ''} onChange={e => onChange({ ...details, title_status: e.target.value })}>
          <option value="">Select</option>{TITLE_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">Vehicle type
        <select aria-label="Vehicle type" className={fieldClass} value={details.vehicle_type ?? ''} onChange={e => onChange({ ...details, vehicle_type: e.target.value })}>
          <option value="">Select</option>{VEHICLE_TYPES.map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">Transmission
        <select aria-label="Transmission" className={fieldClass} value={details.transmission ?? ''} onChange={e => onChange({ ...details, transmission: e.target.value })}>
          <option value="">Select</option>{TRANSMISSIONS.map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">Trim
        <input aria-label="Trim" maxLength={200} className={fieldClass} value={details.trim ?? ''} onChange={e => onChange({ ...details, trim: e.target.value })} />
      </label>
    </div>
    <div className="rounded-lg bg-muted/40 p-2 text-xs">
      <label className="block text-muted-foreground">Transport estimate — distance in miles
        <input aria-label="Transport distance" type="number" min="0" className={fieldClass} value={miles} onChange={e => setMiles(e.target.value)} />
      </label>
      {est && <p className="mt-1 font-semibold">Estimated ${est.low.toLocaleString()}–${est.high.toLocaleString()} (open carrier)</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">{estimateVehicleTransport(0).disclaimer}</p>
    </div>
  </div>;
}
