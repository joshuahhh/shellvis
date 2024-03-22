import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from '@mui/material';
import * as octicons from "@primer/octicons-react";
import sh from "mvdan-sh";
import React, { Fragment, memo, useCallback, useContext, useEffect, useState } from "react";
import { Decoration, addDecorationsToLineHelper, addDecorationsToLineStarter } from "./decorations.js";
import { Iteration, Trace, mkExecId } from "../shared/execution.js";
import { LineTreeNode, Script, getNodeId, nodePosInfo } from "../shared/mvdan-sh-helpers.js";
import { CallV } from "./CallV.js";
import { HVContext } from "./HVContext.js";
import tw from "./tailwind-styled-component/index.js";


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

const Line = tw.div<{$inPlace: boolean}>`
  line
  ${p => p.$inPlace ? "flex flex-row" : "contents"}
`;

const LineNum = tw.div`
  col-start-1
  text-gray-500
  mr-5
  text-right
  min-w-7
  font-mono
`;

const LineContents = tw.div`
  col-start-2
  grow basis-0 min-w-0 overflow-hidden
  whitespace-pre
  font-mono
  pr-5
`;

const LineCalls = tw.div`
  flex flex-row flex-wrap items-start
`;

const DeadLineTreeNodeV = memo((props: DeadLineTreeNodeVProps) => {
  const {script, node} = props;

  const { detailsMode } = useContext(HVContext);

  if (node.type === 'line') {
    // TODO: duplication from LineV
    return <Line data-line={node.lineNumStart - 1} $inPlace={detailsMode === 'in-place'} className="text-gray-400">
      <LineNum>{node.lineNumStart}</LineNum>
      <LineContents>{node.line}</LineContents>
    </Line>;
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
  let { detailsMode } = useContext(HVContext);

  const callExprs = Object.values(script.nodesByTypeById.CallExpr);
  const callExprsOnLine = callExprs.filter((callExpr) => {
    // TODO: everything's limited to single lines
    return nodePosInfo(callExpr).pos.line === i + 1;
  });

  let [ nodes, starts, ends ] = addDecorationsToLineStarter(line);
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

  const callDecorations: Decoration[] = callExprsOnLine.map((callExpr) => {
    const posInfo = nodePosInfo(callExpr);
    return {
      start: posInfo.pos.col - 1,
      end: posInfo.end.line > posInfo.pos.line ? line.length : posInfo.end.col - 1,
      decorator: (contents) =>
        detailsMode === 'grid'
        ? <div className="inline-block border-b border-b-gray-500 mb-1 border-dashed">
            {contents}
          </div>
        : <CallV
            key={getNodeId(callExpr)}
            header={contents}
            callExpr={callExpr}
            context={context}
            trace={trace}
            script={script}
          />
    };
  });
  try {
    addDecorationsToLineHelper(nodes, starts, ends, callDecorations);
  } catch (e) {
    // TODO: not great logic
    // TODO: and shouldn't happen in the first place
    [ nodes, starts, ends ] = addDecorationsToLineStarter(line);
    addDecorationsToLineHelper(nodes, starts, ends, callDecorations);
  }

  // count /s in context
  const depth = context.match(/\//g)?.length || 0;

  return <Line data-line={i} $inPlace={detailsMode === 'in-place'}>
    <LineNum>{i + 1}</LineNum>
    <LineContents>{nodes}</LineContents>
    { detailsMode === 'grid' && callExprsOnLine.length > 0 &&
      <LineCalls style={{paddingLeft: depth * 20}}>
        {callExprsOnLine.map((callExpr) =>
          <CallV
            key={getNodeId(callExpr)}
            callExpr={callExpr}
            context={context}
            script={script}
            trace={trace}
            showCodeLabel={callExprsOnLine.length > 1}
            callInfoClassName="mx-1 min-w-5 min-h-6"
          />
        )}
      </LineCalls>
    }
  </Line>;
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
  const forInfo = trace.forInfos[mkExecId({ context, nodeId: forNodeId })];
  const iterations = forInfo?.iterations || [];
  const varName = (forClause.Loop as sh.WordIter).Name!.Value;
  const forLineNum = forClause.Pos().Line() - 1;
  const forLine = script.lines[forLineNum];
  const forIndent = (forLine.match(/^\s*/)?.[0] || '  ');

  let [ viewState, setViewState ] = useState<LoopViewState>({ collapsedOn: 0 });
  const [ orientation, setOrientation ] = useState<LoopOrientation>('horizontal');

  if (detailsMode === 'in-place') {
    if (iterations.length === 0) {
      return <>
        <Line data-line={forLineNum} $inPlace={true}>
          <LineNum/>
          <LineContents>
            <ForLoopIterationHeader>
              <div>{forIndent}</div>
              <ForLoopIterationHeaderLabel>
                no iterations
              </ForLoopIterationHeaderLabel>
            </ForLoopIterationHeader>
          </LineContents>
        </Line>
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
            <Line data-line={forLineNum} $inPlace={true}>
              <LineNum/>
              <LineContents>
                <div className="flex flex-row">
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
              </LineContents>
            </Line>
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
        <Line data-line={forLineNum} $inPlace={true}>
          <LineNum/>
          <LineContents>
            <div className="flex flex-row">
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
          </LineContents>
        </Line>
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
    const depth = context.match(/\//g)?.length || 0;

    if (iterations.length === 0) {
      return <>
        <LineCalls style={{paddingLeft: depth * 20}} data-line={forLineNum}>
          <ForLoopIterationHeader>
            <div>{forIndent}</div>
            <ForLoopIterationHeaderLabel>
              no iterations
            </ForLoopIterationHeaderLabel>
          </ForLoopIterationHeader>
        </LineCalls>
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
      <LineCalls style={{paddingLeft: depth * 20}} data-line={forLineNum}>
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
      </LineCalls>
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

const ForLoopIterationHeader = tw.div`
  flex flex-row items-center
  relative  // for slider stabilization
  for-loop-iteration-header
  group
`;

const ForLoopIterationHeaderLabel = tw.div`
  text-sm
  text-white
  px-1
  w-fit
`;


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


  return <ForLoopIterationHeader className={sliderIsDragging ? 'for-loop-iteration-header--slider-is-dragging' : ''}>
    <LockSize lock={sliderIsDragging}>
      <ForLoopIterationHeaderLabel className="bg-blue-500">
        {varName} = {iteration.loopVarValue}
      </ForLoopIterationHeaderLabel>
    </LockSize>
    { allowExpand &&
      <div
        className="invisible group-hover:visible cursor-pointer px-2 flex"
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
        className="invisible group-hover:visible cursor-pointer px-2 flex"
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
        className="mx-4"
        size="small"
        min={0} max={numIterations - 1} step={1}
        value={viewState.collapsedOn}
        onChange={(_, newValue) =>
          setViewState({ collapsedOn: newValue as number })
        }
        marks={numIterations < 30}
        style={{
          width: Math.min(Math.max(10 * numIterations, 0), 100),
        }}
        onMouseDown={() => { setSliderIsDragging(true); }}
        onChangeCommitted={() => { setSliderIsDragging(false); }}
      />
      <div className="text-blue-400">
        {viewState.collapsedOn + 1} / {numIterations}
      </div>
    </>}
  </ForLoopIterationHeader>;
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
