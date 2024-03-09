import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js";
import express from "express";
import getPort from "get-port";
import * as net from "node:net";
import { mkExecId } from "../shared/execution.js";
import { Message } from "../shared/tracing.js";
import { FATAL, chunksToLines } from "../shared/util.js";
import { Sh2Fr, UploadName, uploadNames } from "./Sh2Fr.js";


export class Sh2FrViaHttp implements Sh2Fr {
  server: net.Server | null = null;
  port: number | null = null;

  async init() {
    this.port = await getPort()
    return {
      env: { fr_sh2fr_port: `${this.port}` },
      prelude: PRELUDE,
    };
  }

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
      echo "sh: got upload ids ${uploadIdVars.map(s => `$${s}`).join(" ")}" >&$fr_top_stderr;
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

    const sh2frExpress = express()

    sh2frExpress.use('/', express.raw({ type: "*/*" }))

    sh2frExpress.post('/', async (req, res) => {
      const dataString = req.body.toString();
      try {
        const dataParsed: Message = JSON.parse(dataString);
        await onMessage(dataParsed);
        if (dataParsed.type === 'call-enter') {
          const execId = mkExecId(dataParsed);
          let uploadIds: string[] = [];
          for (const uploadName of uploadNames) {
            const uploadId = nextUploadId++;
            console.log("sending uploadId", uploadId, "for", execId, uploadName)
            uploadInfos[uploadId] = { execId, uploadName };
            uploadIds.push(uploadId.toString());
          }
          res.send(uploadIds.join(" ") + "\n");
        } else {
          res.send("\n");
        }
      } catch (err) {
        FATAL("node error parsing data", err, dataString);
      }
    })

    sh2frExpress.post('/upload/', (req, res) => {
      res.status(404).send(`missing uploadId\n`);
    });

    sh2frExpress.post('/upload/:uploadId', async (req, res) => {
      const uploadId = req.params.uploadId;
      const uploadInfo = uploadInfos[uploadId];
      delete uploadInfos[uploadId];
      if (!uploadInfo) {
        FATAL("unexpected uploadId", uploadId);
      }
      const lines = chunksToLines(req);
      await onUpload(uploadInfo.execId, uploadInfo.uploadName, lines);
      res.end();
    });

    sh2frExpress.get('*', (req, res) => {
      // log and 404
      console.log("fr: 404", req.url);
      res.status(404).send(`404 not found`);
    });

    this.server = sh2frExpress.listen(this.port, () => {
      console.log(`sh2fr server listening on port ${this.port}`)
    })
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
  fr_msg () {
    [ $fr_debug ] && echo -E "sh: fr_msg gonna curl $1" >&$fr_top_stderr;
    curl -s -d $1 -H "Content-Type: text/plain" -X POST http://localhost:$fr_sh2fr_port;
    [ $fr_debug ] && echo -E "sh: fr_msg curl complete $1" >&$fr_top_stderr;
  }

  fr_upload () {
    [ $fr_debug ] && echo -E "sh: fr_upload gonna curl $1" >&$fr_top_stderr;
    curl -s -X POST -T - http://localhost:$fr_sh2fr_port/upload/$1
    [ $fr_debug ] && echo -E "sh: fr_upload curl complete $1" >&$fr_top_stderr;
  }
`;

function uploadIdVarFromName(name: UploadName) {
  return `fr_sh2fr_uploadId_${name}`;
}

function frMsgStr(message: Message, returnVars: string | null = null) {
  const messageStr = JSON.stringify(message).replaceAll('"', '\\"');
  return `fr_msg "${messageStr}"${returnVars === null ? ' >/dev/null' :` | read -r ${returnVars}`}`;
}
