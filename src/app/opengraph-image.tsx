import { ImageResponse } from "next/og";

// Same icon/color as icon.tsx and nav-shell.tsx — can't share directly from icon.tsx
// (different `size`), hence the duplicate SVG, see the comment there.
export const alt = "Výkazy a faktury";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg
            width="100"
            height="100"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#228be6"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" />
            <path d="M14 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5m2 0v1.5m0 -9v1.5" />
          </svg>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#1a1a1a" }}>
            Výkazy a faktury
          </div>
        </div>
        <div style={{ fontSize: 32, color: "#666", marginTop: 20 }}>
          Správa výkazů práce a fakturace
        </div>
      </div>
    ),
    { ...size },
  );
}
