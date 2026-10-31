/**
 * `theme.logo.icon`, shown before the site name in the header and footer. A
 * string, or `{ light, dark }` for a mark that needs a version per theme.
 * With `iconTile`, a single dark mark sits on a rounded tile in the text
 * colour (dark in light mode, light in dark mode) and is inverted to match.
 *
 * Presentational only, so it renders in both server and client trees.
 */
export type LogoIcon = string | { light?: string; dark?: string };

export function BrandIcon({ icon, tile }: { icon?: LogoIcon; tile?: boolean }) {
  if (!icon) return null;
  const light = typeof icon === "string" ? icon : (icon.light ?? icon.dark);
  const dark = typeof icon === "string" ? icon : (icon.dark ?? icon.light);
  if (!light) return null;
  const imgs =
    light === dark ? (
      <img className="brand-icon" src={light} alt="" />
    ) : (
      <>
        <img className="brand-icon brand-logo--light" src={light} alt="" />
        <img className="brand-icon brand-logo--dark" src={dark} alt="" />
      </>
    );
  return tile ? <span className="brand-tile">{imgs}</span> : imgs;
}
