import * as child_process from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as tmp from "tmp";

function mkfifo(path: string): void {
  const mkfifoCommand = `mkfifo ${path}`;
  // console.log("node make pipe", mkfifoCommand);
  child_process.execSync(mkfifoCommand);
}

function FATAL(...args: any[]): never {
  console.error("FATAL", ...args);
  process.exit(1);
}

async function main() {
  console.log("node go", process.pid);

  const fr2shPath = tmp.tmpNameSync();
  mkfifo(fr2shPath);

  // console.log("node opening pipe");
  const fr2shHandle = await fs.open(
    fr2shPath,
    fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
  );
  // console.log("node streaming pipe");
  // PITFALL NOTICE:
  //   createReadStream is inappropriate here. Per https://nodejs.org/dist/latest-v11.x/docs/api/fs.html#fs_fs_createreadstream_path_options,
  //   "fd should be blocking; non-blocking fds should be passed to net.Socket". See also: https://stackoverflow.com/a/52622889/.
  const fr2shSocket = new net.Socket({ fd: fr2shHandle.fd });

  // TODO: if we want to support multithreaded scripts, we'll want to deliver
  // response pipes at runtime
  const sh2frPath = tmp.tmpNameSync();
  mkfifo(sh2frPath);

  // TODO: if O_WRONLY, needs to be opened after child process started, so it doesn't block
  const sh2frHandle = await fs.open(sh2frPath, fs.constants.O_RDWR);

  const childProcess = child_process.spawn("zsh", ["msg-test.sh"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      fr2sh: fr2shPath,
      sh2fr: sh2frPath,
    },
  });

  console.log(`node started ${childProcess.pid}`);

  fr2shSocket.on("data", (data) => {
    const dataString = data.toString();
    if (dataString.indexOf("\n") !== dataString.length - 1) {
      FATAL("node pipe data not a single line", dataString);
    }
    console.log("pipe data", dataString);
    try {
      const dataParsed = JSON.parse(dataString);
      const response = `${dataParsed.i + 1}`;
      console.log("node writing response", response);
      sh2frHandle.write(response + "\n");
    } catch (err) {
      FATAL("node error parsing data", err);
    }
  });

  fr2shSocket.on("error", (err) => {
    console.log("pipe error", err);
  });

  fr2shSocket.on("end", () => {
    console.log("pipe end");
  });

  childProcess.on("error", (err) => {
    console.log("child error", err);
  });

  childProcess.on("exit", async (code, signal) => {
    // looks like both of these are necessary, in this order
    await fr2shHandle.close();
    fr2shSocket.destroy();
  });
}

main();
