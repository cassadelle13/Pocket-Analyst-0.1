"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  LayoutDashboardIcon,
  MessageSquareIcon,
  SettingsIcon,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useRole } from "../../providers";
import {
  getSidebarDarken,
  SIDEBAR_STYLE_CHANGED_EVENT,
} from "../../lib/sidebarStyleStorage";

const menuItems = [
  { name: "Home", href: "/home", icon: Home },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { name: "DataTalk", href: "/datatalk", icon: MessageSquareIcon },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

// Library is now sourced from src/config/library.ts

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, setRole } = useRole();
  const isDevMode = String(process.env.NEXT_PUBLIC_DEV_MODE ?? "").toLowerCase() === "true";

  const [collapsed, setCollapsed] = useState(true);
  const [sidebarDarken, setSidebarDarken] = useState(0);

  useEffect(() => {
    setSidebarDarken(getSidebarDarken());
    const handler = () => setSidebarDarken(getSidebarDarken());
    window.addEventListener(SIDEBAR_STYLE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_STYLE_CHANGED_EVENT, handler);
  }, []);

  // TODO: Fix auto-collapse - temporarily removed due to chunk loading issues
  // useEffect(() => {
  //   if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
  //     setCollapsed(true);
  //   }
  // }, [pathname]);

  // Разделяем пункты меню на активные и неактивные
  const activeItem = menuItems.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  const inactiveItems = menuItems.filter((item) => !(pathname === item.href || pathname.startsWith(item.href + '/')));

  const handleNavigation = (href: string) => {
    try {
      router.push(href);
    } catch {}
  };

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-64'} h-screen flex flex-col sticky top-0 z-50 overflow-hidden`} style={{ transition: 'width 200ms ease-in-out', backgroundColor: `rgba(15, 23, 39, ${sidebarDarken})` }}>
      {/* Logo */}
        <div className="h-16 flex items-center justify-center flex-shrink-0">
        <Link href="/home" className="block relative">
          <h1 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent transition-all duration-200" style={{ opacity: collapsed ? 0 : 1, transform: collapsed ? 'scale(0.8)' : 'scale(1)' }}>
            PocketAnalyst
          </h1>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent transition-all duration-200" style={{ opacity: collapsed ? 1 : 0, transform: collapsed ? 'scale(1)' : 'scale(0.8)' }}>PA</span>
        </Link>
      </div>


      
      {/* Navigation - Неактивные пункты */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-2">
          {inactiveItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.name}>
                {index === 1 && <div className="h-12" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNavigation(item.href);
                  }}
                  className={`w-full flex items-center py-3 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left ${collapsed ? 'justify-center' : 'gap-3 px-4'}`}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium transition-opacity duration-200 overflow-hidden" style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Активный пункт под линией - тоже кликабельный */}
        {activeItem && (
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNavigation(activeItem.href);
                }}
                className={`w-full flex items-center py-2 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 transition-colors cursor-pointer hover:shadow-blue-500/40 text-left ${collapsed ? 'justify-center' : 'gap-3 px-4'}`}
                title={collapsed ? activeItem.name : undefined}
              >
                <activeItem.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium transition-opacity duration-200 overflow-hidden" style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}>{activeItem.name}</span>
              </button>
            </li>
          </ul>
        )}
      </nav>
      {isDevMode && (
        <div className="p-4 pt-0">
          <div className={`rounded-xl border border-white/10 bg-white/5 ${collapsed ? "px-2 py-2" : "px-3 py-2"}`}>
            {!collapsed && <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Role</div>}
            <select
              value={role}
              onChange={(e) => setRole(String(e.target.value) as any)}
              className="w-full h-8 rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-slate-200 outline-none"
              title="Developer role switcher"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
      )}
    </aside>
  );
}
