import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 24%, rgba(76,168,255,0.24), transparent 36%), linear-gradient(180deg, #08111c 0%, #10273e 100%)",
          borderRadius: 42,
        }}
      >
        <svg width="140" height="140" viewBox="0 0 512 512" fill="none">
          <circle cx="256" cy="256" r="196" fill="rgba(23,52,76,0.72)" />
          <circle cx="256" cy="256" r="182" stroke="rgba(132,227,218,0.34)" strokeWidth="6" />
          <path d="M86 228C124 194 167 182 211 190C252 198 286 225 326 229C355 232 389 224 422 205" stroke="#84E3DA" strokeWidth="20" strokeLinecap="round" />
          <path d="M72 286C113 258 160 247 207 255C252 263 288 289 333 294C364 297 391 290 413 275" stroke="#4CA8FF" strokeWidth="16" strokeLinecap="round" />
          <path d="M168 168L214 204M344 168L298 204M168 344L214 308M344 344L298 308" stroke="#E8FBFF" strokeWidth="16" strokeLinecap="round" />
          <rect x="198" y="206" width="116" height="76" rx="34" fill="#E8FBFF" />
          <circle cx="256" cy="244" r="18" fill="#16324A" />
          <circle cx="150" cy="150" r="38" stroke="#E8FBFF" strokeWidth="16" />
          <circle cx="362" cy="150" r="38" stroke="#E8FBFF" strokeWidth="16" />
          <circle cx="150" cy="362" r="38" stroke="#E8FBFF" strokeWidth="16" />
          <circle cx="362" cy="362" r="38" stroke="#E8FBFF" strokeWidth="16" />
          <path d="M299 128C325 114 354 114 379 128M299 384C325 398 354 398 379 384" stroke="#84E3DA" strokeWidth="12" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
