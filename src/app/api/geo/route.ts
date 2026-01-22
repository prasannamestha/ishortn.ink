import { type NextRequest } from "next/server";

/**
 * Extract IP address from request headers.
 * Works with reverse proxies like Traefik, nginx, Cloudflare, etc.
 */
function getIpAddress(request: NextRequest): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return undefined;
}

/**
 * Extract geolocation from request headers.
 * Works with Cloudflare, AWS CloudFront, or custom geo headers.
 */
function getGeolocation(request: NextRequest) {
  // Cloudflare headers
  const cfCountry = request.headers.get("cf-ipcountry");
  const cfCity = request.headers.get("cf-ipcity");
  const cfRegion = request.headers.get("cf-region");
  const cfLatitude = request.headers.get("cf-iplat");
  const cfLongitude = request.headers.get("cf-iplon");

  // AWS CloudFront headers
  const awsCountry = request.headers.get("cloudfront-viewer-country");
  const awsCity = request.headers.get("cloudfront-viewer-city");
  const awsRegion = request.headers.get("cloudfront-viewer-country-region");
  const awsLatitude = request.headers.get("cloudfront-viewer-latitude");
  const awsLongitude = request.headers.get("cloudfront-viewer-longitude");

  // Generic geo headers (can be set by nginx with GeoIP module, etc.)
  const geoCountry = request.headers.get("x-geo-country");
  const geoCity = request.headers.get("x-geo-city");
  const geoRegion = request.headers.get("x-geo-region");

  return {
    country: cfCountry || awsCountry || geoCountry || undefined,
    city: cfCity || awsCity || geoCity || undefined,
    region: cfRegion || awsRegion || geoRegion || undefined,
    latitude: cfLatitude || awsLatitude || undefined,
    longitude: cfLongitude || awsLongitude || undefined,
  };
}

export function GET(request: NextRequest) {
  const details = getGeolocation(request);
  const ip = getIpAddress(request);
  return Response.json({ ...details, ip });
}
