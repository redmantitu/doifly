import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Do.I.Fly?",
    short_name: "Do.I.Fly?",
    description:
      "Check whether current drone conditions look workable with on-device profiles and a free 3-hour wind forecast.",
    start_url: "/",
    display: "standalone",
    background_color: "#08111c",
    theme_color: "#08111c",
    orientation: "portrait",
    icons: [
      {
        src: "/doifly-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/doifly-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
