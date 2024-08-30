import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { memo, useEffect, useRef, useState } from "react";
import { Trace } from "../shared/execution.js";
import { Session } from "../shared/types.js";
import { useBodyClass } from "./Body.js";
import { TraceViewerV } from "./TraceViewerV.js";
import { WithAutomergeV } from "./WithAutomergeV.js";
import { darkBodyClass } from "./darkBodyClass.js";

export const SessionV = memo((props: { sessionAutomergeUrl: AutomergeUrl }) => {
  useBodyClass(darkBodyClass);

  const { sessionAutomergeUrl } = props;
  const [session] = useDocument<Session>(sessionAutomergeUrl);

  if (!session) {
    return <div>Loading session document from Automerge...</div>;
  }
  if (!session.traceAutomergeUrl) {
    return <div>Session document lacks a traceAutomergeUrl!</div>;
  }

  return (
    <SessionWithTraceAutomergeUrlV
      sessionAutomergeUrl={sessionAutomergeUrl}
      traceAutomergeUrl={session.traceAutomergeUrl}
    />
  );
});

const SessionWithTraceAutomergeUrlV = memo(
  (props: {
    sessionAutomergeUrl: AutomergeUrl;
    traceAutomergeUrl: AutomergeUrl;
  }) => {
    const { sessionAutomergeUrl, traceAutomergeUrl } = props;
    const [trace] = useDocument<Trace>(traceAutomergeUrl);

    const oldTraceRef = useRef<Trace>();
    if (trace) {
      oldTraceRef.current = trace;
    }

    if (!oldTraceRef.current) {
      return <div>Loading trace document from Automerge...</div>;
    }

    return (
      <>
        <TraceViewerV
          sessionAutomergeUrl={sessionAutomergeUrl}
          traceAutomergeUrl={traceAutomergeUrl}
          trace={oldTraceRef.current}
        />
        {!trace && (
          // full-screen loading spinner
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: "100%" }}>Loading trace...</div>
          </div>
        )}
      </>
    );
  },
);

export const CliSessionV = memo(() => {
  useBodyClass(darkBodyClass);

  // TODO: should I do something smarter than polling here?
  const [sessionAutomergeUrl, setSessionAutomergeUrl] =
    useState<AutomergeUrl | null>(null);
  useEffect(() => {
    async function check() {
      const sessionAutomergeUrlRequest = await fetch(
        "http://localhost:8080/cli-session-automerge-url",
      );
      const sessionAutomergeUrl =
        (await sessionAutomergeUrlRequest.text()) as AutomergeUrl;
      setSessionAutomergeUrl(sessionAutomergeUrl); // won't rerender if it's the same
    }
    const interval = setInterval(check, 1000);
    check();
    return () => clearInterval(interval);
  }, []);

  if (!sessionAutomergeUrl) {
    return <div>Loading session document URL from server...</div>;
  } else {
    return (
      <WithAutomergeV>
        <SessionV sessionAutomergeUrl={sessionAutomergeUrl} />
      </WithAutomergeV>
    );
  }
});
