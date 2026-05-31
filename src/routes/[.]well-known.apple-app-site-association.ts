import { createFileRoute } from "@tanstack/react-router";

/**
 * Apple App Site Association (AASA) file.
 *
 * Served from https://pullbidlive.com/.well-known/apple-app-site-association so
 * iOS can route Universal Links (including the OAuth return URL) back into the
 * native app instead of leaving the user stranded in Safari.
 *
 * Requires the matching Associated Domains entitlement in the iOS project:
 *   applinks:pullbidlive.com
 *   webcredentials:pullbidlive.com
 */
const APP_ID = "F9D8V67RMY.com.pullbidlive.app";

const AASA = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [{ "/": "*", comment: "Match all paths for Universal Links" }],
      },
    ],
  },
  webcredentials: {
    apps: [APP_ID],
  },
};

export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(AASA), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
