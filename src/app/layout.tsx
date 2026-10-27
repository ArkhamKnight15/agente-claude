import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Prospecta", template: "%s · Prospecta" },
  description: "Agente comercial de IA para encontrar empresas sem site, preparar abordagens e acompanhar vendas.",
  applicationName: "Prospecta",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0e" },
  ],
};

// Aplica o tema antes da primeira pintura (evita o "flash" de tema errado).
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
