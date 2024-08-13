import JSON5 from "json5";
import fsP from "node:fs/promises";
import vsctm from "vscode-textmate";
import { ColorRule, getOnigLib, tokenizeLines } from "../shared/highlight.js";

// this is a cute demo of rendering shell code in Node. one advantage it has
// over the web equivalent is that it can dynamically load theme files!

function relToScript(rel: string) {
  return new URL(rel, import.meta.url);
}

async function loadColorRulesFromTheme(themePath: URL): Promise<ColorRule[]> {
  const theme = JSON5.parse(await fsP.readFile(themePath, "utf-8"));
  const colorRules = theme.tokenColors || [];
  if (theme.include) {
    const includedColorRules = await loadColorRulesFromTheme(
      new URL(theme.include, themePath),
    );
    return [...colorRules, ...includedColorRules];
  }
  return colorRules;
}

function withColor(text: string, color: string) {
  // color is hex, like '#DCDCAA'
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

const registry = new vsctm.Registry({
  onigLib: (async () => {
    const wasmbin = await fsP.readFile(
      "./node_modules/vscode-oniguruma/release/onig.wasm",
    );
    return getOnigLib(wasmbin);
  })(),
  loadGrammar: async (scopeName) => {
    if (scopeName === "source.shell") {
      const grammar = await fsP.readFile(
        relToScript("../shared/vendor-vscode/shell-unix-bash.tmLanguage.json"),
        "utf-8",
      );
      const parsed = vsctm.parseRawGrammar(grammar, "grammar.json");
      return parsed;
    }
    return null;
  },
});

async function main() {
  const rules = await loadColorRulesFromTheme(
    relToScript("../shared/vendor-vscode/dark_modern.json"),
  );

  const grammar = await registry.loadGrammar("source.shell");
  if (!grammar) {
    console.error("Failed to load grammar");
    return;
  }

  const text = await fsP.readFile(
    relToScript("../../examples/test.sh"),
    "utf-8",
  );
  const lines = text.split("\n");

  const tokensByLine = tokenizeLines(lines, grammar, rules);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tokens = tokensByLine[i];

    let lineColored = "";
    for (const token of tokens) {
      if (token.settings.foreground) {
        lineColored += withColor(
          line.substring(token.startIndex, token.endIndex),
          token.settings.foreground,
        );
      } else {
        lineColored += line.substring(token.startIndex, token.endIndex);
      }
    }
    console.log(lineColored);
  }
}

main();
