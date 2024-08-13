import { AutomergeUrl } from '@automerge/automerge-repo';
import { useUpdateProxy } from '@engraft/update-proxy-react';
import AnsiToHtml from 'ansi-to-html';
import sh from 'mvdan-sh';
import React, { Fragment, memo, useEffect, useMemo } from 'react';
import * as util from 'util';
import { pipeData, Trace } from '../shared/execution.js';
import { Script, expandObject } from '../shared/mvdan-sh-helpers.js';
import { Message } from '../shared/tracing.js';
import { ExecuteRequest } from '../shared/types.js';
import { HVContext, defaultHVContext } from './HVContext.js';
import { TraceV } from './TraceV.js';
import { VSCodeListener } from './VSCodeListener.js';
import { WebHighlighter } from './WebHighlighter.js';
import { Button } from './shadcn/Button.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './shadcn/Select.js';
import { Label } from './shadcn/Label.js';
import { AnimatePresence, motion } from 'framer-motion';
import { type TextEditorSelectionChangeEvent, type Selection } from 'vscode';
import { next as A } from '@automerge/automerge';
import { Slider } from '@mui/material';

const ansiToHtml = new AnsiToHtml({});

type TraceViewerVProps = {
  sessionAutomergeUrl: AutomergeUrl,
  traceAutomergeUrl: AutomergeUrl,
  trace: Trace,
};

const parser = sh.syntax.NewParser();
const highlighter = new WebHighlighter();
highlighter.init();

export const TraceViewerV = memo((props: TraceViewerVProps) => {
  const { sessionAutomergeUrl, traceAutomergeUrl } = props;
  let { trace } = props;

  const history = useMemo(() => A.getHistory(trace), [trace]);

  let [ historyIdx, setHistoryIdx ] = React.useState<number | undefined>(undefined);

  if (historyIdx !== undefined) {
    if (historyIdx > history.length - 1) {
      historyIdx = history.length - 1;
    }
    trace = history[historyIdx].snapshot;
  }

  const [ showSettings, setShowSettings ] = React.useState(false);

  const [ hvContext, setHVContext ] = React.useState<HVContext>(defaultHVContext);
  const hvContextUP = useUpdateProxy(setHVContext);
  const { showMessages, showAST, showTrace } = hvContext;

  useEffect(() => {
    // omg love this 😍
    hvContextUP.hvContextUP.$set(hvContextUP as any);
  }, [hvContextUP]);

  useEffect(() => {
    // console.log("vsCodeListener is disabled");
    // return;
    // console.log("vsCodeListener is enabled");
    const vsCodeListener = new VSCodeListener();
    const onMessage = (e: MessageEvent<string>) => {
      const vsEvent: TextEditorSelectionChangeEvent = JSON.parse(e.data);
      if (vsEvent.textEditor.document.fileName !== trace.runParams.path) { return; }
      hvContextUP.selections.$set(vsEvent.selections as Selection[]);
    };
    vsCodeListener.addEventListener('message', onMessage);

    return () => {
      vsCodeListener.removeEventListener('message', onMessage);
      // vsCodeListener.close();
    };
  }, [hvContextUP.selections, trace.runParams.path]);

  const script = useMemo(() => {
    try {
      return new Script(trace.runParams.scriptSrc, parser, highlighter);
    } catch (e) {
      // TODO: this won't actually be used, cuz trace has a parse error too
      return new Script(`# parse error: ${(e as any).message}`, parser, highlighter);
    }
  }, [trace.runParams.scriptSrc]);

  if (trace.parseError) {
    return <div>
      <h1>parse error</h1>
      <pre>{trace.parseError}</pre>
    </div>;
  }

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

  const partTrace = () => <div>
    <h1>trace</h1>
    {inspectHtml(expandObject(trace))}
  </div>;

  const partMessages = () => <div>
    <h1>messages</h1>
    <ul>
      {trace.messageLog.map((entry, i) =>
        <li key={i}>
          <MessageV message={entry} script={script} />
        </li>
      )}
    </ul>
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
            <pre>{pipeData(stdout)}</pre>
            <div><b>stderr</b> {stderr.done && <small>✓</small>}</div>
            <pre>{pipeData(stderr)}</pre>
            <div><b>rest</b>
              {inspectHtml(rest)}
            </div>
          </dd>
        </Fragment>;
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
        </Fragment>;
      })}
    </dl>
  </div>;

  return <HVContext.Provider value={hvContext}>
    <TraceV trace={trace} script={script} />

    <div style={{marginTop: 30}}></div>

    {showMessages && partMessages()}
    {false && partTransformed()}
    {showAST && partAST()}
    {showTrace && partTrace()}
    {false && partExecInfo()}
    {false && partForInfo()}

    <div
      className='fixed top-3 right-3 flex flex-row gap-4 items-center'
    >
      { hvContext.showTimeSlider &&
        <Slider
          className='mx-4'
          size='small'
          min={0} max={history.length} step={1}
          value={historyIdx === undefined ? history.length : historyIdx}
          onChange={(_, v) =>
            setHistoryIdx(v === history.length ? undefined : v as number)
          }
          marks={history.length < 30}
          style={{
            width: Math.min(Math.max(10 * (history.length), 0), 400),
            padding: 0,
          }}
          // onMouseDown={() => { setSliderIsDragging(true); }}
          // onChangeCommitted={() => { setSliderIsDragging(false); }}
        />
      }
      <Button
        onClick={async () => {
          await fetch(
            `http://localhost:8080/restart/${sessionAutomergeUrl}`,
            { method: 'POST' }
          );
        }}
        variant='destructive'
      >
        ▶️ re-run
      </Button>
    </div>

    <div className='fixed bottom-2 right-14 text-8xl opacity-20 -z-50'>
      shellvis
    </div>

    <div className='fixed bottom-2 right-2
                    flex flex-row-reverse items-end gap-4
                  bg-gray-900 p-3 rounded-xl'>
      <div className='cursor-pointer select-none'
        onClick={() => setShowSettings(!showSettings)}
      >
        🟣
      </div>
      <AnimatePresence>
        { showSettings && <motion.div
          className='flex flex-col gap-2 min-w-0'
          initial='absent' animate='present' exit='absent'
          variants={{
            present: { opacity: '100%', width: 'auto', height: 'auto' },
            absent: { opacity: 0, width: 0, height: 0 },
          }}
          transition={{ duration: 0.25 }}
        >
          <a href='/'>Return home</a>
          <Label className='flex items-center gap-2'>
            Details mode:
            <Select
              value={hvContext.detailsMode}
              onValueChange={(value) => hvContextUP.detailsMode.$set(value as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='grid'>grid</SelectItem>
                <SelectItem value='in-place'>in-place</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className='flex items-center gap-2'>
            Abbreviate:
            <Select
              value={hvContext.abbreviateInfo}
              onValueChange={(value) => hvContextUP.abbreviateInfo.$set(value as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='never'>never</SelectItem>
                <SelectItem value='outside-selection'>outside-selection</SelectItem>
                <SelectItem value='always'>always</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <label>
            <input
              type='checkbox'
              checked={hvContext.showTimeSlider}
              onChange={(e) => hvContextUP.showTimeSlider.$set(e.target.checked)}
              style={{marginRight: 10}}
            />
            Show time slider
          </label>
          <label>
            <input
              type='checkbox'
              checked={hvContext.showMessages}
              onChange={(e) => hvContextUP.showMessages.$set(e.target.checked)}
              style={{marginRight: 10}}
            />
            Show messages
          </label>
          <label>
            <input
              type='checkbox'
              checked={hvContext.showAST}
              onChange={(e) => hvContextUP.showAST.$set(e.target.checked)}
              style={{marginRight: 10}}
            />
            Show AST
          </label>
          <label>
            <input
              type='checkbox'
              checked={hvContext.showTrace}
              onChange={(e) => hvContextUP.showTrace.$set(e.target.checked)}
              style={{marginRight: 10}}
            />
            Show trace
          </label>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={async () => {
                await fetch(
                  'http://localhost:8080/execute',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      command: `code ${trace.runParams.cwd} ${trace.runParams.path}`,
                      cwd: '.',
                    } satisfies ExecuteRequest),
                  }
                );
              }}
            >
              Open in VS Code
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={async () => {
                await fetch(
                  'http://localhost:8080/execute',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      command: `open -R ${trace.runParams.path}`,
                      cwd: '.',
                    } satisfies ExecuteRequest),
                  }
                );
              }}
            >
              Open in Finder
            </Button>
          </div>
          <div style={{fontSize: '50%', lineHeight: 1, color: '#777'}}>
            session {sessionAutomergeUrl}
          </div>
          <div style={{fontSize: '50%', lineHeight: 1, color: '#777'}}>
            trace {traceAutomergeUrl}
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  </HVContext.Provider>;
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
  </div>;
});

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true })),
  }} />;
}
