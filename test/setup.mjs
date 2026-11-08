// Loaded before every test file (`node --import ./test/setup.mjs --test …`).
//
// Code in lib/ imports its siblings without extensions (`./paths`), the way
// Next resolves them. Node's own type-stripping loader needs the extension
// spelled out, so without this, any test importing such a file fails before
// it starts. This retries a failed relative import with `.ts` appended.
//
// Plain JS rather than TS so it loads before type stripping is involved.
import { registerHooks } from "node:module";

const ROOT = new URL("..", import.meta.url).href.replace(/\/$/, "");

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      // "@/lib/x" is the repo's own path alias, and next/server has no exports map.
      if (specifier.startsWith("@/")) return nextResolve(`${ROOT}/${specifier.slice(2)}${/\.\w+$/.test(specifier) ? "" : ".ts"}`, context);
      if (specifier === "next/server") return nextResolve("next/server.js", context);
      if (!specifier.startsWith(".") || /\.\w+$/.test(specifier)) throw err;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
