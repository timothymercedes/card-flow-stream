import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { DepartmentPhoto } from '@/components/DepartmentPhoto';
import { orderedDepartments, interestDepartments, mergeDepartmentInterests } from '@/lib/departmentInterests';
import { departmentDisplayLabel } from '@/lib/departmentPhotography';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function DepartmentInterestPicker({onDone, onSkip, onboarding = false}: {onDone?: () => void; onSkip?: () => void; onboarding?: boolean}) {
  const {user, profile} = useAuth();
  const [picked, setPicked] = useState<string[]>(onboarding ? [] : interestDepartments(profile?.interests));
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!user || busy) return;
    setBusy(true);
    const interests = onboarding ? picked : mergeDepartmentInterests(profile?.interests ?? [], picked);
    const {error} = await supabase.from('profiles').update({interests, ...(onboarding ? {onboarding_completed:true} : {})}).eq('id',user.id);
    setBusy(false);
    if (error) {toast.error('Your interests could not be saved. Please try again.'); return;}
    toast.success('Interests saved');
    if (onDone) onDone(); else window.location.reload();
  }
  return <section className="space-y-5 pb-44 lg:pb-0">
    <div><h1 className="text-2xl font-bold">What are you into?</h1><p className="mt-2 text-sm text-muted-foreground">Choose your interests. You can change these anytime.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{orderedDepartments().map(d => <label key={d.value} className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border-2 bg-card focus-within:ring-2 focus-within:ring-ring ${picked.includes(d.value) ? 'border-primary' : 'border-border'}`}>
      <DepartmentPhoto value={d.value} className="aspect-[16/10] w-full"/>
      <Checkbox aria-label={departmentDisplayLabel(d)} checked={picked.includes(d.value)} disabled={busy} onCheckedChange={checked => setPicked(previous => checked ? [...previous,d.value] : previous.filter(v => v !== d.value))} className="absolute right-3 top-3 h-6 w-6 bg-background"/>
      <span className="block p-3 text-sm font-semibold">{departmentDisplayLabel(d)}</span>
    </label>)}</div>
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4"><p aria-live="polite" className="mr-auto text-sm text-muted-foreground">{picked.length} interests selected</p>{onSkip && <Button variant="ghost" disabled={busy} onClick={onSkip}>Skip for now</Button>}<Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save interests'}</Button></div>
  </section>;
}