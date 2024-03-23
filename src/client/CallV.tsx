import { RawString } from '@automerge/automerge/next';
import { count } from '@engraft/shared/lib/count.js';
import { Tooltip } from '@mui/material';
import * as octicons from '@primer/octicons-react';
import clsx from 'clsx';
import sh from 'mvdan-sh';
import path from 'path-browserify';
import { Fragment, ReactNode, memo, useContext } from 'react';
import { DeltaLogEntry, ExecInfo, Trace, mkExecId } from '../shared/execution.js';
import { Script, getNodeId, nodePosInfo } from '../shared/mvdan-sh-helpers.js';
import { ExecuteRequest } from '../shared/types.js';
import { ShellVar, ShellVarChange, diffShellVars, shellVarChangeVarName } from '../shared/typeset.js';
import { last, weakMapCache2 } from '../shared/util.js';
import { HVContext } from './HVContext.js';


const octiconProps: Parameters<octicons.Icon>[0] = {
  verticalAlign: 'top',
};

type CallVProps = {
  header?: ReactNode,
  callExpr: sh.CallExpr,
  context: string,
  trace: Trace,
  script: Script,
  className?: string,
  showCodeLabel?: boolean,
  callInfoClassName?: string,
};

export const CallV = memo((props: CallVProps) => {
  const {header, callExpr, context, trace, script, className, showCodeLabel = false, callInfoClassName} = props;

  const nodeId = getNodeId(callExpr);
  const execId = mkExecId({ context, nodeId });
  const execInfo = trace.execInfos[execId] as ExecInfo | undefined;
  const execExitInfo = execInfo?.exitInfo;
  const status =
    execInfo
    ? execExitInfo
      ? execExitInfo.exitCode === 0
        ? 'done-success'
        : 'done-failure'
      : 'running'
    : 'not-started';

  const posInfo = nodePosInfo(callExpr);
  const { selections, abbreviateInfo } = useContext(HVContext);
  let isInSelection = false;
  for (const selection of selections) {
    if (selection.start.line <= posInfo.pos.line - 1 && posInfo.end.line - 1 <= selection.end.line) {
      isInSelection = true;
      break;
    }
  }

  if (!execInfo) {
    return null;
  }

  const short =
    abbreviateInfo === 'always'
    ? true
    : abbreviateInfo === 'never'
    ? false
    : !isInSelection;

  const providerOutputs = getInfoProviderOutputs(execInfo, short);

  return (
    execInfo &&
    <div data-dg-name='CallV' className='inline-flex flex-col items-start'>
      { showCodeLabel &&
        <div data-dg-name='CallV code label' className='text-gray-500 text-xs w-0 min-w-full whitespace-nowrap overflow-hidden text-ellipsis'>
          {script.srcForNode(callExpr)}
        </div>
      }
      <div
        data-dg-name='CallV filled area'
        className={clsx(
          className,
          'inline-flex flex-col bg-gray-500 rounded mb-1 mr-1',
          status === 'running' && '-ml-[3px] border-l-[3px] border-green-500',
          providerOutputs.length === 0 && 'bg-gray-600'
        )}
        data-exec-id={execId}
      >
        { header &&
          <div className='relative rounded'>
            <div className='absolute h-6 w-full bg-gray-600 rounded-t'/>
            <div className='relative px-2'>{header}</div>
          </div>
        }
        <div className={callInfoClassName}>
          {providerOutputs}
        </div>
      </div>
    </div>
  );
});

function getInfoProviderOutputs(execInfo: ExecInfo, short: boolean): ReactNode[] {
  return (
    infoProviders.map((provider, i) =>
      [provider({ short, execInfo }), i] as const
    )
    .filter(([result]) => result)
    .map(([providerOutput, i]) =>
      <Fragment key={i}>
        {providerOutput}
      </Fragment>
    )
  );
}

// rest of this file is all just...

// *******************
// * info providers! *
// *******************

export const InfoEntryIcon = memo((props: {
  title: string,
  children: ReactNode,
  className?: string,
}) => {
  const { title, children, className } = props;
  return <Tooltip title={title} placement='top' arrow className={clsx('info-entry__icon', className)}>
    <div style={{paddingTop: 2}}>
      {children}
    </div>
  </Tooltip>;
});

type InfoProvider = (props: InfoProviderProps) => ReactNode;

type InfoProviderProps = {
  short: boolean,
  execInfo: ExecInfo,
};

let infoProviders: InfoProvider[] = [];

// stdout & stderr
function infoProviderForStream(stream: 'stdout' | 'stderr'): InfoProvider {
  return ({ short, execInfo }: InfoProviderProps) => {
    const data = execInfo[stream].data;
    if (data.length > 0 && !execInfo.suppressed) {
      let contents: ReactNode;
      if (short) {
        const text = data.join('');
        const lines = text.split('\n');
        const numLines = lines.length - (last(lines) === '' ? 1 : 0);
        if (numLines <= 2) {
          contents = <pre>{text}</pre>;
        } else {
          contents = <div>
            <pre>{lines.slice(0, 1).join('\n')}</pre>
            <div>+ {count(numLines - 1, 'line', 'lines')}</div>
          </div>;
        }
      } else {
        contents = <pre>{data}</pre>;
      }
      return <div className='info-entry'>
        { stream === 'stdout'
          ? <InfoEntryIcon title='stdout'>
              <octicons.ChevronRightIcon {...octiconProps}/>
            </InfoEntryIcon>
          : <InfoEntryIcon title='stderr'>
              <div style={{position: 'absolute', left: 3}}>
                <octicons.ChevronRightIcon {...octiconProps}/>
              </div>
              <div style={{position: 'absolute', left: -3}}>
                <octicons.ChevronRightIcon {...octiconProps}/>
              </div>
            </InfoEntryIcon>
        }
        <div className='info-entry__contents'>
          {contents}
        </div>
      </div>;
    }
  };
}
infoProviders.push(infoProviderForStream('stdout'));
infoProviders.push(infoProviderForStream('stderr'));

// effect
infoProviders.push(({ execInfo }) => {
  if (execInfo.suppressed && execInfo.exitInfo !== null) {
    return <div key='suppressed'>
      <div className='info-entry'>
        <InfoEntryIcon title='effect'>
          <octicons.AlertIcon {...octiconProps}/>
        </InfoEntryIcon>
        <div className='info-entry__contents'>
          <button onClick={async () => {
            await fetch(
              'http://localhost:8080/execute',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  command: execInfo.stdout.data.join(''),
                  cwd: execInfo.enterCwd,
                } satisfies ExecuteRequest),
              }
            );
          }}>
            <pre>{execInfo.stdout.data}</pre>
          </button>
        </div>
      </div>
    </div>;
  }
});

// delta log
const eventNames: Record<string, string> = {
  'deleted': 'file/dir deleted',
};
infoProviders.push(({ short, execInfo }) => {
  const deltaLog = execInfo?.deltaLog;
  if (deltaLog && deltaLog.length > 0) {
    if (short && deltaLog.length > 1) {
      let eventCounts: {[event: string]: number} = {
        'new file': 0,
        'new dir': 0,
        'deleted': 0,
        'modified': 0,
        'dir replaced with file': 0,
        'other': 0,
      };
      for (const entry of deltaLog) {
        if (entry.event in eventCounts) {
          eventCounts[entry.event] += 1;
        } else {
          eventCounts['other'] += 1;
        }
      }
      return <div className='info-entry'>
        {Object.entries(eventCounts).map(([event, count]) => {
          if (count > 0) {
            return <Fragment key={event}>
              {eventIcons[event] || <InfoEntryIcon title={event}><octicons.DiffIgnoredIcon {...octiconProps}/></InfoEntryIcon>}
              <div className='info-entry__contents'>
                {count}
              </div>
            </Fragment>;
          } else {
            return null;
          }
        })}
      </div>;
    } else {
      return renderDeltaLog(deltaLog, execInfo.enterCwd);
    }
  }
});

// exit code
infoProviders.push(({ execInfo }) => {
  const execExitInfo = execInfo?.exitInfo;
  if (execExitInfo && execExitInfo.exitCode !== 0) {
    return <div className='info-entry'>
      <InfoEntryIcon title='exit code'>
        <octicons.SignOutIcon {...octiconProps}/>
      </InfoEntryIcon>
      <div className='info-entry__contents'>
        exit {execExitInfo.exitCode}
      </div>
    </div>;
  }
});

// cwd
infoProviders.push(({ execInfo }) => {
  const execExitInfo = execInfo?.exitInfo;
  if (execExitInfo && execExitInfo.cwd !== execInfo.enterCwd) {
    return <div className='info-entry'>
      <InfoEntryIcon title='change dir'>
        <octicons.FileSubmoduleIcon {...octiconProps}/>
      </InfoEntryIcon>
      <div title={execExitInfo.cwd}>
        {path.relative(execInfo.enterCwd, execExitInfo.cwd)}
      </div>
    </div>;
  }
});

// vars
infoProviders.push(({ short, execInfo }) => {
  if (execInfo && execInfo.varsEnterStr && execInfo.varsExitStr) {
    const varsDiff = diffShellVarsFromStr(execInfo.varsEnterStr, execInfo.varsExitStr);
    // TODO: make this principled, add feature to expand them
    const ignoredShellVarNames = ['pipestatus', 'PWD', 'OLDPWD', 'SECONDS'];
    const varsDiffRelevant = varsDiff.filter((change) => {
      return !ignoredShellVarNames.includes(shellVarChangeVarName(change));
    });
    if (varsDiffRelevant.length === 0) {
      return null;
    }
    if (short && varsDiffRelevant.length > 1) {
      let typeCounts: Record<ShellVarChange['type'], number> = {
        add: 0,
        remove: 0,
        changeValue: 0,
        changeAttributes: 0,
      };
      for (const change of varsDiffRelevant) {
        typeCounts[change.type] += 1;
      }
      return <div className='info-entry'>
        {Object.entries(typeCounts).map(([type, count]) => {
          if (count > 0) {
            return <Fragment key={type}>
              {varChangeIcons[type as ShellVarChange['type']]}
              <div className='info-entry__contents'>
                {count}
              </div>
            </Fragment>;
          } else {
            return null;
          }
        })}
      </div>;
    } else {
      return varsDiffRelevant.map((change) =>
        <div key={`shellVarChange-${shellVarChangeVarName(change)}`}>
          {renderShellVarChange(change)}
        </div>
      );
    }
  }
});

const eventIcons: Record<string, ReactNode> = {
  'deleted': <InfoEntryIcon title='file/dir deleted'><octicons.DiffRemovedIcon {...octiconProps} /></InfoEntryIcon>,
  'new dir': <InfoEntryIcon title='dir added'><octicons.DiffAddedIcon {...octiconProps} /></InfoEntryIcon>,
  'modified': <InfoEntryIcon title='file modified'><octicons.DiffModifiedIcon {...octiconProps} /></InfoEntryIcon>,
  'dir replaced with file': <InfoEntryIcon title='dir to file'><octicons.DiffModifiedIcon {...octiconProps} /></InfoEntryIcon>,
  'new file': <InfoEntryIcon title='file added'><octicons.DiffAddedIcon {...octiconProps} /></InfoEntryIcon>,
};

// TODO: make into component?
function renderDeltaLog(log: DeltaLogEntry[], baseDir?: string): ReactNode {
  return <>
    {log.map(({path: somePath, event}) => {
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <div key={somePath} className='info-entry'>
        {eventIcons[event] || <InfoEntryIcon title={eventNames[event] || event}><octicons.DiffIgnoredIcon {...octiconProps}/></InfoEntryIcon>}
        <div className='info-entry__contents info-entry__contents--no-wrap'>
          {somePath}
          <span className='info-entry__details'>({event})</span>
        </div>
      </div>;
    })}
  </>;
}


const varChangeIcons: Record<ShellVarChange['type'], ReactNode> = {
  add:
    <InfoEntryIcon title='var add' className='text-sky-300'>
      <octicons.DiffAddedIcon {...octiconProps}/>
    </InfoEntryIcon>,
  remove:
    <InfoEntryIcon title='var remove' className='text-sky-300'>
      <octicons.DiffRemovedIcon {...octiconProps}/>
    </InfoEntryIcon>,
  changeValue:
    <InfoEntryIcon title='var change' className='text-sky-300'>
      <octicons.DiffModifiedIcon {...octiconProps}/>
    </InfoEntryIcon>,
  changeAttributes:
    <InfoEntryIcon title='var change attrib' className='text-sky-300'>
      <octicons.DiffModifiedIcon {...octiconProps}/>
    </InfoEntryIcon>,
};

// TODO: make into component?
function renderShellVarChange(change: ShellVarChange): ReactNode {
  let contents: ReactNode;
  if (change.type === 'add') {
    contents = <>
      {change.newVar.name} = {change.newVar.value}
    </>;
  } else if (change.type === 'remove') {
    contents = <>
      {change.oldVar.name}{' '}
      <div className='info-entry__details'>(← {change.oldVar.value})</div>
    </>;
  } else if (change.type === 'changeValue') {
    contents = <>
      {change.oldVar.name} = {change.newVar.value}{' '}
      <div className='info-entry__details'>(← {change.oldVar.value})</div>
    </>;
  } else if (change.type === 'changeAttributes') {
    contents = <>
      {change.newVar.name} attributes: {change.newVar.attributes}{' '}
      <div className='info-entry__details'>(← {change.oldVar.attributes})</div>
    </>;
  } else {
    throw new Error(`unknown change type ${(change as any).type}`);
  }
  return <div className='info-entry'>
    {varChangeIcons[change.type]}
    <div className='info-entry__contents info-entry__contents--no-wrap'>
      {contents}
    </div>
  </div>;
}

const diffShellVarsFromStr = weakMapCache2((varsEnterStr: RawString, varsExitStr: RawString) => {
  const varsEnter: Record<string, ShellVar> = JSON.parse(varsEnterStr.val);
  const varsExit: Record<string, ShellVar> = JSON.parse(varsExitStr.val);
  const varsDiff = diffShellVars(varsEnter, varsExit);
  return varsDiff;
});
