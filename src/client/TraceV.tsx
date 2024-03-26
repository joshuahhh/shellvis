import { memo, useContext, useEffect, useState } from 'react';
import { Trace } from '../shared/execution.js';
import { Script } from '../shared/mvdan-sh-helpers.js';
import { HVContext } from './HVContext.js';
import { LineTreeNodeV } from './LineTreeNodeV.js';
import { rafLoop } from './rafLoop.js';
import { clsy } from './clsy.js';


export type TraceVProps = {
  trace: Trace,
  script: Script,
};

type BackgroundPos = {
  top: number,
  height: number,
};

export const TraceV = memo((props: TraceVProps) => {
  const { trace, script } = props;
  const { detailsMode, selections } = useContext(HVContext);

  const [ traceElem, setTraceElem ] = useState<HTMLDivElement | null>(null);
  const [ backgroundElem, setBackgroundElem ] = useState<HTMLDivElement | null>(null);

  const [ backgroundPos, setBackgroundPos ] = useState<BackgroundPos | null>(null);

  useEffect(() => {
    if (!traceElem) { return; }
    if (selections.length === 0) {
      setBackgroundPos(null);
      return;
    }

    const traceElemSaved = traceElem;

    function update() {
      const traceTop = traceElemSaved.offsetTop;

      let top = Infinity;
      let bottom = -Infinity;
      for (const selection of selections) {
        const elems = [
          ...traceElemSaved.querySelectorAll(`[data-line="${selection.start.line}"]`),
          ...traceElemSaved.querySelectorAll(`[data-line="${selection.end.line}"]`),
        ] as HTMLElement[];
        for (const elem of elems) {
          top = Math.min(top, elem.offsetTop - traceTop);
          bottom = Math.max(bottom, elem.offsetTop + elem.offsetHeight - traceTop);
        }
      };

      setBackgroundPos({
        top,
        height: bottom - top,
      });
    }

    setTimeout(() => {
      if (backgroundElem) {
        const backgroundBox = backgroundElem.getBoundingClientRect();
        const topMargin = 100;
        const bottomMargin = 50;
        if (backgroundBox.top < topMargin) {
          const top = backgroundElem.getBoundingClientRect().top;
          window.scrollBy(0, top - topMargin);
        }
        if (backgroundBox.bottom > window.innerHeight - bottomMargin) {
          const bottom = backgroundElem.getBoundingClientRect().bottom;
          window.scrollBy(0, bottom - window.innerHeight + bottomMargin);
        }
        // previously...
        // backgroundElem.scrollIntoView({block: 'center'});
      }
    }, 0);

    return rafLoop(update);
  }, [backgroundElem, selections, traceElem]);

  return <div data-dbg='TraceV'
    ref={setTraceElem}
    className={clsy(
      'relative px-3 pt-10 w-full',
      detailsMode === 'grid' &&
        'inline-grid grid-cols-[fit-content(0%)_minmax(0,max-content)_minmax(min-content,max-content)_1fr]'
    )}
  >
    { backgroundPos &&
      <div data-dbg='TraceV (selection background)'
        className={`
          absolute w-[200vw]
          -mx-3
          bg-zinc-700
          -z-50
        `}
        ref={setBackgroundElem}
        style={{
          top: backgroundPos.top,
          height: backgroundPos.height,
          transition: 'top 0.05s, height 0.05s',
        }}
      />
    }
    {script.lineTree.map((node, i) =>
      <LineTreeNodeV key={i} script={script} trace={trace} node={node} context=''/>
    )}
  </div>;
});
