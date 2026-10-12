import { useAuth } from '@/contexts/authState';
import { supabase } from '@/integrations/supabase/client';
import type { DirectoryMember } from '@/lib/domainTypes';
import { errorMessage } from '@/lib/errors';
import { useEffect,useState } from 'react';
import { toast } from '@/lib/notifications';

export type DirectoryRow = DirectoryMember & { role: string };
export function useDirectory() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    setRows([]);
    if (userId && role) {
      void (async () => {
        try {
        const { data, error } = await supabase.rpc('restaurant_directory');
        if (!active) return;
        if (error) { toast.error(error.message); return; }
        setRows((data ?? []).map(row => ({ ...row, role: row.role ?? 'staff' })));
        } catch (error) { if (active) toast.error(errorMessage(error)); }
      })();
    }
    return () => { active = false; };
  }, [userId, role]);
  const term = query.toLowerCase();
  const filtered = rows.filter(row => !term || row.full_name.toLowerCase().includes(term) || row.username.toLowerCase().includes(term));
  return { rows, filtered, query, setQuery, canSeeSensitive: (row: DirectoryRow) => role === 'admin' || !row.hide_personal };
}
