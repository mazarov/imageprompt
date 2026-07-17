import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Analyze history",
  robots: { index: false, follow: false },
};

export default function AdminAnalyzeHistoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto px-4 py-8 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
