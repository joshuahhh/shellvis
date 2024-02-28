import vsctm1, { IToken, IGrammar } from 'vscode-textmate';
import * as vsctm2 from 'vscode-textmate';
import oniguruma1 from 'vscode-oniguruma';
import * as oniguruma2 from 'vscode-oniguruma';

// how can anyone survive programming javascript
const vsctm = vsctm1 || vsctm2;
const oniguruma = oniguruma1 || oniguruma2;

// (this file is "isomorphic", fyi)

// -----------
// theme stuff
// -----------

export type ColorRule = {
  name?: string,
  scope: string[] | string,
  settings: {
    foreground?: string,
    background?: string,
    fontStyle?: string,
  },
};
export type ColorRuleSettings = ColorRule['settings'];
export type TokenWithSettings = IToken & { settings: ColorRuleSettings };


function scopeIsSubsetOf(scope: string, other: string) {
  return scope === other || scope.startsWith(other + '.');
}

function getScopes(colorRule: ColorRule) {
  return Array.isArray(colorRule.scope) ? colorRule.scope : [colorRule.scope];
}

function scopeMatchesColorRule(scope: string, colorRule: ColorRule) {
  return getScopes(colorRule).some(other => scopeIsSubsetOf(scope, other));
}

function resolveScope(scope: string, colorRules: ColorRule[]) {
  for (const rule of colorRules) {
    if (scopeMatchesColorRule(scope, rule)) {
      return rule;
    }
  }
  return null;
}

// I think they're reverse order of specificity?
function resolveScopes(scopes: string[], colorRules: ColorRule[]) {
  for (const scope of scopes.toReversed()) {
    const rule = resolveScope(scope, colorRules);
    if (rule) {
      return rule;
    }
  }
  return null;
}


// -------------
// grammar stuff
// -------------

export async function getOnigLib(wasmbin: Response | ArrayBuffer | ArrayBufferView) {
  await oniguruma.loadWASM(wasmbin);
  return {
    createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
    createOnigString: (str: string) => new oniguruma.OnigString(str),
  };
}

export function tokenizeLines(lines: string[], grammar: IGrammar, rules?: ColorRule[]): TokenWithSettings[][] {
  let ruleStack = vsctm.INITIAL;
  let results: TokenWithSettings[][] = [];
  for (const line of lines) {
    const tokenizeResult = grammar.tokenizeLine(line, ruleStack)
    const tokens = tokenizeResult.tokens.map((token) => {
      const rule = rules ? resolveScopes(token.scopes, rules) : null;
      return {
        ...token,
        settings: rule?.settings || {},
      };
    });
    results.push(tokens);
    ruleStack = tokenizeResult.ruleStack;
  }
  return results;
}
