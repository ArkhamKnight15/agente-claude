import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { ProvedorNotificacoes } from "@/components/ui/notificacoes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Prospecta", template: "%s · Prospecta" },
  description: "Encontre empresas sem site na sua cidade e envie sua proposta pelo WhatsApp.",
  robots: { index: false, follow: false },
  applicationName: "Prospecta",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <ProvedorNotificacoes>{children}</ProvedorNotificacoes>
      </body>
    </html>
  );
}
