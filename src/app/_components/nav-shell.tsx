"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Visual Loop" },
  { href: "/charts", label: "Graphs" },
  { href: "/startup", label: "Spring Setup" },
  { href: "/whatif", label: "Compare" },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Keep "/" as a clean full-screen showcase without website chrome.
  if (pathname === "/") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
                      ? "rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-purple-50 hover:text-purple-800"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
