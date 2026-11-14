import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { SignOutDialog } from '@/components/SignOutDialog';

export function AdministrationSignOut() {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  return <><Button variant="ghost" onClick={() => setOpen(true)}><LogOut className="h-4 w-4" />Sign out</Button><SignOutDialog open={open} onOpenChange={setOpen} onConfirm={async () => {
    try {
      await client.cancelQueries();
      client.clear();
      await signOut();
      await navigate({ to: '/admin-login', replace: true });
    } catch { toast.error('Unable to sign out. Please try again.'); }
  }} /></>;
}