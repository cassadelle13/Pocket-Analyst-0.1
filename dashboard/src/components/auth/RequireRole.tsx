"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRole } from "../../providers/RoleProvider";

import type { AppRole } from "../../providers/RoleProvider";

export interface RequireRoleProps {
  allow: AppRole[];
  fallbackHref: string;
  children: ReactNode;
}

export function RequireRole({ allow, fallbackHref, children }: RequireRoleProps) {
  const { role } = useRole();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = useMemo(() => allow.includes(role), [allow, role]);

  if (!allowed) {
    if (typeof window !== "undefined") {
      router.replace(fallbackHref);
    }

    return (
      <div className="p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Access denied</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your role (<span className="text-slate-200">{role}</span>) cannot access
            <span className="text-slate-200"> {pathname}</span>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
