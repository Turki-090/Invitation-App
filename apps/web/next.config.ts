import { validateWebEnvironment } from "@dawah/config";
import type { NextConfig } from "next";

const environment = validateWebEnvironment(process.env);
const deployed =
  environment.DAWAH_ENV === "staging" || environment.DAWAH_ENV === "production";
const development = environment.NODE_ENV === "development";
const apiOrigin = new URL(environment.NEXT_PUBLIC_API_URL).origin;
const supabaseOrigin = environment.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(environment.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;
const connectSources = new Set(["'self'", apiOrigin]);
const imageSources = new Set(["'self'", "blob:", "data:"]);

if (supabaseOrigin) {
  const supabaseUrl = new URL(supabaseOrigin);
  connectSources.add(supabaseOrigin);
  connectSources.add(`wss://${supabaseUrl.host}`);
  imageSources.add(supabaseOrigin);
}
if (development) {
  connectSources.add("ws://localhost:*");
  connectSources.add("ws://127.0.0.1:*");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${[...connectSources].join(" ")}`,
  `img-src ${[...imageSources].join(" ")}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  ...(deployed ? ["upgrade-insecure-requests"] : []),
].join("; ");

export const privateInvitationHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, no-cache, max-age=0, must-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@dawah/ui", "@dawah/api-client", "@dawah/api-contract"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          ...(deployed
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      {
        source: "/i/:token",
        headers: [...privateInvitationHeaders],
      },
      {
        source: "/:locale(ar-SA|en)/i/:token",
        headers: [...privateInvitationHeaders],
      },
    ];
  },
};

export default nextConfig;
