import { Slider } from '@mui/material';
import sh from 'mvdan-sh';
import React, { Fragment, memo, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ForIteration, Trace, mkExecId } from '../shared/execution.js';
import { LineTreeNode, Script, getNodeId, nodePosInfo } from '../shared/mvdan-sh-helpers.js';
import { CallInPlaceV, CallOnGridV } from './CallV.js';
import { HVContext } from './HVContext.js';
import { clsy } from './clsy.js';
import { Decoration, addDecorationsToLineHelper, addDecorationsToLineStarter } from './decorations.js';
import tw from './tailwind-styled-component/index.js';
import { useHover } from '@engraft/shared/lib/useHover.js';


export type LineTreeNodeVProps = {
  script: Script,
  trace: Trace,
  node: LineTreeNode,
  context: string,
  doThisOneThingForMeAndStickThisIntoTheFirstRHS?: ReactNode,
};

export const LineTreeNodeV = memo(function LineTreeNodeV (props: LineTreeNodeVProps) {
  const {script, trace, node, context, doThisOneThingForMeAndStickThisIntoTheFirstRHS} = props;

  if (doThisOneThingForMeAndStickThisIntoTheFirstRHS && node.type !== 'line') {
    console.warn('doThisOneThingForMeAndStickThisIntoTheFirstRHS is getting lost');
  }

  if (node.type === 'line') {
    return <LineV script={script} trace={trace} line={node.line} i={node.lineNumStart - 1} context={context} doThisOneThingForMeAndStickThisIntoTheFirstRHS={doThisOneThingForMeAndStickThisIntoTheFirstRHS} />;
  } else if (node.type === 'for-loop-body') {
    return <ForLoopBodyV node={node} script={script} trace={trace} context={context} />;
  } else if (node.type === 'while-loop-cond-and-body') {
    return <WhileLoopCondAndBodyV node={node} script={script} trace={trace} context={context} />;
  }
});

type DeadLineTreeNodeVProps = {
  script: Script,
  node: LineTreeNode,
};

const Line = tw.div<{$inPlace: boolean}>`
  line
  ${p => p.$inPlace ? 'flex flex-row' : 'contents'}
`;

const LineNum = memo(function LineNum (props: {children?: number}) {
  const { children } = props;

  const { hvContextUP, selections } = useContext(HVContext);

  const onClick = useCallback(() => {
    if (!hvContextUP || !children) { return; }
    if (selections.some(selection =>
      selection.start.line <= children - 1 && children - 1 <= selection.end.line
    )) {
      hvContextUP.selections.$set([]);
    } else {
      hvContextUP.selections.$set([
        { start: { line: children - 1 }, end: { line: children - 1 } },
      ]);
    }
  }, [hvContextUP, children, selections]);

  return <div
    className={clsy(`
      col-start-1
      text-gray-500
      mr-5
      text-right
      min-w-7
      font-mono
      select-none
      min-h-6
    `, children !== undefined && 'cursor-pointer')}
    onClick={onClick}
  >
    {props.children}
  </div>;
});

const LineContents = tw.div<{'data-line': number}>`
  LineContents
  col-start-2
  grow basis-0 min-w-0 overflow-hidden
  whitespace-pre
  font-mono
  pr-5
  self-start  // vertically shrink to contents
  min-h-5  // TODO: line height; delicate
`;

// non-pop-up third-col content should go in LineCalls
const LineCalls = tw.div`
  LineCalls
  min-w-0 col-span-1
`;

const DeadLineTreeNodeV = memo(function DeadLineTreeNodeV (props: DeadLineTreeNodeVProps) {
  const {script, node} = props;

  const { detailsMode } = useContext(HVContext);

  if (node.type === 'line') {
    // TODO: duplication from LineV
    return <Line $inPlace={detailsMode === 'in-place'} className='text-gray-400'>
      <LineNum>{node.lineNumStart}</LineNum>
      <LineContents data-line={node.lineNumStart - 1}>{node.line}</LineContents>
    </Line>;
  } else if (node.type === 'for-loop-body') {
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
  doThisOneThingForMeAndStickThisIntoTheFirstRHS?: ReactNode,
};

const LineV = memo(function LineV (props: LineVProps) {
  const { script, trace, line, i, context, doThisOneThingForMeAndStickThisIntoTheFirstRHS } = props;
  let { detailsMode, selections, abbreviateInfo } = useContext(HVContext);

  const [ setElem, isHovered ] = useHover();

  const callExprs = Object.values(script.nodesByTypeById.CallExpr);
  const callExprsOnLine = callExprs.filter((callExpr) => {
    // TODO: everything's limited to single lines
    return nodePosInfo(callExpr).pos.line === i + 1;
  });

  const abbreviate =
    abbreviateInfo === 'always'
    ? true
    : abbreviateInfo === 'never'
    ? false
    : !isHovered && !selections.some(selection =>
        selection.start.line <= i && i <= selection.end.line
      );

  let [ nodes, starts, ends ] = addDecorationsToLineStarter(line);
  const colorDecorations: Decoration[] = script.tokensByLine![i].flatMap((token) => {
    if (token.settings.foreground) {
      return {
        start: token.startIndex,
        end: token.endIndex,
        decorator: (contents) =>
          <span style={{color: token.settings.foreground}}>{contents}</span>,
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
        ? <div className='inline-block border-b border-b-gray-500 border-dashed'>
            {/* mb-1 */}
            {contents}
          </div>
        : <CallInPlaceV
            key={getNodeId(callExpr)}
            header={contents}
            callExpr={callExpr}
            context={context}
            trace={trace}
            abbreviate={abbreviate}
          />,
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

  return <Line $inPlace={detailsMode === 'in-place'}>
    <LineNum>{i + 1}</LineNum>
    <LineContents data-line={i}>{nodes}</LineContents>
    { doThisOneThingForMeAndStickThisIntoTheFirstRHS &&
      <div className='col-start-3'>
        { doThisOneThingForMeAndStickThisIntoTheFirstRHS }
      </div>
    }
    { detailsMode === 'grid' && callExprsOnLine.length > 0 &&
      // this div makes it easier to overlap a two-col popup over a one-col abbreviation
      <div className='grid grid-cols-subgrid col-span-2 col-start-3' ref={setElem}>
        <LineCalls style={{paddingLeft: depth * 20}} className='row-start-1 col-start-1 my-1 mx-1'>
          <div className={clsy('flex flex-wrap gap-1', !abbreviate && 'invisible')}>
            {callExprsOnLine.map((callExpr) =>
              <CallOnGridV
                key={getNodeId(callExpr)}
                callExpr={callExpr}
                context={context}
                script={script}
                trace={trace}
                showCodeLabel={callExprsOnLine.length > 1}
                abbreviate={true}
              />
            )}
          </div>
        </LineCalls>
        { !abbreviate &&
          <div style={{marginLeft: depth * 20 + 4}}
            className='row-start-1 col-start-1 col-span-2 my-1 relative'
          >
            <div className={clsy`
              absolute left-0 right-0 z-10 mx-1ee  // external positioning
            `}>
              <div className={clsy`
                w-fit max-w-[calc(100%_+_8px)]                  // external positioning
                // bg-zinc-700 px-1 pb-1 rounded-md  // selection background
                flex flex-wrap gap-1                            // layout of children
              `}>
              {callExprsOnLine.map((callExpr) =>
                <CallOnGridV
                  key={getNodeId(callExpr)}
                  callExpr={callExpr}
                  context={context}
                  script={script}
                  trace={trace}
                  showCodeLabel={callExprsOnLine.length > 1}
                  abbreviate={false}
                />
              )}
              </div>
            </div>
          </div>
        }
      </div>
    }
  </Line>;
});

const ForLoopBodyV = memo(function ForLoopBodyV (props: {
  node: LineTreeNode & { type: 'for-loop-body' },
  script: Script,
  trace: Trace,
  context: string,
}) {
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

  let [ iterationIdx, setIterationIdx ] = useState(0);
  if (iterationIdx >= iterations.length) {
    iterationIdx = iterations.length - 1;
  }
  const iteration = iterations[iterationIdx];

  if (detailsMode === 'in-place') {
    if (iterations.length === 0) {
      return <>
        <Line $inPlace={true}>
          <LineNum/>
          <LineContents data-line={forLineNum}>
            <ForLoopIterationHeader>
              <div>{forIndent}</div>
              <ForLoopIterationHeaderLabel className='border border-blue-500'>
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

    return <>
      <Line $inPlace={true}>
        <LineNum/>
        <LineContents data-line={forLineNum}>
          <div className='flex flex-row'>
            <div>{forIndent}</div>
            <LoopHeader
              iteration={iteration}
              iterationIdx={iterationIdx}
              setIterationIdx={setIterationIdx}
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
  } else if (detailsMode === 'grid') {
    const depth = context.match(/\//g)?.length || 0;

    if (forInfo && iterations.length === 0) {
      return <>
        <LineCalls style={{paddingLeft: depth * 20}} className='col-start-3'>
          <ForLoopIterationHeader>
            <div>{forIndent}</div>
            <ForLoopIterationHeaderLabel className='border border-blue-500 text-blue-500'>
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
    return <>
      <LineCalls style={{paddingLeft: depth * 20}} className='col-start-3'>
        { forInfo &&
          <LoopHeader
            iteration={iteration}
            iterationIdx={iterationIdx}
            setIterationIdx={setIterationIdx}
            varName={varName}
            numIterations={iterations.length}
          />
        }
      </LineCalls>
      {node.children.map((child, i) =>
        <Fragment key={i}>
          <LineTreeNodeV
            script={script} trace={trace} node={child}
            context={`${context}/${forNodeId}-${iteration?.counter}`}
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
  whitespace-nowrap
`;


const LoopHeader = memo(function LoopHeade (props: {
  varName?: string,
  iteration?: ForIteration,
  iterationIdx: number,
  setIterationIdx: (i: number) => void,
  numIterations: number,
}) {
  const { iteration, iterationIdx, setIterationIdx, varName, numIterations } = props;

  const [ sliderIsDragging, setSliderIsDragging ] = useState(false);

  return <ForLoopIterationHeader>
    <Slider
      className='mx-4'
      size='small'
      min={0} max={numIterations - 1} step={1}
      value={iterationIdx}
      onChange={(_, newValue) =>
        setIterationIdx(newValue as number)
      }
      marks={numIterations < 30}
      style={{
        width: Math.min(Math.max(10 * numIterations, 0), 100),
        padding: 0,
      }}
      onMouseDown={() => { setSliderIsDragging(true); }}
      onChangeCommitted={() => { setSliderIsDragging(false); }}
    />
    <div className='text-blue-400 whitespace-nowrap mr-4'>
      {iterationIdx + 1} / {numIterations}
    </div>
    { varName && iteration &&
      <LockSize lock={sliderIsDragging}>
        <ForLoopIterationHeaderLabel className='bg-blue-500 text-black font-mono'>
          {varName} = {iteration.loopVarValue}
        </ForLoopIterationHeaderLabel>
      </LockSize>
    }
  </ForLoopIterationHeader>;
});

const LockSize = memo(function LockSize (props: {
  children: React.ReactNode,
  lock: boolean,
}) {
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

const WhileLoopCondAndBodyV = memo(function WhileLoopCondAndBodyV (props: {
  node: LineTreeNode & { type: 'while-loop-cond-and-body' },
  script: Script,
  trace: Trace,
  context: string,
}) {
  const { node, script, trace, context } = props;

  const whileClause = node.whileClause;
  const whileNodeId = getNodeId(whileClause);
  const whileInfo = trace.whileInfos[mkExecId({ context, nodeId: whileNodeId })];
  const numIterations = whileInfo?.numIterations || 0;
  const forLineNum = whileClause.Pos().Line() - 1;
  const forLine = script.lines[forLineNum];
  const forIndent = (forLine.match(/^\s*/)?.[0] || '  ');

  let [ iterationIdx, setIterationIdx ] = useState<number>(0);

  const depth = context.match(/\//g)?.length || 0;

  let header =
    !whileInfo
    ? null
    : numIterations === 0
    ? <LineCalls style={{ paddingLeft: depth * 20 }} className='col-start-3'>
        <ForLoopIterationHeader>
          <div>{forIndent}</div>
          <ForLoopIterationHeaderLabel className='border border-blue-500 text-blue-500'>
            no iterations
          </ForLoopIterationHeaderLabel>
        </ForLoopIterationHeader>
      </LineCalls>
    : <LineCalls style={{ paddingLeft: depth * 20 }} className='col-start-3'>
        <LoopHeader
          iterationIdx={iterationIdx}
          setIterationIdx={setIterationIdx}
          numIterations={numIterations}
        />
      </LineCalls>;

  if (whileInfo && numIterations === 0) {
    return node.children.map((child, i) =>
      <DeadLineTreeNodeV key={i} script={script} node={child} />
    );
  }

  if (iterationIdx >= numIterations) {
    iterationIdx = numIterations - 1;
  }

  return node.children.map((child, i) =>
    <LineTreeNodeV
      key={i}
      script={script} trace={trace} node={child}
      context={`${context}/${whileNodeId}-${iterationIdx}`}
      doThisOneThingForMeAndStickThisIntoTheFirstRHS={i === 0 ? header : undefined}
    />
  );
});
