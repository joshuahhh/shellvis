import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from '@mui/material';
import * as octicons from "@primer/octicons-react";
import sh from "mvdan-sh";
import React, { Fragment, memo, useCallback, useContext, useEffect, useState } from "react";
import { Decoration, addDecorationsToLine, addDecorationsToLineHelper, addDecorationsToLineStarter } from "../decorations.js";
import { Iteration, Trace, mkExecId } from "../execution.js";
import { LineTreeNode, Script, getNodeId, nodePosInfo } from "../mvdan-sh-helpers.js";
import { CallV } from "./CallV.js";
import { HVContext } from "./HVContext.js";


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
  const { script, trace, line, i, context } = props;
  const { detailsMode } = useContext(HVContext);

  const [ nodes, starts, ends ] = addDecorationsToLineStarter(line);
  const colorDecorations: Decoration[] = script.tokensByLine![i].flatMap((token) => {
    if (token.settings.foreground){
      return {
        start: token.startIndex,
        end: token.endIndex,
        decorator: (contents) =>
          <span style={{color: token.settings.foreground}}>{contents}</span>
      };
    } else {
      return [];
    }
  });
  addDecorationsToLineHelper(nodes, starts, ends, colorDecorations);

  const callExprs = Object.values(script.nodesByTypeById.CallExpr);
  const callExprsOnLine = callExprs.filter((callExpr) => {
    // TODO: everything's limited to single lines
    return nodePosInfo(callExpr).pos.line === i + 1;
  });
  const callDecorations: Decoration[] = callExprsOnLine.map((callExpr) => {
    return {
      start: nodePosInfo(callExpr).pos.col - 1,
      end: nodePosInfo(callExpr).end.col - 1,
      decorator: (contents) =>
        detailsMode === 'grid'
        ? <div style={{display: 'inline-block', borderBottom: "1px solid", marginBottom: 2}}>{contents}</div>
        : <CallV
            key={getNodeId(callExpr)}
            contents={contents}
            callExpr={callExpr}
            context={context}
            trace={trace}
            className={'call--on-left'}
            showDetails={detailsMode === 'in-place'}
          />
    };
  });
  addDecorationsToLineHelper(nodes, starts, ends, callDecorations);

  return <div className="line">
    <div className="line__num">{i + 1}</div>
    <div className="line__contents">{nodes}</div>
    { detailsMode === 'grid' && callExprsOnLine.length > 0 &&
      <div className="line__calls">
        {callExprsOnLine.map((callExpr) =>
          <CallV
            key={getNodeId(callExpr)}
            contents={null}
            callExpr={callExpr}
            context={context}
            trace={trace}
            showHeader={false}
            showDetails={true}
          />
        )}
      </div>
    }
  </div>;
});

type LoopViewState = 'expanded' | { collapsedOn: number };
type LoopOrientation = 'horizontal' | 'vertical';

const LoopBodyV = memo((props: {
  node: LineTreeNode & { type: 'loop-body' },
  script: Script,
  trace: Trace,
  context: string,
}) => {
  const { node, script, trace, context } = props;
  const { detailsMode } = useContext(HVContext);

  const forClause = node.forClause;
  const forNodeId = getNodeId(forClause);
  const forInfo = trace.forInfos[mkExecId(context, forNodeId)];
  const iterations = forInfo?.iterations || [];
  const varName = (forClause.Loop as sh.WordIter).Name!.Value;
  const forLine = script.lines[forClause.Pos().Line() - 1];
  const forIndent = (forLine.match(/^\s*/)?.[0] || '  ');

  let [ viewState, setViewState ] = useState<LoopViewState>({ collapsedOn: 0 });
  const [ orientation, setOrientation ] = useState<LoopOrientation>('horizontal');

  if (detailsMode === 'in-place') {
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
                <div className="indented">
                  <div>{forIndent}</div>
                  <LoopHeader
                    viewState={viewState}
                    setViewState={setViewState}
                    orientation={orientation}
                    setOrientation={setOrientation}
                    iteration={iteration}
                    iterationIdx={iterationIdx}
                    varName={varName}
                    numIterations={iterations.length}
                  />
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
            <div className="indented">
              <div>{forIndent}</div>
              <LoopHeader
                viewState={viewState}
                setViewState={setViewState}
                orientation={orientation}
                setOrientation={setOrientation}
                iteration={iteration}
                iterationIdx={viewState.collapsedOn}
                varName={varName}
                numIterations={iterations.length}
              />
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
  } else if (detailsMode === 'grid') {
    if (iterations.length === 0) {
      return <>
        <div className="line__calls">
          <div className="for-loop-iteration-header">
            <div>{forIndent}</div>
            <div className="for-loop-iteration-header__label">
              no iterations
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
      throw new Error("not implemented");
    }
    if (viewState.collapsedOn >= iterations.length) {
      viewState = { collapsedOn: iterations.length - 1 };
    }
    const iteration = iterations[viewState.collapsedOn];
    return <>
      <div className="line__calls">
        <LoopHeader
          viewState={viewState}
          setViewState={setViewState}
          orientation={orientation}
          setOrientation={setOrientation}
          iteration={iteration}
          iterationIdx={viewState.collapsedOn}
          varName={varName}
          numIterations={iterations.length}
          allowExpand={false}
        />
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
  } else {
    return null;
  }
});

const LoopHeader = memo((props: {
  viewState: LoopViewState,
  setViewState: (newState: LoopViewState) => void,
  orientation: LoopOrientation,
  setOrientation: (newOrientation: LoopOrientation) => void,
  iteration: Iteration,
  iterationIdx: number,
  varName: string,
  numIterations: number,
  allowExpand?: boolean,
}) => {
  const { viewState, setViewState, orientation, setOrientation, iteration, iterationIdx, varName, numIterations, allowExpand = true } = props;

  const [ sliderIsDragging, setSliderIsDragging ] = useState(false);

  const toggleExpanded = useCallback(() => {
    if (viewState === 'expanded') {
      setViewState({ collapsedOn: iterationIdx });
    } else {
      setViewState('expanded');
    }
  }, [iterationIdx, setViewState, viewState]);

  const toggleOrientation = useCallback(() => {
    setOrientation(orientation === 'horizontal' ? 'vertical' : 'horizontal');
  }, [orientation, setOrientation]);


  return <div className={`for-loop-iteration-header ${sliderIsDragging ? 'for-loop-iteration-header--slider-is-dragging' : ''}`}>
    <LockSize lock={sliderIsDragging}>
      <div className="for-loop-iteration-header__label">
        {varName} = {iteration.loopVarValue}
      </div>
    </LockSize>
    <div style={{width: 10}}/>
    { allowExpand &&
      <div
        className="for-loop-iteration-header__expand-toggle"
        onClick={toggleExpanded}
        style={{
          transform: orientation === 'horizontal' ? "rotate(90deg)" : "rotate(180deg)",
          transition: "transform 0.2s",
        }}
      >
        { viewState === 'expanded'
        ? <octicons.FoldIcon verticalAlign="middle"/>
        : <octicons.UnfoldIcon verticalAlign="middle"/>
        }
      </div>
    }
    { viewState === 'expanded' &&
      <div
        className="for-loop-iteration-header__expand-toggle"
        onClick={toggleOrientation}
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
    }
    { viewState !== 'expanded' && <>
      <Slider
        className="for-loop-iteration-header__slider"
        size="small"
        min={0} max={numIterations - 1} step={1}
        value={viewState.collapsedOn}
        onChange={(_, newValue) =>
          setViewState({ collapsedOn: newValue as number })
        }
        marks={numIterations < 30}
        style={{
          width: Math.min(Math.max(10 * numIterations, 0), 200),
        }}
        onMouseDown={() => { setSliderIsDragging(true); }}
        onChangeCommitted={() => { setSliderIsDragging(false); }}
      />
      <div>
        {viewState.collapsedOn + 1} / {numIterations}
      </div>
    </>}
  </div>;
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
