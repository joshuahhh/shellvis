import onigWasmUrl from "vscode-oniguruma/release/onig.wasm?url";
import * as vsctm from 'vscode-textmate';
import JSON5 from 'json5';
import { ColorRule, getOnigLib, tokenizeLines } from "../highlight.js";

import grammarUrl from "../shell-unix-bash.tmLanguage.json?url";
import themeUrl1 from "../dark_modern?url";
import themeUrl2 from "../dark_plus?url";
import themeUrl3 from "../dark_vs?url";


// this is just a wrapper around highlight.ts with some stuff fetched

export class WebHighlighter {
  private readonly registry: vsctm.Registry;
  private grammar: vsctm.IGrammar | null = null;
  private rules: ColorRule[] | null = null;

  constructor() {
    this.registry = new vsctm.Registry({
      onigLib: (async () => {
        const resp = await fetch(onigWasmUrl);
        return getOnigLib(resp);
      })(),
      loadGrammar: async (scopeName) => {
        if (scopeName === 'source.shell') {
          const resp = await fetch(grammarUrl);
          const grammar = await resp.text();
          const parsed = vsctm.parseRawGrammar(grammar, 'grammar.json');
          return parsed;
        }
        return null;
      },
    });
  }

  async init() {
    if (this.rules === null) {
      const themeRules = await Promise.all([themeUrl1, themeUrl2, themeUrl3].map(async (url) => {
        const resp = await fetch(url);
        const text = await resp.text();
        const theme = JSON5.parse(text);
        const rules: ColorRule[] = theme.tokenColors || [];
        return rules;
      }));
      this.rules = themeRules.flat(1);
    }
    if (this.grammar === null) {
      this.grammar = await this.registry.loadGrammar('source.shell');
    }
  }

  public tokenizeLines(lines: string[]) {
    if (this.grammar === null || this.rules === null) {
      throw new Error('Not loaded');
    }
    return tokenizeLines(lines, this.grammar, this.rules);
  }
}
