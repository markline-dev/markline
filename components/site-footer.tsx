import Link from "next/link";
import type { MarklineConfig, TopbarLink } from "@/lib/config";
import { navIcon } from "./docs/nav-icons";
import { BrandIcon } from "./brand-icon";

/**
 * The site footer from markline.json's `footer`: columns of links, then a
 * bottom row with the logo, copyright, small links, social icons and the
 * "Built with Markline" credit. Renders nothing when `footer` isn't set, and
 * the page shows the plain <SiteCredit/> line instead.
 *
 * Server-rendered (social icons come from Phosphor at build time); client
 * trees like the API reference receive it as a prop.
 */

/** Phosphor icon and accessible name for each social network. Anything else
 *  falls back to `<network>-logo` with the network as its name. */
const SOCIALS: Record<string, { icon: string; label: string }> = {
  github: { icon: "github-logo", label: "GitHub" },
  x: { icon: "x-logo", label: "X" },
  twitter: { icon: "x-logo", label: "X" },
  discord: { icon: "discord-logo", label: "Discord" },
  linkedin: { icon: "linkedin-logo", label: "LinkedIn" },
  youtube: { icon: "youtube-logo", label: "YouTube" },
  slack: { icon: "slack-logo", label: "Slack" },
  bluesky: { icon: "butterfly", label: "Bluesky" },
  mastodon: { icon: "mastodon-logo", label: "Mastodon" },
  instagram: { icon: "instagram-logo", label: "Instagram" },
  facebook: { icon: "facebook-logo", label: "Facebook" },
  reddit: { icon: "reddit-logo", label: "Reddit" },
  twitch: { icon: "twitch-logo", label: "Twitch" },
  tiktok: { icon: "tiktok-logo", label: "TikTok" },
  threads: { icon: "threads-logo", label: "Threads" },
  telegram: { icon: "telegram-logo", label: "Telegram" },
};

const external = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

function FooterLink({ link }: { link: TopbarLink }) {
  return external(link.href) ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
  ) : (
    <Link href={link.href}>{link.label}</Link>
  );
}

export function SiteFooter({ config }: { config: MarklineConfig }) {
  const footer = config.footer;
  if (!footer) return null;
  const columns = footer.columns ?? [];
  const socials = Object.entries(footer.socials ?? {});
  const logo = config.theme.logo;
  const hasImg = !!(logo?.light || logo?.dark);

  return (
    <footer className="site-footer">
      <div className="sf-in">
        {columns.length > 0 && (
          <div className="sf-cols">
            {columns.map((col) => (
              <nav key={col.title} className="sf-col" aria-label={col.title}>
                <h2>{col.title}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href + l.label}><FooterLink link={l} /></li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        )}

        <div className="sf-bottom">
          <div className="sf-meta">
            {footer.logo !== false && (
              <Link className="brand sf-logo" href="/" aria-label={`${config.name} home`}>
                {hasImg ? (
                  <>
                    <img className="brand-logo brand-logo--light" src={logo!.light ?? logo!.dark} alt="" />
                    <img className="brand-logo brand-logo--dark" src={logo!.dark ?? logo!.light} alt="" />
                  </>
                ) : (
                  <>
                    <BrandIcon icon={logo?.icon} tile={logo?.iconTile} />
                    <span className="brand-text">{logo?.text ?? config.name}</span>
                  </>
                )}
              </Link>
            )}
            {footer.copyright && <span>{footer.copyright}</span>}
            {(footer.links ?? []).map((l) => (
              <FooterLink key={l.href + l.label} link={l} />
            ))}
          </div>
          <div className="sf-end">
            {socials.length > 0 && (
              <ul className="sf-socials">
                {socials.map(([network, href]) => {
                  const s = SOCIALS[network.toLowerCase()] ?? { icon: `${network}-logo`, label: network };
                  return (
                    <li key={network}>
                      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}>
                        {navIcon(s.icon, 18)}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            <a className="sf-credit" href="https://markline.dev" target="_blank" rel="noopener noreferrer">
              Built with <span className="wordmark">Markline</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
