"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  HomeIcon,
  LayoutDashboardIcon, 
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";

const navigation = [
  { name: "Home", href: "/home", icon: HomeIcon },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { name: "DataTalk", href: "/datatalk", icon: MessageSquareIcon },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-2">
      <div className="flex flex-wrap gap-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300
                ${isActive 
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25' 
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }
              `}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
