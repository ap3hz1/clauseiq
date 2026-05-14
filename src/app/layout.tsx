import type { Metadata } from "next";
import Link from "next/link";
import { CLAUSEIQ_LEGAL_DISCLAIMER_BODY } from "@/lib/legalDisclaimer";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClauseIQ MVP",
  description: "Commercial lease risk quantification"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <footer className="app-footer">
            <p className="legal-disclaimer">
              <strong>Disclaimer.</strong> {CLAUSEIQ_LEGAL_DISCLAIMER_BODY}
            </p>
            <div className="footer-links">
              <Link href="/privacy">Privacy</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
