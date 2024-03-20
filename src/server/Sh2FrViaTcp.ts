import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js";
import getPort from "get-port";
import * as net from "node:net";
import { FATAL, chunksToLines, nextAsserted } from "../shared/util.js";
import { Sh2Fr, UploadName, uploadNames } from "./Sh2Fr.js";
import { mkExecId } from "../shared/execution.js";
import { Message } from "../shared/tracing.js";


export class Sh2FrViaTcp implements Sh2Fr {
  server: net.Server | null = null;
  port: number | null = null;

  sendMessage(message: Message) {
    return normalizeIndent`
      ${frMsgStr(message)};
    `;
  }

  beforeCommand(message: Message & { type: 'call-enter' }) {
    const uploadIdVars = uploadNames.map(uploadIdVarFromName);
    return normalizeIndent`
      local ${uploadIdVars.join(" ")} >/dev/null;
      ${frMsgStr(message, uploadIdVars.join(" "))};
      # echo "sh: got upload ids ${uploadIdVars.map(s => `$${s}`).join(" ")}" >&$fr_top_stderr;
    `;
  }

  sendUpload(command: string, uploadName: UploadName) {
    return `${command} | fr_upload $${uploadIdVarFromName(uploadName)}`;
  }

  interceptAndUploadStds(command: string, stdoutUploadName: UploadName, stderrUploadName: UploadName) {
    // TODO: avoid command substitution with pipe jiu-jitsu? (while still
    // getting the right command return value?)
    return `${command} 1>&1 1> >(fr_upload $${uploadIdVarFromName(stdoutUploadName)}) 2>&2 2> >(fr_upload $${uploadIdVarFromName(stderrUploadName)})`
  }

  async start(props: Sh2Fr.StartProps) {
    const { onMessage, onUpload } = props;

    let nextUploadId = 0;
    let uploadInfos: {[uploadId: string]: { execId: string, uploadName: UploadName }} = {};

    this.server = net.createServer();
    this.port = await getPort();
    this.server.listen(this.port, () => {
      console.log(`sh2fr server listening on port ${this.port}`)
    });
    this.server.on('connection', async (socket) => {
      socket.setEncoding('utf-8');
      const lines = chunksToLines(socket);
      const firstLine = await nextAsserted(lines, 'no first line given to sh2fr');
      if (firstLine === "message\n") {
        const secondLine = await nextAsserted(lines, 'first line `message` but no second line');
        try {
          const dataParsed: Message = JSON.parse(secondLine);
          await onMessage(dataParsed);
          if (dataParsed.type === 'call-enter') {
            const execId = mkExecId(dataParsed);
            let uploadIds: string[] = [];
            for (const uploadName of uploadNames) {
              const uploadId = nextUploadId++;
              // console.log("sending uploadId", uploadId, "for", execId, uploadName)
              uploadInfos[uploadId] = { execId, uploadName };
              uploadIds.push(uploadId.toString());
            }
            socket.write(uploadIds.join(" ") + "\n");
          }
          socket.end();
        } catch (err) {
          FATAL("trouble parsing message contents", err, secondLine);
        }
      } else if (firstLine.startsWith("upload ")) {
        const match = firstLine.match(/^upload (\d+)\n$/);  // currently uploadIds are integers
        if (!match) {
          FATAL("unexpected upload line", firstLine);
        }
        const uploadId = match[1];
        const uploadInfo = uploadInfos[uploadId];
        if (!uploadInfo) {
          FATAL("unexpected uploadId", uploadId, "from", firstLine);
        }
        await onUpload(uploadInfo.execId, uploadInfo.uploadName, lines);
        delete uploadInfos[uploadId];
      } else {
        FATAL("unexpected first line sent to sh2fr:", firstLine);
      }
    });

    return {
      env: { fr_sh2fr_port: `${this.port}` },
      prelude: PRELUDE,
    };
  }

  async stop() {
    this.server && this.server.listening && await new Promise((resolve) => {
      this.server!.close((err) => {
        if (err) {
          console.error("error closing sh2frServer", err);
        } else {
          console.log("sh2frServer closed");
        }
        resolve(undefined);
      })
    });
  }
}

const PRELUDE = normalizeIndent`
  zmodload zsh/net/tcp

  fr_msg () {
    [ $fr_debug ] && echo -E "sh: fr_msg gonna curl $1" >&$fr_top_stderr;
    ztcp localhost $fr_sh2fr_port
    fr_sh2fr_fd=$REPLY
    unset REPLY
    echo "message" >/dev/fd/$fr_sh2fr_fd
    echo $1 >/dev/fd/$fr_sh2fr_fd
    cat /dev/fd/$fr_sh2fr_fd
    ztcp -c $fr_sh2fr_fd
    [ $fr_debug ] && echo -E "sh: fr_msg curl complete $1" >&$fr_top_stderr;
  }

  fr_upload () {
    ztcp localhost $fr_sh2fr_port
    fr_sh2fr_fd=$REPLY
    unset REPLY
    echo "upload $1" >/dev/fd/$fr_sh2fr_fd
    cat >/dev/fd/$fr_sh2fr_fd
    ztcp -c $fr_sh2fr_fd
  }
`;

function uploadIdVarFromName(name: UploadName) {
  return `fr_sh2fr_uploadId_${name}`;
}

function frMsgStr(message: Message, returnVars: string | null = null) {
  const messageStr = JSON.stringify(message).replaceAll('"', '\\"');
  return `fr_msg "${messageStr}"${returnVars === null ? ' >/dev/null' :` | read -r ${returnVars}`}`;
}
