import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlLang } from "../lib/lang.ts";

const locale = (id: string) => ({ id, label: id });

test("htmlLang falls back to English", () => {
  assert.equal(htmlLang({}), "en");
  assert.equal(htmlLang({ lang: "  " }), "en");
});

test("htmlLang uses the site's lang", () => {
  assert.equal(htmlLang({ lang: "es" }), "es");
  assert.equal(htmlLang({ lang: "pt-BR" }), "pt-BR");
});

test("htmlLang uses the default locale, even when it's the only one", () => {
  assert.equal(htmlLang({ i18n: { locales: [locale("fr")] } }), "fr");
  assert.equal(htmlLang({ i18n: { locales: [locale("es"), locale("en")] } }), "es");
});

test("lang wins over the default locale", () => {
  assert.equal(htmlLang({ lang: "es-MX", i18n: { locales: [locale("es"), locale("en")] } }), "es-MX");
});
