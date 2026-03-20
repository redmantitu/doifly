import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function getLocalNetworkHosts() {
  const hosts = new Set<string>();

  for (const entries of Object.values(networkInterfaces())) {
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      if (entry.internal) {
        continue;
      }

      if (entry.family === "IPv4" && entry.address) {
        hosts.add(entry.address);
      }
    }
  }

  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "::1",
    "*.localhost",
    "*.local",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    ...getLocalNetworkHosts(),
  ],
};

export default nextConfig;
