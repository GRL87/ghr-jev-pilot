import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description:
    "GHR Jev Pilot v0.1. Jev-only routing with PASS, RETRY, OWNER_REQUIRED, and FAIL outcomes.",
  title: {
    default: "GHR Jev Pilot v0.1",
    template: "%s · GHR Jev Pilot v0.1",
  },
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
    <body>
      <a
        href="#main"
        className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:rounded-md focus:p-3"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center px-5 sm:px-8">
          <div className="flex flex-col py-3">
            <h1 className="text-lg leading-6 font-semibold tracking-tight">
              <Link
                href="/leads"
                className="focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
              >
                GHR Jev Pilot v0.1
              </Link>
            </h1>
            <p className="text-muted-foreground text-sm leading-5">
              Jev-only form routing
            </p>
          </div>
        </div>
      </header>
      {children}
    </body>
  </html>
);

export default RootLayout;
