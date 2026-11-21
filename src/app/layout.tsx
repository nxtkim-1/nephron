import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { NavShell } from "~/app/_components/nav-shell";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "NEPHRON — Seasonal Field Kidney Digital Twin",
  description:
    "NEPHRON (Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks): A Seasonal Field Kidney for Atrazine in Tile Drainage.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <TRPCReactProvider>
          <NavShell>{children}</NavShell>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
