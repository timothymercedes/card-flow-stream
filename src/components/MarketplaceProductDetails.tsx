import { MARKET_DEPARTMENTS, GENERAL_CONDITIONS, detailFields, type ProductDetails } from '@/lib/marketplaceDepartments';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';

export function MarketplaceProductDetails({ department, category, details, onChange }: {
  department: string; category: string; details: ProductDetails;
  onChange: (department: string, category: string, details: ProductDetails) => void;
}) {
  const fieldClass = 'mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm text-foreground';
  return <div className="space-y-3">
    <label className="block text-xs text-muted-foreground">Department
      <select aria-label="Department" className={fieldClass} value={department} onChange={e => onChange(e.target.value, e.target.value === 'collectibles' ? 'pokemon' : e.target.value, {})}>
        {MARKET_DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
    </label>
    {department === 'collectibles' && <label className="block text-xs text-muted-foreground">Category
      <select aria-label="Product category" className={fieldClass} value={category} onChange={e => onChange(department,e.target.value,details)}>
        {LISTING_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </label>}
    {department !== 'collectibles' && <label className="block text-xs text-muted-foreground">Product condition
      <select aria-label="Product condition" className={fieldClass} value={details.condition ?? ''} onChange={e => onChange(department,category,{...details,condition:e.target.value})}>
        <option value="">Select condition</option>{GENERAL_CONDITIONS.map(c => <option key={c}>{c}</option>)}
      </select>
    </label>}
    <div className="grid grid-cols-2 gap-3">
      {detailFields(department).map(key => <label key={key} className="block text-xs capitalize text-muted-foreground">{key.replaceAll('_',' ')}
        <input aria-label={`Product ${key.replaceAll('_',' ')}`} maxLength={200} type={['year','mileage'].includes(key) ? 'number' : 'text'} min="0" className={fieldClass} value={details[key] ?? ''} onChange={e => onChange(department,category,{...details,[key]:e.target.value})}/>
      </label>)}
    </div>
  </div>;
}