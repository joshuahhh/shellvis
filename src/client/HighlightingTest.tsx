import { memo, useEffect, useState } from "react";
import scriptUrl from "../../examples/test.sh?url";
import { TokenWithSettings } from "../shared/highlight.js";
import { useBodyClass } from "./Body.js";
import { WebHighlighter } from "./WebHighlighter.js";
import { darkBodyClass } from "./darkBodyClass.js";

// just a syntax highlighting test

const highlighter = new WebHighlighter();

export const HighlightingTest = memo(() => {
  useBodyClass(darkBodyClass);

  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    (async () => {
      const text = await (await fetch(scriptUrl)).text();
      const lines = text.split("\n");
      setLines(lines);
    })();
  }, []);

  return (
    <div className="px-16 mt-4">
      <h1 className="text-4xl mb-6 text-gray-300">Highlighting Test</h1>
      <Highlighted lines={lines || []} />
    </div>
  );
});

export const Highlighted = memo(({ lines }: { lines: string[] }) => {
  const [tokensByLine, setTokensByLine] = useState<
    TokenWithSettings[][] | null
  >(null);

  useEffect(() => {
    (async () => {
      await highlighter.init();
      const tokensByLine = await highlighter.tokenizeLines(lines);
      setTokensByLine(tokensByLine);
    })();
  }, [lines]);

  return (
    <pre>
      {tokensByLine === null ? (
        <p>Loading...</p>
      ) : (
        tokensByLine.map((tokens, i) => {
          return (
            <div key={i} style={{ whiteSpace: "pre" }}>
              <span
                style={{
                  display: "inline-block",
                  color: "gray",
                  width: 30,
                  textAlign: "right",
                  marginRight: 20,
                }}
              >
                {i + 1}
              </span>
              {tokens.map((token, j) => {
                const style = token.settings.foreground
                  ? { color: token.settings.foreground }
                  : {};
                return (
                  <span key={j} style={style}>
                    {lines[i].substring(token.startIndex, token.endIndex)}
                  </span>
                );
              })}
            </div>
          );
        })
      )}
    </pre>
  );
});
