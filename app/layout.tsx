import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastClearance } from "@/components/shell/toast-clearance";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TrojanMatch — Build better teams. Start building sooner.",
  description:
    "Find teammates for a specific hackathon or course project. AI recommends. Humans decide. Not an official USC app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          richColors
          position="bottom-center"
          // --toast-clearance lifts toasts above a chat composer or sticky action bar (see ToastClearance).
          offset={{ bottom: "calc(24px + var(--toast-clearance, 0px))" }}
          mobileOffset={{ bottom: "calc(16px + var(--toast-clearance, 0px))" }}
        />
        <ToastClearance />
      </body>
    </html>
  );
}
