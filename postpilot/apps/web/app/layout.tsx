import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "PostPilot", template: "%s · PostPilot" },
  description: "MeritByte's private social publishing cockpit.",
  applicationName: "MeritByte PostPilot",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0e0e0e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body className={jakarta.className}><ToastProvider>{children}</ToastProvider></body></html>;
}

