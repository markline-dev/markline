// Custom Shiki theme matching the Propeller brand palette.
// Indigo-blue keywords, cool-gray text, muted italic comments, soft-blue
// functions/types. Background is set to midnight-1100.
import type { ThemeRegistrationRaw } from "shiki";

// One Dark-inspired palette mirrored by components/docs/code-block.tsx.
const FG       = "#D7DADF";
const COMMENT  = "#646A71";
const STRING   = "#E5A87B"; // warm peach
const KEYWORD  = "#C678DD"; // import / def / return / if … (pink-magenta)
const BOOL     = "#C678DD"; // true / false / null / None
const NUMBER   = "#E5C07B"; // numbers — soft yellow
const BUILTIN  = "#E5C07B"; // print / console / len … same yellow
const FUNCTION = "#73A9F4"; // function calls / object keys
const TYPE     = "#56B6C2"; // types — cyan
const PUNCT    = "#8E959C";

// Shiki reads `settings` (TextMate-style). Some loaders ignore the VS-Code-style
// `tokenColors` field, so we author rules directly in `settings`.
export const propellerDark: ThemeRegistrationRaw = {
  name: "propeller-dark",
  type: "dark",
  colors: {
    "editor.background":           "#0E141B",
    "editor.foreground":           FG,
    "editorLineNumber.foreground": "#4A5056",
  },
  settings: [
    // Global default
    { settings: { foreground: FG, background: "#0E141B" } },

    // Comments
    { scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: COMMENT, fontStyle: "italic" } },

    // Strings
    { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string"],
      settings: { foreground: STRING } },

    // Numbers + constants
    { scope: ["constant.numeric", "constant.character"],
      settings: { foreground: NUMBER } },
    { scope: ["constant.language", "constant.language.boolean",
              "constant.language.null", "constant.language.undefined",
              "constant.language.import-export-all"],
      settings: { foreground: BOOL } },

    // Keywords / storage / control flow
    { scope: ["keyword", "keyword.control", "keyword.operator.expression",
              "keyword.operator.new", "keyword.operator.logical.python",
              "storage", "storage.type", "storage.modifier"],
      settings: { foreground: KEYWORD } },

    // Built-in functions (print, console, len, ...) — distinct from user-defined fns.
    { scope: ["support.function.builtin", "support.function.builtin.python",
              "variable.language.builtin", "support.function.print.python",
              "support.function.node", "support.variable.console"],
      settings: { foreground: BUILTIN } },

    // Operators (muted, between keywords and punctuation)
    { scope: ["keyword.operator", "keyword.operator.assignment",
              "keyword.operator.arithmetic", "keyword.operator.comparison"],
      settings: { foreground: PUNCT } },

    // Functions
    { scope: ["entity.name.function", "support.function",
              "meta.function-call", "meta.function-call.python",
              "variable.function"],
      settings: { foreground: FUNCTION } },

    // Types / classes
    { scope: ["support.type", "entity.name.type", "support.class",
              "entity.name.class", "entity.other.inherited-class",
              "meta.type.annotation", "support.type.builtin"],
      settings: { foreground: TYPE } },

    // Variables (default to FG — readable but not loud)
    { scope: ["variable", "variable.other", "variable.parameter",
              "meta.definition.variable", "meta.variable"],
      settings: { foreground: FG } },

    // JSON object keys
    { scope: ["meta.object-literal.key", "support.type.property-name",
              "meta.structure.dictionary.key.json", "string.json.key"],
      settings: { foreground: KEYWORD } },

    // Shell / bash
    { scope: ["variable.parameter.option.shell", "entity.name.command.shell",
              "support.function.builtin.shell", "entity.name.function.shell"],
      settings: { foreground: KEYWORD } },
    { scope: ["variable.other.normal.shell", "variable.other.shell",
              "string.unquoted.shell"],
      settings: { foreground: FG } },

    // Markdown / MDX
    { scope: ["markup.heading"],
      settings: { foreground: KEYWORD, fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { foreground: FG, fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { foreground: FG, fontStyle: "italic" } },
    { scope: ["markup.inline.raw"], settings: { foreground: STRING } },

    // Punctuation (muted so it doesn't compete with tokens)
    { scope: ["punctuation", "punctuation.separator", "punctuation.terminator",
              "punctuation.section", "meta.brace", "meta.delimiter",
              "meta.bracket"],
      settings: { foreground: PUNCT } },
  ],
};
