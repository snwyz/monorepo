import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { WebVitalsReporter } from "@/components/performance/web-vitals-reporter";
import { GlassSurfaces } from "@/components/ui/glass-surfaces";
import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";
import "@/components/ui/glass-surfaces.css";

export const metadata: Metadata = {
  title: "Roadbook · 自驾环线规划",
  description: "在地图上规划、理解并保存你的自驾环线。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <AppToaster />
        <GlassSurfaces />
        <WebVitalsReporter />
      </body>
    </html>
  );
}
