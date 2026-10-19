import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyblind — Activate",
  description: "Activate your Keyblind license",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0d1117] text-[#c9d1d9]">{children}</body>
    </html>
  );
}
