"use client";

// Last resort, when the site's own frame fails: it replaces the root layout, so styles here are its own.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, Arial, sans-serif", background: "#fff", color: "#1E293B" }}>
        <title>Something went wrong – YCC Revision Portal</title>
        <main style={{ maxWidth: 440, padding: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 30, margin: "0 0 12px" }}>This page couldn’t load</h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, margin: "0 0 24px" }}>Something went wrong on our side, or the connection dropped. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 56, padding: "0 24px", fontSize: 18, fontWeight: 600, color: "#fff", background: "#005DA1", border: "2px solid #005DA1", borderRadius: 8, cursor: "pointer" }}
          >
            Try again
          </button>
          {error.digest && <p style={{ fontSize: 16, marginTop: 24 }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
