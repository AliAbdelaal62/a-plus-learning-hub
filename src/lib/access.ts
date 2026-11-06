import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "coordinator" | "accountant" | "teacher";

export function useAccess() {
  return useQuery({
    queryKey: ["access"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { userId: null, email: null, roles: [] as Role[] };
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      return { userId: u.user.id, email: u.user.email ?? null, roles: (data ?? []).map((r) => r.role as Role) };
    },
  });
}

export const canEdit = (roles: Role[]) => roles.includes("admin") || roles.includes("coordinator");
export const isAdmin = (roles: Role[]) => roles.includes("admin");
