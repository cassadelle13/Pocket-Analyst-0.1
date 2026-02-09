"use client";

import { motion } from "framer-motion";
import { cn } from "../../../lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
}

export function GlassCard({ children, className, hover = true, delay = 0 }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={hover ? { scale: 1.02, y: -5 } : {}}
      className={cn(
        "backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6",
        "hover:bg-white/15 hover:border-white/30 hover:shadow-3xl",
        "transition-all duration-300 ease-out",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  trend?: 'up' | 'down';
  delay?: number;
}

export function KPICard({ title, value, change, icon, trend, delay = 0 }: KPICardProps) {
  const isPositive = change && change > 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.05, y: -10 }}
      className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-3xl shadow-2xl p-6 hover:bg-white/15 transition-all duration-300"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-slate-300 text-sm font-medium mb-2">{title}</p>
          <p className="text-white text-3xl font-bold mb-3">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-2">
              {trend === 'up' ? (
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              ) : (
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              )}
              <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{change}%
              </span>
            </div>
          )}
        </div>
        <div className="p-4 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-2xl border border-white/10">
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
