import AnsiToHtmlConverter from 'ansi-to-html';
import sh from 'mvdan-sh';
import { memo, useMemo } from 'react';
import * as yaml from 'yaml';
import json5StringifyPrettyCompact from '../shared/json5-stringify-pretty-compact.js';
import { Script, expandObject } from '../shared/mvdan-sh-helpers.js';
import { normalizeIndent } from '../shared/normalizeIndent.js';
import { Highlighted } from './HighlightingTest.js';

const ansiToHtml = new AnsiToHtmlConverter();

export const ASTTest = memo(() => {
  return <div className='px-16 mt-4'>
    <h1 className='text-4xl mb-6 text-gray-300'>some ASTs</h1>
    <div className='grid grid-cols-[max-content_minmax(0,_1fr)]'>
      <Pane code='a | b'/>
      <Pane code='a >(b)'/>
      <Pane code='{ a; b; }'/>
      <Pane code={normalizeIndent`
        for i in 1 2 3; do
          echo "hello $i"
        done
      `}/>
      <Pane code={normalizeIndent`
        myfunc() {
          echo "hello"
        }

        hello
      `}/>
      <Pane code={normalizeIndent`
        x=1
        while [ $x -le 5 ]
        do
          echo "Welcome $x times"
          x=$(( $x + 1 ))
        done
      `}/>
    </div>
  </div>;
});

const parser = sh.syntax.NewParser();

const Pane = memo(({ code }: { code: string }) => {
  const script = useMemo(() => new Script(code, parser), [code]);

  return <>
    <div className='mr-8'>
      <Highlighted lines={script.lines} />
    </div>
    <div className='mb-3'>
      {false && <pre className='text-sm text-gray-300'>
        { json5StringifyPrettyCompact(expandObject(script.ast), { maxLength: 70 })
          .replaceAll(/^(\s*)\{\n\s*/gm, (...args) => {
            return args[1] + '{ ';
          })
        }
      </pre>}
      <pre className='text-sm text-gray-300' dangerouslySetInnerHTML={{__html:
        ansiToHtml.toHtml(
          yaml.stringify(
            removeBoringProperties(expandObject(script.ast)),
            {falseStr: 'no', trueStr: 'yes'})
          .replaceAll(/Type: (.*)$/gm, (_, type) =>
            `<span class="text-purple-400 underline">${type}</span>`)
          .replaceAll(/^(\s*)([a-zA-Z]*):(.*)$/gm, (_, ws, key, after) =>
            `${ws}<span class="italic">${key}:</span><span class="font-bold text-green-300">${after}</span>`)
        ),
      }}/>
    </div>
  </>;
});

function removeBoringProperties(obj: any): any {
  if (Array.isArray(obj)) { return obj.map(removeBoringProperties); }
  if (typeof obj !== 'object' || obj === null) { return obj; }
  return Object.fromEntries(
    Object.entries(obj)
    .filter(([_, v]) => v !== undefined && v !== null && v !== false && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k, removeBoringProperties(v)])
  );
}
