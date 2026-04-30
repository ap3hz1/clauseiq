import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClauseIQ MVP",
  description: "Commercial lease risk quantification"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
