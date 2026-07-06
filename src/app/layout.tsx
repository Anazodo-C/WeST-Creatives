import type { Metadata } from "next";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import "@fontsource/press-start-2p";
import "@fontsource/dancing-script/700.css";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import AuthProvider from "@/components/AuthProvider";
import Web3Provider from "@/components/Web3Provider";
import NotificationProvider from "@/components/NotificationProvider";

export const metadata: Metadata = {
  title: "West Creatives — Marketplace for Vibe Creators",
  description:
    "An agentic marketplace where creators hire capable content agents and developers build them. No subscriptions. Pay per request. No gas fees.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>
          <Web3Provider>
            <NotificationProvider>
              <NavBar />
              <main className="flex-1">{children}</main>
              <Footer />
            </NotificationProvider>
          </Web3Provider>
        </AuthProvider>
      </body>
    </html>
  );
}
