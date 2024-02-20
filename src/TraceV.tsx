import sh from "mvdan-sh";
import React, { Fragment, memo, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Trace, mkExecId } from "../execution.js";
import { Interval, layOutIntervals, layOutIntervalsOneSide } from "../monotone.js";
import { Script, getNodeId } from "../mvdan-sh-helpers.js";
import { CallV } from "./CallV.js";
import { HVContext } from "./HVContext.js";
import { LineTreeNodeV } from "./LineTreeNodeV.js";
import { useGathering } from "./useGathering.js";

type TraceVProps = {
  trace: Trace,
  script: Script,
}

export const TraceV = memo((props: TraceVProps) => {
  const { trace, script } = props;

  const { detailsMode } = useContext(HVContext);

  const [ lColumn, setLColumn ] = React.useState<HTMLElement | null>(null);
  const [ rColumn, setRColumn ] = React.useState<HTMLElement | null>(null);

  return <div style={{display: 'flex', flexDirection: 'row'}}>
    <div className="left" style={{minWidth: 0}}>
      <div className="l-column" ref={setLColumn} style={{display: 'flex', flexDirection: 'column', height: 'fit-content'}}>
        {script.lineTree.map((node, i) =>
          <LineTreeNodeV key={i} script={script} trace={trace} node={node} context=""/>
        )}
      </div>

    </div>
    <div
      className="right" ref={setRColumn}
      style={{display: 'flex', marginLeft: 40}}
    >
      { detailsMode === 'on-side' &&
        <DetailsOnSide trace={trace} script={script} lColumn={lColumn} rColumn={rColumn}/>
      }
    </div>
  </div>;
});

const DetailsOnSide = memo((props: {
  trace: Trace,
  script: Script,
  lColumn: HTMLElement | null,
  rColumn: HTMLElement | null,
}) => {
  const { trace, script, lColumn, rColumn } = props;

  const callExprs = Object.values(script.nodesByTypeById.CallExpr);

  const hvContext = useContext(HVContext);

  const [ scroll, setScroll ] = useState(0);

  useEffect(() => {
    if (!lColumn || !rColumn) { return; }
    const lHeight = lColumn.getBoundingClientRect().height;
    // const rHeight = rColumn.getBoundingClientRect().height;
    const wHeight = window.innerHeight;
    const update = () => {
      // as scroll goes from 0 to lHeight - wHeight,
      // we want to go from 0 to rHeight - lHeight
      // setScroll(window.scrollY * (rHeight - lHeight) / (lHeight - wHeight));
      console.log("scroll", window.scrollY / (lHeight - wHeight));
    };
    window.addEventListener('scroll', update);
    return () => window.removeEventListener('scroll', update);
  }, [lColumn, rColumn])

  const [ rColumnContents, setRColumnContents ] = useState<HTMLElement | null>(null);

  const [ intervals, reportInterval ] = useGathering<Interval>();

  const layOutTops = useMemo(() => {
    if (hvContext.onSideLayout === 'smart') {
      return layOutIntervals(Object.values(intervals));
    } else if (hvContext.onSideLayout === 'mid') {
      return layOutIntervalsOneSide(Object.values(intervals));
    } else {
      return null;
    }
  }, [hvContext.onSideLayout, intervals]);

  // TODO: bad use of config context here
  return (
    <div className="details-on-side-1" style={{position: 'relative'}}>
      <div
        className="details-on-side-2"
        style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          fontFamily: 'monospace',
          position: 'relative', top: -scroll,
          transition: 'ease-in 0.2s top',
        }}
      >
        <div className="details-on-side-3" ref={setRColumnContents}>
        <HVContext.Provider value={{...hvContext, detailsMode: 'in-place'}}>
          {callExprs.map((callExpr) =>
            <CallOnRightV
              key={getNodeId(callExpr)}
              callExpr={callExpr}
              script={script}
              trace={trace}
              setScroll={setScroll}
              rColumnContents={rColumnContents}
              reportInterval={reportInterval}
              layOutTop={layOutTops?.[getNodeId(callExpr)]}
            />
          )}
        </HVContext.Provider>
        </div>
      </div>
    </div>
  );
});

function boxMinus(a: DOMRect, b: DOMRect) {
  return {
    top: a.top - b.top,
    left: a.left - b.left,
    bottom: a.bottom - b.top,
    right: a.right - b.left,
    width: a.width,
    height: a.height,
  };
}
type Boxy = ReturnType<typeof boxMinus>;

function topRelativeTo(elem: HTMLElement, container: HTMLElement) {
  return elem.getBoundingClientRect().top - container.getBoundingClientRect().top;
}

const CallOnRightV = memo((props: {
  callExpr: sh.CallExpr,
  script: Script,
  trace: Trace,
  setScroll: (scroll: number) => void,
  rColumnContents: HTMLElement | null,
  reportInterval: (id: string, interval: Interval | undefined) => void,
  layOutTop: number | undefined,
}) => {
  const { callExpr, script, trace, setScroll, rColumnContents, reportInterval, layOutTop } = props;

  const nodeId = getNodeId(callExpr);
  const context = '';
  const execId = mkExecId(context, nodeId);

  const [ lElem, setLElem ] = React.useState<HTMLElement | null>(null);
  const [ rElem, setRElem ] = React.useState<HTMLElement | null>(null);

  const [ rBox, setRBox ] = React.useState<Boxy | null>(null);
  const [ lBox, setLBox ] = React.useState<Boxy | null>(null);

  useEffect(() => {
    return rafLoop(() => {
      setLElem(document.querySelector(`[data-exec-id="${execId}"]`) as HTMLElement | null);
    });
  }, [execId])

  useEffect(() => {
    if (!lElem) {
      console.error(`couldn't find element for execId ${execId}`);
      return;
    }
    const update = () => {
      setLBox(boxMinus(lElem.getBoundingClientRect(), document.body.getBoundingClientRect()));
    };
    update();
    window.addEventListener('resize', update);
    const cancelLoop = rafLoop(update);
    return () => {
      cancelLoop();
      window.removeEventListener('resize', update);
    };
  }, [execId, lElem])

  useEffect(() => {
    if (!lElem || !rElem || !rColumnContents) { return; }
    const onLElemHover = () => {
      setScroll(topRelativeTo(rElem, rColumnContents) - topRelativeTo(lElem, document.body) + 40);
      // setScroll(lElem.getBoundingClientRect().top - 100);
      console.log("hover");
    }
    lElem.addEventListener('mouseenter', onLElemHover);
    return () => lElem.removeEventListener('mouseenter', onLElemHover);
  }, [lElem, rColumnContents, rElem, setScroll])

  useEffect(() => {
    if (!rElem) { return; }
    const update = () => {
      setRBox(boxMinus(rElem.getBoundingClientRect(), document.body.getBoundingClientRect()));
    };
    update();
    window.addEventListener('resize', update);
    const cancelLoop = rafLoop(update);
    return () => {
      cancelLoop();
      window.removeEventListener('resize', update);
    };
  }, [rElem, execId]);

  useEffect(() => {
    if (!lBox || !rBox) { return; }

    reportInterval(nodeId, {
      id: nodeId,
      leftTarget: lBox.top,
      width: rBox.height,
    });

    return () => {
      reportInterval(nodeId, undefined);
    }
  }, [lBox, nodeId, rBox, reportInterval])

  return <>
    {rBox && lBox && createPortal(
      <svg style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: -100, overflow: 'visible'}}>
        <line
          x1={lBox.right - 5} y1={lBox.top + 10}
          x2={rBox.left - 20} y2={lBox.top + 10}
          stroke="hsl(0, 0%, 30%)" strokeWidth="1"/>
        <line
          x1={rBox.left - 20} y1={lBox.top + 10}
          x2={rBox.left + 10} y2={rBox.top + 10}
          stroke="hsl(0, 0%, 30%)" strokeWidth="1"/>
      </svg>,
      document.body
    )}
    {lBox &&
      <div
        className="call-wrapper" ref={setRElem}
        style={{
          display: 'flex',
          ...layOutTop !== undefined && {position: 'absolute', top: layOutTop, width: 500},
        }}>
        <CallV
          contents={script.srcForNode(callExpr)}
          callExpr={callExpr}
          context={context}
          trace={trace}
          className='call--on-right'
          showHeader={false}
        />
      </div>
    }
  </>;
});

function rafLoop(cb: () => void): () => void {
  let id: number;
  function loop() {
    cb();
    id = requestAnimationFrame(loop);
  }
  id = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(id);
}
