import { RawString } from "@automerge/automerge-repo";
import { Fragment, ReactNode, memo } from "react";
import { ExecInfo } from "../shared/execution.js";
import { CallFilledAreaV, CallFilledAreaVProps } from "./CallV.js";
import { darkBodyClassWithoutBackground } from "./darkBodyClass.js";

const Call = memo(
  ({
    execInfo,
    ...rest
  }: { execInfo: Partial<ExecInfo> } & Omit<
    Partial<CallFilledAreaVProps>,
    "execInfo"
  >) => {
    return (
      <div className={darkBodyClassWithoutBackground}>
        <CallFilledAreaV
          execId=""
          execInfo={{
            stdout: { data: [], done: false },
            stderr: { data: [], done: false },
            enterCwd: "",
            exitInfo: {
              exitCode: 0,
              cwd: "",
            },
            varsEnterStr: null,
            varsExitStr: null,
            deltaLog: [],
            suppressed: false,
            ...execInfo,
          }}
          scriptFilePath={null}
          abbreviate={false}
          suppressBottomBorder={true}
          {...rest}
        />
      </div>
    );
  },
);

export const GalleryOfAnnotations = memo(() => {
  return (
    <div className="p-12 font-classy mx-auto">
      <Table>
        <Row
          description="Running"
          annotation={
            <Call
              execInfo={{
                exitInfo: null,
              }}
            />
          }
        />
        <Row description="Exit code zero" annotation={<Call execInfo={{}} />} />
        <Row
          description="Exit code nonzero"
          annotation={
            <Call
              execInfo={{
                exitInfo: {
                  exitCode: 13,
                  cwd: "",
                },
              }}
            />
          }
        />
        <Row
          description="Standard output"
          annotation={
            <Call
              execInfo={{
                stdout: {
                  data: [new RawString("a line of text")],
                  done: false,
                },
              }}
            />
          }
        />
        <Row
          description="Standard error"
          annotation={
            <Call
              execInfo={{
                stderr: {
                  data: [new RawString("a line of text")],
                  done: false,
                },
              }}
            />
          }
        />
        <Row
          description="Working directory changed"
          annotation={
            <Call
              execInfo={{
                enterCwd: "/some/path",
                exitInfo: {
                  exitCode: 0,
                  cwd: "/some/path/some-dir",
                },
              }}
            />
          }
        />
        <Row
          description="File created"
          annotation={
            <Call
              execInfo={{
                deltaLog: [
                  {
                    event: "newFile",
                    path: "some-file.txt",
                  },
                ],
              }}
            />
          }
        />
        <Row
          description="Directory created"
          annotation={
            <Call
              execInfo={{
                deltaLog: [
                  {
                    event: "newDir",
                    path: "some-dir",
                  },
                ],
              }}
            />
          }
        />
        <Row
          description="File deleted"
          annotation={
            <Call
              execInfo={{
                deltaLog: [
                  {
                    event: "deletedFile",
                    path: "some-file.txt",
                  },
                ],
              }}
            />
          }
        />
        <Row
          description="Directory deleted"
          annotation={
            <Call
              execInfo={{
                deltaLog: [
                  {
                    event: "deletedDir",
                    path: "some-dir",
                  },
                ],
              }}
            />
          }
        />
        <Row
          description="File modified"
          annotation={
            <Call
              execInfo={{
                deltaLog: [
                  {
                    event: "modifiedFile",
                    path: "some-file.txt",
                    oldContents: new RawString(
                      "old line 1\nold line 2\nold line 3",
                    ),
                    newContents: new RawString(
                      "old line 1\nnew line 2\nold line 3",
                    ),
                  },
                ],
              }}
            />
          }
        />
        <Row
          description="Variable created"
          annotation={
            <Call
              execInfo={{
                varsEnterStr: new RawString(`{}`),
                varsExitStr: new RawString(
                  `{"SOME_VAR":{"name":"SOME_VAR","attributes":[],"value":"'new value'"}}`,
                ),
              }}
            />
          }
        />
        <Row
          description="Variable deleted"
          annotation={
            <Call
              execInfo={{
                varsEnterStr: new RawString(
                  `{"SOME_VAR":{"name":"SOME_VAR","attributes":[],"value":"'old value'"}}`,
                ),
                varsExitStr: new RawString(`{}`),
              }}
            />
          }
        />
        <Row
          description="Variable modified"
          annotation={
            <Call
              execInfo={{
                varsEnterStr: new RawString(
                  `{"SOME_VAR":{"name":"SOME_VAR","attributes":[],"value":"'old value'"}}`,
                ),
                varsExitStr: new RawString(
                  `{"SOME_VAR":{"name":"SOME_VAR","attributes":[],"value":"'new value'"}}`,
                ),
              }}
            />
          }
        />
      </Table>
      <div className="h-96" />
      <Abbreviations />
    </div>
  );
});

const Table = memo((props: { children: ReactNode }) => {
  return (
    <table className="-mx-2 w-full">
      <thead>
        {/* <Row annotation="Annotation" description="Description" Cell="th" /> */}
      </thead>
      <tbody>{props.children}</tbody>
    </table>
  );
});

const Row = memo(
  (props: {
    annotation: ReactNode;
    description?: ReactNode;
    Cell?: keyof JSX.IntrinsicElements;
  }) => {
    const { Cell = "td" } = props;
    return (
      <tr>
        <Cell className="align-top text-right px-2 w-1/2">
          {props.description}
        </Cell>
        <Cell className="align-top text-left px-2 pb-2">
          {props.annotation}
        </Cell>
      </tr>
    );
  },
);

const Abbreviations = memo(() => {
  const execInfos: Partial<ExecInfo>[] = [
    {
      deltaLog: [
        {
          event: "deletedFile",
          path: "old-file.txt",
        },
        {
          event: "newFile",
          path: "new-file-1.txt",
        },
        {
          event: "newFile",
          path: "new-file-2.txt",
        },
      ],
    },
    {
      stdout: {
        data: [
          new RawString("first line\nsecond line\nthird line\nfourth line"),
        ],
        done: false,
      },
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(3,auto)] w-fit">
      {execInfos.map((execInfo, i) => (
        <Fragment key={i}>
          <div className="pb-10 flex justify-end">
            <Call execInfo={execInfo} abbreviate={false} />
          </div>
          <div className="px-5 py-1">→</div>
          <div className="">
            <Call execInfo={execInfo} abbreviate={true} />
          </div>
        </Fragment>
      ))}
    </div>
  );
});
