import { weakMapCache } from "@engraft/shared/lib/cache.js";
import AnsiToHtml from "ansi-to-html";
import sh from "mvdan-sh";
import React, { Fragment, memo, useCallback, useMemo } from "react";
import * as util from "util";
import { Decoration, addDecorationsToLine } from "../decorations.js";
import { Iteration, Trace, mkExecId } from "../execution.js";
import { LineTreeNode, Script, expandObject, getNodeId } from "../mvdan-sh-helpers.js";
import { Message } from "../tracing.js";
import { CallV } from "./CallV.js";
import * as octicons from "@primer/octicons-react";
import { Slider } from '@mui/material';


const ansiToHtml = new AnsiToHtml({});

type TraceVProps = {
  trace: Trace,
  optionalScript?: Script,
}

const parser = sh.syntax.NewParser();

export const TraceV = memo((props: TraceVProps) => {
  const {trace, optionalScript} = props;

  const script = useMemo(() => {
    // TODO ugly ugly
    try {
      return optionalScript || new Script(parser, trace.scriptSrc);
    } catch (e) {
      return new Script(parser, '');
    }
  }, [trace.scriptSrc]);

  if (trace.parseError) {
    return <div>
      <h1>parse error</h1>
      <pre>{trace.parseError}</pre>
    </div>;
  }

  const partMain = <div>
    {script.lineTree.map((node, i) =>
      <Fragment key={i}>
        {renderLineTreeNode(script, trace, node, '')}
      </Fragment>
    )}
  </div>;

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
    <details open={false}>
      {inspectHtml(expandObject(script.ast))}
    </details>
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

  return <>
    <div style={{fontSize: "80%", marginBottom: 10}}>
      {/* <div>started @ {this.startTime?.toLocaleTimeString()}</div> */}
      {/* <div>updated @ {new Date().toLocaleTimeString()}</div> */}
    </div>

    {true && partMain}

    <div className="row" style={{marginTop: 1000}}></div>

    {false && partTransformed()}
    {false && partAST()}
    {true && partMessages()}
    {false && partExecInfo()}
    {true && partForInfo()}
  </>;
});

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

// TODO: this is a performance help cuz the Go stuff is slow; not sure how best to handle this
const nodePosInfo = weakMapCache((node: sh.Node) => ({
  pos: {
    line: node.Pos().Line(),
    col: node.Pos().Col(),
  },
  end: {
    line: node.End().Line(),
    col: node.End().Col(),
  },
}));

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
  const forIndent = (forLine.match(/^\s*/)?.[0] || '') + ' ';

  const [ viewState, setViewState ] = React.useState<'expanded' | { collapsedOn: number }>({ collapsedOn: 0 });

  if (iterations.length === 0) {
    return <>
      <div className="line">
        <div className="line__num"/>
        <div className="line__contents">
          <div className="for-loop-iteration-header">
            <span>{forIndent}</span>
            <span className="for-loop-iteration-header__label">
              no iterations
            </span>
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
    return iterations.map((iteration, iterationIdx) => {
      return <Fragment key={iteration.counter}>
        <div className="line">
          <div className="line__num"/>
          <div className="line__contents">
            <div className="for-loop-iteration-header">
              <span>{forIndent}</span>
              <span className="for-loop-iteration-header__label">
                {varName} = {iteration.loopVarValue}
              </span>
              <span
                className="for-loop-iteration-header__expand-toggle"
                onClick={() => setViewState({ collapsedOn: iterationIdx })}
              >
                <octicons.FoldIcon/>
              </span>
            </div>
          </div>
        </div>
        {node.children.map((child, i) =>
          <Fragment key={i}>
            {renderLineTreeNode(script, trace, child, `${context}/${forNodeId}-${iteration.counter}`)}
          </Fragment>
        )}
      </Fragment>;
    });
  } else {
    const iteration = iterations[viewState.collapsedOn];

    return <>
      <div className="line">
        <div className="line__num"/>
        <div className="line__contents">
          <div className="for-loop-iteration-header">
            <span>{forIndent}</span>
            <span className="for-loop-iteration-header__label">
              {varName} = {iteration.loopVarValue}
            </span>
            <IterationSliderV
              iterations={iterations}
              viewState={viewState}
              setViewState={setViewState}
            />
            <span>
              {viewState.collapsedOn + 1} / {iterations.length}
            </span>
            <span
              className="for-loop-iteration-header__expand-toggle"
              onClick={() => setViewState('expanded')}
            >
              <octicons.UnfoldIcon/>
            </span>
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

const IterationSliderV = memo((props: {
  iterations: Iteration[],
  viewState: { collapsedOn: number },
  setViewState: (newState: { collapsedOn: number }) => void,
}) => {
  const { iterations, viewState, setViewState } = props;

  const [ sliderStabilization, setSliderStabilization ] = React.useState<React.CSSProperties | null>(null);
  const [ wrapperStabilization, setWrapperStabilization ] = React.useState<React.CSSProperties | null>(null);

  return <>
    <div style={{display: 'flex', ...wrapperStabilization}}>
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
          ...sliderStabilization,
          width: Math.min(Math.max(10 * iterations.length, 0), 200)
        }}
        onMouseDown={(e) => {
          const elem = e.currentTarget as HTMLElement;
          const wrapper = elem.parentElement!;
          setWrapperStabilization({
            width: wrapper.offsetWidth,
            height: wrapper.offsetHeight,
          });
          const elemRect = elem.getBoundingClientRect();
          const header = elem.closest('.for-loop-iteration-header') as HTMLElement;
          const headerRect = header.getBoundingClientRect();
          setSliderStabilization({
            left: elemRect.left - headerRect.left,
            top: elemRect.top - headerRect.top,
            position: 'absolute',
            zIndex: 1000,
            margin: 0,
          });
        }}
        onChangeCommitted={(e) => {
          setSliderStabilization(null);
          setWrapperStabilization(null);
        }}
      />
    </div>
  </>;
});

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}
