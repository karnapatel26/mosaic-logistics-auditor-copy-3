import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mosaic Logistics Billing Auditor",
  description:
    "Real-time logistics billing reconciliation dashboard — identifies carrier overcharges, weight-slab inflation, phantom fees, and zone upgrades across all shipments.",
  keywords: ["logistics", "billing audit", "reconciliation", "supply chain", "carrier overcharge"],
  openGraph: {
    title: "Mosaic Logistics Billing Auditor",
    description: "Identify and quantify carrier billing violations at a glance.",
    type: "website",
  },
};

// Wraps every page in the shared document shell so Next.js can apply
// metadata and global styles consistently.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
