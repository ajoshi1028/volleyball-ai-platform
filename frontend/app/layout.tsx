import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pepperdine Film Analysis",
  description: "AI-powered volleyball film analysis for Pepperdine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ background: "#0f1923", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
