"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      const DEV_SW_RESET_KEY = "doifly.dev-sw-reset";

      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });

      if ("caches" in window) {
        void caches.keys().then((keys) => {
          keys.forEach((key) => {
            void caches.delete(key);
          });
        });
      }

      if (
        navigator.serviceWorker.controller &&
        !sessionStorage.getItem(DEV_SW_RESET_KEY)
      ) {
        sessionStorage.setItem(DEV_SW_RESET_KEY, "1");
        window.location.reload();
      }

      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => {
        // Ignore registration failures in unsupported/private browsing scenarios.
      });
  }, []);

  return null;
}
