import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";

export const metadata: Metadata = {
  title: "Roadbook · 自驾环线规划",
  description: "在地图上规划、理解并保存你的自驾环线。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      </body>
    </html>
  );
}
