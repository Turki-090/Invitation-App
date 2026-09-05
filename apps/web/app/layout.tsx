import "@dawah/ui/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "دعوة", template: "%s | دعوة" },
  description: "إدارة دعوات المناسبات والردود والحضور عبر واتساب.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html dir="rtl" lang="ar-SA">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
