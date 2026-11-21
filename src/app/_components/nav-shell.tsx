"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/charts", label: "Charts" },
  { href: "/startup", label: "Start-up" },
  { href: "/whatif", label: "What-If" },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-purple-700 px-2 py-0.5 text-xs font-bold tracking-wider text-white">
                NEPHRON
              </span>
              <span className="text-sm font-semibold text-slate-900 sm:text-base">
                A Seasonal Field Kidney for Atrazine in Tile Drainage
              </span>
            </div>
            <span className="text-xs text-slate-500">
              Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "rounded-md bg-purple-700 px-3 py-1.5 text-sm font-medium text-white"
                      : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-purple-50 hover:text-purple-800"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="bg-purple-50 border-t border-purple-100">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-xs text-purple-900 sm:px-6">
            <span className="font-medium">
              Synthetic data: demonstration only
            </span>
            <span className="hidden text-purple-700 sm:inline">
              Hourly physical model + noisy sensors + delayed lab grab calibration
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
