import octicons from "@primer/octicons-react";
import sh from "mvdan-sh";
import path from "node:path";
import * as util from "node:util";
import React, { Fragment, memo } from "react";
import { Decoration, addDecorationsToLine } from "./decorations.js";
import { DeltaLogEntry, ExecInfo, Trace, mkExecId } from "./execution.js";
import { LineTreeNode, Script, expandObject, getNodeId } from "./mvdan-sh-helpers.js";
import { ShellVarChange, shellVarChangeVarName } from "./typeset.js";
import * as fsOld from "node:fs";
import AnsiToHtml from "ansi-to-html";
import { Message } from "./tracing.js";
import { __dirname } from "./util.js";

const { ChevronRightIcon, DiffAddedIcon, DiffIgnoredIcon, DiffModifiedIcon, DiffRemovedIcon, FileSubmoduleIcon, SignOutIcon } = octicons;

const styleCss = fsOld.readFileSync(path.join(__dirname, 'style.css'), { encoding: 'utf-8' });

const ansiToHtml = new AnsiToHtml({});

type TraceVProps = {
  script: Script,
  trace: Trace,
  messageLog: Message[],
  transformedSrc: string,
}

export const TraceV = memo((props: TraceVProps) => {
  const {script, trace, messageLog, transformedSrc} = props;

  const partMain = <div>
    {script.lineTree.map((node) =>
      renderLineTreeNode(script, trace, node, '')
    )}
  </div>;

  const partTransformed = () => <div>
    <div>
      <h1>transformed</h1>
      {/* prepend each line with a line number */}
      <pre>{transformedSrc.split('\n').map((line, i) => `${String(i + 1).padStart(3)} ${line}`).join('\n')}</pre>
    </div>
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
        {messageLog.map((entry, i) =>
          <li key={i}>
            { entry.nodeId &&
              <div style={{display: 'inline-block', border: '1px solid gray', padding: 4}}>
                <pre>{script.srcForNode(script.nodesById[entry.nodeId])}</pre>
              </div>
            }
            { inspectHtml(entry) }
          </li>
        )}
      </ul>
      {/* {this.exitCode !== null && <div>exit code: {this.exitCode}</div>} */}
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
    {/* <script dangerouslySetInnerHTML={{
      __html: live
    }} /> */}
    <style dangerouslySetInnerHTML={{ __html: styleCss }} />

    <div style={{fontSize: "80%", marginBottom: 10}}>
      {/* <div>started @ {this.startTime?.toLocaleTimeString()}</div> */}
      <div>updated @ {new Date().toLocaleTimeString()}</div>
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
    return callExpr.Pos().Line() === i + 1;
  });
  const decorations: Decoration[] = callExprsOnLine.map((callExpr) => {
    const nodeId = getNodeId(callExpr);
    const execId = mkExecId(context, nodeId);
    const execInfo = trace.execInfos[execId] as ExecInfo | undefined;
    const execExitInfo = execInfo?.exitInfo;
    const statusClass =
      execInfo
      ? execExitInfo
        ? execExitInfo.exitCode === 0
          ? 'call--done-success'
          : 'call--done-failure'
        : 'call--running'
      : 'call--not-started';

    const infoSections: React.ReactNode[] = [];
    if (execInfo && execInfo.stdout.data.length > 0) {
      infoSections.push(
        <div style={{fontSize: '80%'}}>
          <div className="info-entry">
            <ChevronRightIcon/>
            <pre>
              {execInfo.stdout.data}
            </pre>
          </div>
        </div>
      );
    }
    if (execInfo && execInfo.stderr.data.length > 0) {
      infoSections.push(
        <div style={{fontSize: '80%'}}>
          <div className="info-entry" style={{}}>
            <div style={{position: 'relative', width: 16, height: 16}}>
              <div style={{position: 'absolute', left: 3}}>
                <ChevronRightIcon/>
              </div>
              <div style={{position: 'absolute', left: -3}}>
                <ChevronRightIcon/>
              </div>
            </div>
            <pre>
              {execInfo.stderr.data}
            </pre>
          </div>
        </div>,
      );
    }
    if (execExitInfo && execExitInfo.deltaLog.length > 0) {
      infoSections.push(
        <div style={{fontSize: '80%'}}>
          {renderDeltaLog(execExitInfo.deltaLog, execInfo.enterCwd)}
        </div>,
      );
    }
    if (execExitInfo && execExitInfo.exitCode !== 0) {
      infoSections.push(
        <div className="info-entry" style={{fontSize: '80%'}}>
          <SignOutIcon/>
          <div>
            exit {execExitInfo.exitCode}
          </div>
        </div>
      );
    }
    if (execExitInfo && execExitInfo.cwd !== execInfo.enterCwd) {
      infoSections.push(
        <div style={{fontSize: '80%'}} title={execExitInfo.cwd}>
          <div className="info-entry">
            <FileSubmoduleIcon/>
            {path.relative(execInfo.enterCwd, execExitInfo.cwd)}
          </div>
        </div>
      );
    }
    if (execInfo?.varsDiff) {
      // TODO: make this principled, add feature to expand them
      const ignoredShellVarNames = ['pipestatus', 'PWD', 'OLDPWD', 'SECONDS']
      execInfo.varsDiff.forEach((change) => {
        if (ignoredShellVarNames.includes(shellVarChangeVarName(change))) {
          return;
        }
        infoSections.push(
          <div style={{fontSize: '80%'}}>
            {renderShellVarChange(change)}
          </div>
        );
      });
    }
    if (false) {
      infoSections.push(
        <div style={{fontStyle: 'italic', fontSize: '60%'}}>{nodeId}</div>
      );
    }

    return {
      start: callExpr.Pos().Col() - 1,
      end: callExpr.End().Col() - 1,
      decorator: (contents) =>
        <div key={nodeId} className={`call ${statusClass} ${infoSections.length === 0 ? 'call--no-info-sections' : ''}`}>
          <div className="call__code">
            <div className="call__code-background"/>
            <div className="call__code-contents">{contents}</div>
          </div>
          { infoSections.length > 0 &&
            <div className="call__info">
              {infoSections}
            </div>
          }
        </div>
    };
  });
  const decoratedLine = addDecorationsToLine(line, decorations);
  return <div key={i} className="line">
    <div className="line__num">{i + 1}</div>
    <div className="line__contents">{decoratedLine}</div>
  </div>;
});

function renderLineTreeNode(script: Script, trace: Trace, node: LineTreeNode, context: string): React.ReactNode {
  if (node.type === 'line') {
    return <LineV script={script} trace={trace} line={node.line} i={node.lineNumStart - 1} context={context}/>;
  } else if (node.type === 'loop-body') {
    const forClause = node.forClause;
    const forNodeId = getNodeId(forClause);
    const forInfo = trace.forInfos[mkExecId(context, forNodeId)];
    const iterations = forInfo?.iterations || [];
    const varName = (forClause.Loop as sh.WordIter).Name!.Value;
    const forLine = script.lines[forClause.Pos().Line() - 1];
    const forIndent = forLine.match(/^\s*/)?.[0] || '';
    return iterations.map((iteration) => {
      return <Fragment key={iteration.counter}>
        <div className="line">
          <div className="line__num"/>
          <div className="line__contents">
            <div className="for-loop-var">
              {forIndent}
              <span style={{fontSize: "80%", fontWeight: 'bold', backgroundColor: '#ccc', color: '#444', padding: '0px 5px'}}>{varName} = {iteration.loopVarValue}</span>
            </div>
          </div>
        </div>
        {node.children.map((child) => renderLineTreeNode(script, trace, child, `${context}/${forNodeId}-${iteration.counter}`))}
      </Fragment>;
    });
  }
}

const eventIcons: Record<string, React.ReactNode> = {
  'deleted': <DiffRemovedIcon />,
  'new dir': <DiffAddedIcon />,
  'modified': <DiffModifiedIcon />,
  'dir replaced with file': <DiffModifiedIcon />,
  'new file': <DiffAddedIcon />,
}

// TODO: make into component?
export function renderDeltaLog(log: DeltaLogEntry[], baseDir?: string): React.ReactNode {
  return <>
    {log.map(({path: somePath, event}) => {
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <div key={somePath} className="info-entry">
        <div className="info-entry__icon">
          {eventIcons[event] || <DiffIgnoredIcon/>}
        </div>
        <div className="info-entry__contents">{somePath}</div>
        <div className="info-entry__details">({event})</div>
      </div>
    })}
  </>
}

// TODO: make into component?
export function renderShellVarChange(change: ShellVarChange): React.ReactNode {
  if (change.type === 'add') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffAddedIcon/></div>
      <div className="info-entry__contents">{change.newVar.name} = {change.newVar.value}</div>
    </div>;
  } else if (change.type === 'remove') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffRemovedIcon/></div>
      <div className="info-entry__contents">{change.oldVar.name}</div>
      <div className="info-entry__details">(← {change.oldVar.value})</div>
    </div>;
  } else if (change.type === 'changeValue') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffModifiedIcon/></div>
      <div className="info-entry__contents">{change.oldVar.name} = {change.newVar.value}</div>
      <div className="info-entry__details">(← {change.oldVar.value})</div>
    </div>;
  } else if (change.type === 'changeAttributes') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffModifiedIcon/></div>
      <div className="info-entry__contents">{change.newVar.name} attributes: {change.newVar.attributes}</div>
      <div className="info-entry__details">(← {change.oldVar.attributes})</div>
    </div>;
  } else {
    throw new Error(`unknown change type ${(change as any).type}`);
  }
}

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}
