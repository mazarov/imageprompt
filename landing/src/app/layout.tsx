import "./globals.css";

/** Root passes through to `[locale]/layout` (html/body + providers live there). */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
