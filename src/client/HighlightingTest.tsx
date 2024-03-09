import { memo, useEffect, useState } from "react";
import { TokenWithSettings } from "../shared/highlight.js";
import { WebHighlighter } from "./WebHighlighter.js";
import scriptUrl from "../../examples/test.sh?url";


// just a syntax highlighting test

const highlighter = new WebHighlighter();

export const HighlightingTest = memo(() => {
  const [ lines, setLines ] = useState<string[] | null>(null);
  const [ tokensByLine, setTokensByLine ] = useState<TokenWithSettings[][] | null>(null);

  useEffect(() => {
    (async () => {
      const text = await (await fetch(scriptUrl)).text();
      const lines = text.split('\n');
      setLines(lines);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (lines === null) {
        return;
      }
      await highlighter.init();
      const tokensByLine = await highlighter.tokenizeLines(lines);
      setTokensByLine(tokensByLine);
    })();
  }, [lines]);

  return <div>
    <h1>Highlighting Test</h1>
    { tokensByLine === null || lines === null
      ? <p>Loading...</p>
      : <pre>
          {tokensByLine.map((tokens, i) => {
            return <div key={i} style={{ whiteSpace: 'pre' }}>
              <span style={{ display: 'inline-block', color: 'gray', width: 30, textAlign: 'right', marginRight: 20 }}>
                {i + 1}
              </span>
              {tokens.map((token, j) => {
                const style = token.settings.foreground ? { color: token.settings.foreground } : {};
                return <span key={j} style={style}>{lines[i].substring(token.startIndex, token.endIndex)}</span>;
              })}
            </div>;
          })}
        </pre>
    }
  </div>
});
