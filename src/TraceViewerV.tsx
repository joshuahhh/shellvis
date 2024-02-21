import { useUpdateProxy } from "@engraft/update-proxy-react";
import AnsiToHtml from "ansi-to-html";
import sh from "mvdan-sh";
import React, { Fragment, memo, useEffect, useMemo } from "react";
import * as util from "util";
import { Trace } from "../execution.js";
import { Script, expandObject } from "../mvdan-sh-helpers.js";
import { Message } from "../tracing.js";
import { HVContext, defaultHVContext } from "./HVContext.js";
import { TraceV } from "./TraceV.js";
import { WebHighlighter } from "./WebHighlighter.js";
import { WebSocketListener, WebSocketListenerEvent } from "./WebSocketListener.js";
import { AutomergeUrl } from "@automerge/automerge-repo";
import * as vscode from 'vscode';
import { ExecuteRequest } from "../types.js";

const ansiToHtml = new AnsiToHtml({});

type TraceViewerVProps = {
  sessionAutomergeUrl: AutomergeUrl,
  traceAutomergeUrl: AutomergeUrl,
  trace: Trace,
}

const parser = sh.syntax.NewParser();
const highlighter = new WebHighlighter();
highlighter.init();

export const TraceViewerV = memo((props: TraceViewerVProps) => {
  const { sessionAutomergeUrl, traceAutomergeUrl, trace } = props;

  const [ showSettings, setShowSettings ] = React.useState(false);

  const [ hvContext, setHVContext ] = React.useState<HVContext>(defaultHVContext);
  const hvContextUP = useUpdateProxy(setHVContext);
  const { showMessages, showAST, showTrace } = hvContext;

  useEffect(() => {
    const onMessage = (e: Event) => {
      const messageEvent = e as WebSocketListenerEvent & { type: "message" };
      const vsEvent: vscode.TextEditorSelectionChangeEvent = JSON.parse(messageEvent.data);
      if (vsEvent.textEditor.document.fileName !== trace.path) { return; }
      const selections = vsEvent.selections as vscode.Selection[];  // TODO: readonly nonsense w/UP
      hvContextUP.selections.$set(selections);
    };
    const listeners: WebSocketListener[] = [];
    for (let i = 5900; i < 5905; i++) {
      const listener = new WebSocketListener(`ws://localhost:${i}`);
      listener.addEventListener('message', onMessage);
      listeners.push(listener);
    }
    return () => {
      // TODO: idk
      for (const listener of listeners) {
        listener.removeEventListener('message', onMessage);
        listener.close();
      }
    };
  }, [hvContextUP.selections, trace.path]);

  const script = useMemo(() => {
    try {
      return new Script(trace.scriptSrc, parser, highlighter);
    } catch (e) {
      // TODO: this won't actually be used, cuz trace has a parse error too
      return new Script(`# parse error: ${(e as any).message}`, parser, highlighter);
    }
  }, [trace.scriptSrc]);

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

  return <HVContext.Provider value={hvContext}>
    <TraceV trace={trace} script={script} />

    <div style={{marginTop: 30}}></div>

    {showMessages && partMessages()}
    {false && partTransformed()}
    {showAST && partAST()}
    {showTrace && partTrace()}
    {false && partExecInfo()}
    {false && partForInfo()}
    <div style={{
      position: 'fixed', bottom: 10, right: 10,
      display: 'flex', flexDirection: 'column', gap: 5,
      textAlign: 'right',
      background: '#111',
      padding: 10,
      borderRadius: 10,
    }}>
      <div
        style={{
          position: showSettings ? 'absolute' : 'static', top: 10, left: 10,
          cursor: 'pointer',
        }}
        onClick={() => setShowSettings(!showSettings)}
      >
        🟣
      </div>
      { showSettings && <>
        <label>
          Details mode:
          <select
            value={hvContext.detailsMode}
            onChange={(e) => hvContextUP.detailsMode.$set(e.target.value as any)}
            style={{marginLeft: 10}}
          >
            <option value="grid">grid</option>
            <option value="in-place">in-place</option>
            <option value="on-side">on-side</option>
          </select>
        </label>
        { hvContext.detailsMode === 'on-side' &&
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
        }
        <label>
          Abbreviate:
          <select
            value={hvContext.abbreviateInfo}
            onChange={(e) => hvContextUP.abbreviateInfo.$set(e.target.value as any)}
            style={{marginLeft: 10}}
          >
            <option value="never">never</option>
            <option value="outside-selection">outside-selection</option>
            <option value="always">always</option>
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
            onChange={(e) => hvContextUP.showAST.$set(e.target.checked)}
            style={{marginRight: 10}}
          />
          Show AST
        </label>
        <label>
          <input
            type="checkbox"
            checked={hvContext.showTrace}
            onChange={(e) => hvContextUP.showTrace.$set(e.target.checked)}
            style={{marginRight: 10}}
          />
          Show trace
        </label>
        <button
          onClick={async () => {
            await fetch(
              "http://localhost:8080/execute",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  command: `code ${trace.path}`,
                  cwd: ".",
                } satisfies ExecuteRequest),
              }
            )
          }}
        >
          Open in VS Code
        </button>
        <button
          onClick={async () => {
            await fetch(
              "http://localhost:8080/execute",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  command: `open -R ${trace.path}`,
                  cwd: ".",
                } satisfies ExecuteRequest),
              }
            )
          }}
        >
          Open in Finder
        </button>
        <div style={{fontSize: "50%", lineHeight: 1, color: '#777'}}>
          session {sessionAutomergeUrl}
        </div>
        <div style={{fontSize: "50%", lineHeight: 1, color: '#777'}}>
          trace {traceAutomergeUrl}
        </div>
      </>}
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
  </div>
});

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}
