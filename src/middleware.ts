import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { getCountryContinentCode } from "@/lib/countries";
import { isBot } from "@/lib/utils/is-bot";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

/**
 * Extract IP address from request headers.
 * Works with reverse proxies like Traefik, nginx, Cloudflare, etc.
 */
function getIpAddress(request: NextRequest): string | undefined {
  // Try various headers that reverse proxies set
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, first one is the client
    return forwardedFor.split(",")[0]?.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Cloudflare
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return undefined;
}

/**
 * Extract geolocation from request headers.
 * Works with Cloudflare, AWS CloudFront, or custom geo headers from reverse proxy.
 */
function getGeolocation(request: NextRequest): { country?: string; city?: string } {
  // Cloudflare headers
  const cfCountry = request.headers.get("cf-ipcountry");
  const cfCity = request.headers.get("cf-ipcity");

  // AWS CloudFront headers
  const awsCountry = request.headers.get("cloudfront-viewer-country");
  const awsCity = request.headers.get("cloudfront-viewer-city");

  // Generic geo headers (can be set by nginx with GeoIP module, etc.)
  const geoCountry = request.headers.get("x-geo-country");
  const geoCity = request.headers.get("x-geo-city");

  return {
    country: cfCountry || awsCountry || geoCountry || undefined,
    city: cfCity || awsCity || geoCity || undefined,
  };
}

async function resolveLinkAndLogAnalytics(request: NextRequest) {
  if (isProtectedRoute(request)) {
    return;
  }

  const { pathname, host, origin } = new URL(request.url);

  const shouldSkip =
    pathname === "/" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/cloaked/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.split("/").length > 2;

  if (shouldSkip) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get("user-agent");

  // Let social media bots through to the page component so they can see OG meta tags
  if (userAgent && isBot(userAgent)) {
    return NextResponse.next();
  }

  const geo = getGeolocation(request);
  const ip = getIpAddress(request);
  const referer = request.headers.get("referer");

  // In localhost/development, use simulated geo data or allow override via query param
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const simCountry = request.nextUrl.searchParams.get("geo"); // Allow ?geo=US for testing
  const country = simCountry || geo.country || (isLocalhost ? "US" : "Unknown");
  const city = geo.city || (isLocalhost ? "San Francisco" : "Unknown");
  // Derive continent from country code
  const continent = country && country !== "Unknown" ? getCountryContinentCode(country) : (isLocalhost ? "NA" : "Unknown");

  // Use internal URL for Docker/self-hosted environments (SSL terminated at reverse proxy)
  const internalOrigin = process.env.NODE_ENV === "production"
    ? "http://localhost:3000"
    : origin;

  const response = await fetch(
    encodeURI(
      `${internalOrigin}/api/link?domain=${host}&alias=${pathname}&country=${country}&city=${city}&continent=${continent}&ip=${ip}`,
    ),
    {
      headers: {
        "user-agent": userAgent ?? "",
        referer: referer ?? "",
      },
    },
  );

  if (!response.ok) {
    return NextResponse.next();
  }

  const data = await response.json();

  if (!data.url) {
    return NextResponse.next();
  }

  // Validate and normalize the URL before redirecting
  let redirectUrl: string;
  try {
    const parsedUrl = new URL(data.url, request.url);

    // Only allow http and https protocols (reject javascript:, data:, etc.)
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      console.error(`Blocked redirect to unsafe protocol: ${parsedUrl.protocol}`);
      return NextResponse.next();
    }

    redirectUrl = parsedUrl.toString();
  } catch {
    // If URL parsing fails, try prepending https://
    try {
      const fallbackUrl = new URL(`https://${data.url}`);
      if (fallbackUrl.protocol !== "https:") {
        return NextResponse.next();
      }
      redirectUrl = fallbackUrl.toString();
    } catch {
      console.error(`Invalid redirect URL: ${data.url}`);
      return NextResponse.next();
    }
  }

  // If cloaking is enabled, rewrite to cloaked page instead of redirecting
  // This keeps the short URL in the browser's address bar
  if (data.cloaking) {
    const encodedUrl = encodeURIComponent(redirectUrl);
    return NextResponse.rewrite(new URL(`/cloaked/${encodedUrl}`, request.url));
  }

  return NextResponse.redirect(redirectUrl);
}

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
  return resolveLinkAndLogAnalytics(req);
});

export const config = {
  matcher: [
    "/((?!_next|favicon|^[^/]+$|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
