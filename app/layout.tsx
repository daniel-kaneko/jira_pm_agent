import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CSVProvider } from "@/contexts/CSVContext";
import { JiraConfigProvider } from "@/contexts/JiraConfigContext";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jira PM Agent • AI Project Assistant",
  description: "AI-powered assistant for Jira project management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.className} antialiased`}>
        <ErrorBoundary>
          <JiraConfigProvider>
            <CSVProvider>{children}</CSVProvider>
          </JiraConfigProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

