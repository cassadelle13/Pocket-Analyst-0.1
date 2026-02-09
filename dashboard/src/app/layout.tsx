import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppProviders } from "../providers";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AppShell } from "../components/layout/AppShell";
import { ThemeProvider } from '../context/ThemeContext';
import { ChartEnvironmentProvider } from "../context/ChartEnvironment";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-slate-950">
        <ErrorBoundary>
          <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
            <AppProviders>
              <ThemeProvider>
                <ChartEnvironmentProvider>
                  <AppShell>
                    {children}
                  </AppShell>
                </ChartEnvironmentProvider>
              </ThemeProvider>
            </AppProviders>
          </Suspense>
        </ErrorBoundary>
      </body>
    </html>
  );
}
