/**
 * Server-rendered JSON-LD. Emits an inline `<script type="application/ld+json">`
 * directly into the server HTML (no `next/script` / `afterInteractive`), so the
 * structured data is crawlable without client-side execution.
 */
export function JsonLd({ id, data }: { id: string; data: unknown }) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
