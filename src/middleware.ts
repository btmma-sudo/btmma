import { defineMiddleware } from "astro:middleware";

// The portal is installed in the site code but must NOT be public until
// STUDENT_PORTAL_ENABLED is intentionally set to "true" at launch.
// Protect *both* the dashboard and its API routes at the network boundary.
export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  const portalRoute = pathname === "/student-portal" ||
    pathname === "/student-portal/" ||
    pathname.startsWith("/student-portal/") ||
    pathname === "/api/student-portal" ||
    pathname.startsWith("/api/student-portal/");
  if (portalRoute) {
    const env = (context.locals as any)?.runtime?.env;
    if (env?.STUDENT_PORTAL_ENABLED !== "true") {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
  }
  return next();
});
