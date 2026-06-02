import Script from "next/script";
import type { AnalyticsConfig } from "@/lib/config";

/**
 * Renders analytics snippets based on docs.json `analytics`. Each provider is
 * opt-in and only emitted when configured. Works in static export (the scripts
 * load client-side).
 */
export function Analytics({ config }: { config?: AnalyticsConfig }) {
  if (!config) return null;
  const { plausible, googleAnalytics, posthog } = config;
  return (
    <>
      {plausible?.domain && (
        <Script
          defer
          data-domain={plausible.domain}
          src={plausible.src ?? "https://plausible.io/js/script.js"}
          strategy="afterInteractive"
        />
      )}

      {googleAnalytics?.measurementId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalytics.measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="markline-ga" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${googleAnalytics.measurementId}');`}
          </Script>
        </>
      )}

      {posthog?.apiKey && (
        <Script id="markline-posthog" strategy="afterInteractive">
          {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${posthog.apiKey}',{api_host:'${posthog.apiHost ?? "https://us.i.posthog.com"}'});`}
        </Script>
      )}
    </>
  );
}
