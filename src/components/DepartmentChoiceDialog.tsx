import { Link } from '@tanstack/react-router';
import { ArrowRight, ShoppingBag, Store, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export const BAZAAR_DEPT: Record<string, string> = {
  automotive: 'Automotive', electronics: 'Electronics', collectibles: 'Collectibles', fashion: 'Fashion',
  tools: 'Tools', home: 'Home', sports_outdoors: 'Sports & Outdoors', gaming: 'Toys & Hobbies', garden_outdoors: 'Home',
};

export type ChoiceDept = { value: string; slug: string; label: string };

export function DepartmentChoiceDialog({ dept, onClose }: { dept: ChoiceDept | null; onClose: (navigated?: boolean) => void }) {
  const bazaarDept = dept ? BAZAAR_DEPT[dept.value] : undefined;
  const row = 'flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return <Dialog open={!!dept} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogTitle>Shop {dept?.label}</DialogTitle>
      <DialogDescription>Choose where you want to shop.</DialogDescription>
      {dept && <div className="mt-2 space-y-3">
        <Link to="/marketplace/$department" params={{ department: dept.slug }} search={{}} onClick={() => onClose(true)} className={row}>
          <Users className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0"><p className="font-bold">Independent Market</p><p className="text-xs text-muted-foreground">Individual sellers, auctions, offers and pre-owned items</p></div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />
        </Link>
        <Link to="/bazaar" search={{ dept: bazaarDept }} onClick={() => onClose(true)} className={row}>
          <ShoppingBag className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0"><p className="font-bold">PB Bazaar</p><p className="text-xs text-muted-foreground">New products from retail stores, fixed prices, Buy Now</p></div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />
        </Link>
        {dept.value === 'collectibles' && <Link to="/shop" onClick={() => onClose(true)} className={row}>
          <Store className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0"><p className="font-bold">PB Store</p><p className="text-xs text-muted-foreground">Official TCG and collectibles</p></div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />
        </Link>}
      </div>}
    </DialogContent>
  </Dialog>;
}
