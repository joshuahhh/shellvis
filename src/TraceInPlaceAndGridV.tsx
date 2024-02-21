import { memo, useContext, useEffect, useState } from "react";
import { LineTreeNodeV } from "./LineTreeNodeV.js";
import { TraceVProps } from "./TraceV.js";
import { HVContext } from "./HVContext.js";
import { rafLoop } from "./rafLoop.js";

type BackgroundPos = {
  top: number,
  height: number,
};

export const TraceInPlaceAndGridV = memo((props: TraceVProps) => {
  const { trace, script } = props;
  const { detailsMode, selections } = useContext(HVContext);

  const [ traceElem, setTraceElem ] = useState<HTMLDivElement | null>(null);
  const [ backgroundElem, setBackgroundElem ] = useState<HTMLDivElement | null>(null);

  const [ backgroundPos, setBackgroundPos ] = useState<BackgroundPos | null>(null);

  useEffect(() => {
    if (!traceElem) { return; }
    if (selections.length === 0) { return; }

    // here's the plan...
    // run a function in a loop
    // here's what the function does...
    // 1. find all elements that match the selection
    // 2. find what their range of y positions is
    // 3. set backgroundPos accordingly

    const traceElemSaved = traceElem;

    function update() {
      const traceBox = traceElemSaved.getBoundingClientRect();

      let top = Infinity;
      let bottom = -Infinity;
      for (const selection of selections) {
        const elems = [
          ...traceElemSaved.querySelectorAll(`[data-line="${selection.start.line}"] > *`),
          ...traceElemSaved.querySelectorAll(`[data-line="${selection.end.line}"] > *`),
        ];
        for (const elem of elems) {
          const rect = (elem as HTMLElement).getBoundingClientRect();
          top = Math.min(top, rect.top - traceBox.top);
          bottom = Math.max(bottom, rect.bottom - traceBox.top);
        }
      };

      setBackgroundPos({
        top,
        height: bottom - top,
      });
    }

    setTimeout(() => {
      if (backgroundElem) {
        backgroundElem.scrollIntoView({block: 'center'});
      }
    });

    return rafLoop(update);
  }, [backgroundElem, selections, traceElem]);

  return <div
    className={`trace detailsMode-${detailsMode}`}
    ref={setTraceElem}
    style={{position: 'relative'}}
  >
    { backgroundPos &&
      <div
        className="trace-background"
        ref={setBackgroundElem}
        style={{
          position: 'absolute',
          width: 'calc(100% + 200px)',
          left: -100,
          top: backgroundPos.top,
          height: backgroundPos.height,
          backgroundColor: 'hsl(0, 0%, 20%)',
          zIndex: -100,
          transition: 'top 0.05s, height 0.05s',
        }}
      />
    }
    {script.lineTree.map((node, i) =>
      <LineTreeNodeV key={i} script={script} trace={trace} node={node} context=""/>
    )}
  </div>;
});
