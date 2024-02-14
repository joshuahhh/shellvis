import { useUpdateProxy } from "@engraft/update-proxy-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from '@mui/material';
import * as octicons from "@primer/octicons-react";
import AnsiToHtml from "ansi-to-html";
import sh from "mvdan-sh";
import React, { Fragment, memo, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as util from "util";
import { Decoration, addDecorationsToLine } from "../decorations.js";
import { Trace, mkExecId } from "../execution.js";
import { Interval, layOutIntervals, layOutIntervalsOneSide } from "../monotone.js";
import { LineTreeNode, Script, expandObject, getNodeId, nodePosInfo } from "../mvdan-sh-helpers.js";
import { Message } from "../tracing.js";
import { CallV } from "./CallV.js";
import { HVContext, defaultHVContext } from "./HVContext.js";
import { useGathering } from "./useGathering.js";

type TraceViewerVProps = {
  trace: Trace,
  optionalScript?: Script,
}

export const TraceViewerV = memo((props: TraceViewerVProps) => {
  const [ hvContext, setHVContext ] = React.useState<HVContext>(defaultHVContext);

  const hvContextUP = useUpdateProxy(setHVContext);

  return <HVContext.Provider value={hvContext}>
    <TraceV {...props} />
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <label>
        Details mode:
        <select
          value={hvContext.detailsMode}
          onChange={(e) => hvContextUP.detailsMode.$set(e.target.value as any)}
          style={{marginLeft: 10}}
        >
          <option value="in-place">in-place</option>
          <option value="on-side">on-side</option>
          <option value="one-by-one">one-by-one</option>
          <option value="none">none</option>
        </select>
      </label>
      <label>
        On-side layout:
        <select
          value={hvContext.onSideLayout}
          onChange={(e) => hvContextUP.onSideLayout.$set(e.target.value as any)}
          style={{marginLeft: 10}}
        >
          <option value="smart">smart</option>
          <option value="mid">mid</option>
          <option value="dumb">dumb</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={hvContext.showMessages}
          onChange={(e) => hvContextUP.showMessages.$set(e.target.checked)}
          style={{marginRight: 10}}
        />
        Show messages
      </label>
      <label>
        <input
          type="checkbox"
          checked={hvContext.showAST}
          onChange={(e) => setHVContext((hvContext) => ({ ...hvContext, showAST: e.target.checked }))}
          style={{marginRight: 10}}
        />
        Show AST
      </label>
    </div>
  </HVContext.Provider>;
});


const ansiToHtml = new AnsiToHtml({});

type TraceVProps = {
  trace: Trace,
  optionalScript?: Script,
}

const parser = sh.syntax.NewParser();

const TraceV = memo((props: TraceVProps) => {
  const {trace, optionalScript} = props;

  const [ lColumn, setLColumn ] = React.useState<HTMLElement | null>(null);
  const [ rColumn, setRColumn ] = React.useState<HTMLElement | null>(null);

  const script = useMemo(() => {
    // TODO ugly ugly
    try {
      return optionalScript || new Script(parser, trace.scriptSrc);
    } catch (e) {
      return new Script(parser, '');
    }
  }, [optionalScript, trace.scriptSrc]);

  const { showMessages, showAST, detailsMode } = useContext(HVContext);

  if (trace.parseError) {
    return <div>
      <h1>parse error</h1>
      <pre>{trace.parseError}</pre>
    </div>;
  }

  const partMain = script.lineTree.map((node, i) =>
    <Fragment key={i}>
      {renderLineTreeNode(script, trace, node, '')}
    </Fragment>
  );

  const partTransformed = () => trace.transformedSrc && <div>
    <h1>transformed</h1>
    <pre>
      {trace.transformedSrc.split('\n').map((line, i) =>
        `${String(i + 1).padStart(3)} ${line}
      `).join('\n')}
    </pre>
  </div>;

  const partAST = () => <div>
    <h1>ast</h1>
    {inspectHtml(expandObject(script.ast))}
  </div>;

  const partMessages = () => <div className="row">
    <div>
      <h1>messages</h1>
      <ul>
        {trace.messageLog.map((entry, i) =>
          <li key={i}>
            <MessageV message={entry} script={script} />
          </li>
        )}
      </ul>
    </div>
  </div>;

  const partExecInfo = () => <div>
    <h1>exec info</h1>
    <dl>
      {Object.entries(trace.execInfos).map(([execId, execInfo]) => {
        const { stdout, stderr, ...rest } = execInfo;
        return <Fragment key={execId}>
          <dt>{execId}</dt>
          <dd>
            <div><b>stdout</b> {stdout.done && <small>✓</small>}</div>
            <pre>{stdout.data}</pre>
            <div><b>stderr</b> {stderr.done && <small>✓</small>}</div>
            <pre>{stderr.data}</pre>
            <div><b>rest</b>
              {inspectHtml(rest)}
            </div>
          </dd>
        </Fragment>
      })}
    </dl>
  </div>;

  const partForInfo = () => <div>
    <h1>for info</h1>
    <dl>
      {Object.entries(trace.forInfos).map(([execId, forInfo]) => {
        return <Fragment key={execId}>
          <dt>{execId}</dt>
          <dd>
            <div><b>iterations</b></div>
            <ul>
              {forInfo.iterations.map((iteration, i) => <li key={i}>
                <div><b>counter</b> {iteration.counter}</div>
                <div><b>loopVarValue</b> {iteration.loopVarValue}</div>
              </li>)}
            </ul>
          </dd>
        </Fragment>
      })}
    </dl>
  </div>;

  return <div style={{display: 'flex', flexDirection: 'row'}}>
    <div className="left" style={{minWidth: 0}}>
      <div style={{fontSize: "80%", marginBottom: 10}}>
        {/* <div>started @ {this.startTime?.toLocaleTimeString()}</div> */}
        {/* <div>updated @ {new Date().toLocaleTimeString()}</div> */}
      </div>

      <div className="l-column" ref={setLColumn} style={{display: 'flex', flexDirection: 'column', height: 'fit-content'}}>
        {partMain}
      </div>

      <div className="row" style={{marginTop: 30}}></div>

      {showMessages && partMessages()}
      {false && partTransformed()}
      {showAST && partAST()}
      {false && partExecInfo()}
      {false && partForInfo()}
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

const MessageV = memo((props: { message: Message, script: Script }) => {
  const { message, script } = props;

  return <div>
    { message.nodeId &&
      <div style={{display: 'inline-block', border: '1px solid gray', padding: 4}}>
        <pre>{script.srcForNode(script.nodesById[message.nodeId])}</pre>
      </div>
    }
    { inspectHtml(message) }
  </div>
});



type LineVProps = {
  script: Script,
  trace: Trace,
  line: string,
  i: number,
  context: string,
}

const LineV = memo((props: LineVProps) => {
  const {script, trace, line, i, context} = props;

  const callExprs = Object.values(script.nodesByTypeById.CallExpr);
  const callExprsOnLine = callExprs.filter((callExpr) => {
    // TODO: everything's limited to single lines
    return nodePosInfo(callExpr).pos.line === i + 1;
  });
  const decorations: Decoration[] = callExprsOnLine.map((callExpr) => {
    return {
      start: nodePosInfo(callExpr).pos.col - 1,
      end: nodePosInfo(callExpr).end.col - 1,
      decorator: (contents) =>
        <CallV
          key={getNodeId(callExpr)}
          contents={contents}
          callExpr={callExpr}
          context={context}
          trace={trace}
          className={'call--on-left'}
        />
    };
  });
  const decoratedLine = addDecorationsToLine(line, decorations);
  return <div className="line">
    <div className="line__num">{i + 1}</div>
    <div className="line__contents">{decoratedLine}</div>
  </div>;
});

function renderLineTreeNode(script: Script, trace: Trace, node: LineTreeNode, context: string): React.ReactNode {
  if (node.type === 'line') {
    return <LineV script={script} trace={trace} line={node.line} i={node.lineNumStart - 1} context={context}/>;
  } else if (node.type === 'loop-body') {
    return <LoopBodyV node={node} script={script} trace={trace} context={context} />;
  }
}

function renderDeadTreeLineNode(script: Script, node: LineTreeNode): React.ReactNode {
  if (node.type === 'line') {
    // TODO: duplication from LineV
    return <div className="line line--dead">
      <div className="line__num">{node.lineNumStart}</div>
      <div className="line__contents">{node.line}</div>
    </div>;
  } else if (node.type === 'loop-body') {
    return node.children.map((child, i) =>
      <Fragment key={i}>
        {renderDeadTreeLineNode(script, child)}
      </Fragment>
    );
  }
}

const LoopBodyV = memo((props: {
  node: LineTreeNode & { type: 'loop-body' },
  script: Script,
  trace: Trace,
  context: string,
}) => {
  const { node, script, trace, context } = props;
  const forClause = node.forClause;
  const forNodeId = getNodeId(forClause);
  const forInfo = trace.forInfos[mkExecId(context, forNodeId)];
  const iterations = forInfo?.iterations || [];
  const varName = (forClause.Loop as sh.WordIter).Name!.Value;
  const forLine = script.lines[forClause.Pos().Line() - 1];
  const forIndent = (forLine.match(/^\s*/)?.[0] || '  ');

  let [ viewState, setViewState ] = React.useState<'expanded' | { collapsedOn: number }>({ collapsedOn: 0 });
  const [ orientation, setOrientation ] = React.useState<'horizontal' | 'vertical'>('vertical');

  const [ sliderIsDragging, setSliderIsDragging ] = React.useState(false);

  if (iterations.length === 0) {
    return <>
      <div className="line">
        <div className="line__num"/>
        <div className="line__contents">
          <div className="for-loop-iteration-header">
            <div>{forIndent}</div>
            <div className="for-loop-iteration-header__label">
              no iterations
            </div>
          </div>
        </div>
      </div>
      {node.children.map((child, i) =>
        <Fragment key={i}>
          {renderDeadTreeLineNode(script, child)}
        </Fragment>
      )}
    </>;
  }

  if (viewState === 'expanded') {
    return <div
      style={{
        display: 'flex',
        flexDirection: orientation === 'horizontal' ? 'row' : 'column',
        ...orientation === 'horizontal' && {gap: 30},
        overflowX: 'auto',
      }}
    >
      {iterations.map((iteration, iterationIdx) =>
        <div key={iteration.counter}>
          <div className="line">
            <div className="line__num"/>
            <div className="line__contents">
              <div className="for-loop-iteration-header">
                <div>{forIndent}</div>
                <div className="for-loop-iteration-header__label">
                  {varName} = {iteration.loopVarValue}
                </div>
                <div style={{width: 10}}/>
                <div
                  className="for-loop-iteration-header__expand-toggle"
                  onClick={() => setViewState({ collapsedOn: iterationIdx })}
                  style={{
                    transform: orientation === 'horizontal' ? "rotate(90deg)" : "rotate(180deg)",
                    transition: "transform 0.2s",
                  }}
                >
                  <octicons.FoldIcon verticalAlign="middle"/>
                </div>
                <div
                  className="for-loop-iteration-header__expand-toggle"
                  onClick={() => setOrientation(orientation === 'horizontal' ? 'vertical' : 'horizontal')}
                >
                  <div
                     style={{
                      transform: orientation === 'horizontal' ? "rotate(90deg)" : "rotate(180deg)",
                      transition: "transform 0.2s",
                    }}
                  >
                    <FontAwesomeIcon icon="ellipsis-vertical" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {node.children.map((child, i) =>
            <Fragment key={i}>
              {renderLineTreeNode(script, trace, child, `${context}/${forNodeId}-${iteration.counter}`)}
            </Fragment>
          )}
        </div>
      )}
    </div>;
  } else {
    if (viewState.collapsedOn >= iterations.length) {
      viewState = { collapsedOn: iterations.length - 1 };
    }
    const iteration = iterations[viewState.collapsedOn];
    return <>
      <div className="line">
        <div className="line__num"/>
        <div className="line__contents">
          <div className={`for-loop-iteration-header ${sliderIsDragging ? 'for-loop-iteration-header--slider-is-dragging' : ''}`}>
            <div>{forIndent}</div>
            <LockSize lock={sliderIsDragging}>
              <div className="for-loop-iteration-header__label">
                {varName} = {iteration.loopVarValue}
              </div>
            </LockSize>
            <div style={{width: 10}}/>
            <div
              className="for-loop-iteration-header__expand-toggle"
              onClick={() => setViewState('expanded')}
              style={{
                transform: orientation === 'horizontal' ? "rotate(90deg)" : "rotate(180deg)",
              }}
            >
              <octicons.UnfoldIcon verticalAlign="middle"/>
            </div>
            <Slider
              className="for-loop-iteration-header__slider"
              size="small"
              min={0} max={iterations.length - 1} step={1}
              value={viewState.collapsedOn}
              onChange={(_, newValue) =>
                setViewState({ collapsedOn: newValue as number })
              }
              marks={iterations.length < 30}
              style={{
                width: Math.min(Math.max(10 * iterations.length, 0), 200),
              }}
              onMouseDown={() => { setSliderIsDragging(true); }}
              onChangeCommitted={() => { setSliderIsDragging(false); }}
            />
            <div>
              {viewState.collapsedOn + 1} / {iterations.length}
            </div>
          </div>
        </div>
      </div>
      {node.children.map((child, i) =>
        <Fragment key={i}>
          {renderLineTreeNode(script, trace, child, `${context}/${forNodeId}-${iteration.counter}`)}
        </Fragment>
      )}
    </>;
  }
});

const LockSize = memo((props: {
  children: React.ReactNode,
  lock: boolean
}) => {
  const { children, lock } = props;
  const [ wrapper, setWrapper ] = React.useState<HTMLElement | null>(null);
  const [ wrapperStyle, setWrapperStyle ] = React.useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if (!wrapper) { return; }
    if (lock) {
      const { width, height } = wrapper.getBoundingClientRect();
      setWrapperStyle({ width, height });
    } else {
      setWrapperStyle(null);
    }
  }, [wrapper, lock]);

  return <div style={{...wrapperStyle}} ref={setWrapper}>
    {children}
  </div>;
});

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}
