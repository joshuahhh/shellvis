import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from '@mui/material';
import * as octicons from "@primer/octicons-react";
import sh from "mvdan-sh";
import React, { Fragment, memo, useEffect } from "react";
import { Decoration, addDecorationsToLine } from "../decorations.js";
import { Trace, mkExecId } from "../execution.js";
import { LineTreeNode, Script, getNodeId, nodePosInfo } from "../mvdan-sh-helpers.js";
import { CallV } from "./CallV.js";


export type LineTreeNodeVProps = {
  script: Script,
  trace: Trace,
  node: LineTreeNode,
  context: string,
}

export const LineTreeNodeV = memo((props: LineTreeNodeVProps) => {
  const {script, trace, node, context} = props;

  if (node.type === 'line') {
    return <LineV script={script} trace={trace} line={node.line} i={node.lineNumStart - 1} context={context}/>;
  } else if (node.type === 'loop-body') {
    return <LoopBodyV node={node} script={script} trace={trace} context={context} />;
  }
});

type DeadLineTreeNodeVProps = {
  script: Script,
  node: LineTreeNode,
}

const DeadLineTreeNodeV = memo((props: DeadLineTreeNodeVProps) => {
  const {script, node} = props;

  if (node.type === 'line') {
    // TODO: duplication from LineV
    return <div className="line line--dead">
      <div className="line__num">{node.lineNumStart}</div>
      <div className="line__contents">{node.line}</div>
    </div>;
  } else if (node.type === 'loop-body') {
    return node.children.map((child, i) =>
      <Fragment key={i}>
        <DeadLineTreeNodeV script={script} node={child}/>
      </Fragment>
    );
  }
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
          <DeadLineTreeNodeV script={script} node={child}/>
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
              <LineTreeNodeV
                script={script} trace={trace} node={child}
                context={`${context}/${forNodeId}-${iteration.counter}`}
              />
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
          <LineTreeNodeV
            script={script} trace={trace} node={child}
            context={`${context}/${forNodeId}-${iteration.counter}`}
          />
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
