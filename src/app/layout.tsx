import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { PwaRegistrar } from "@/components/pwa-registrar";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#08111c",
  colorScheme: "dark light",
};

export const metadata: Metadata = {
  title: "Do.I.Fly?",
  description:
    "A polished drone flight advisory app with on-device profiles, live wind animation, and a free 3-hour forecast.",
  applicationName: "Do.I.Fly?",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Do.I.Fly?",
    statusBarStyle: "black-translucent",
  },
  keywords: [
    "drone",
    "flight weather",
    "wind forecast",
    "PWA",
    "flight safety",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistrar />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
