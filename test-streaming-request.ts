import express from "express";
import stream from "node:stream";

const app = express()

app.post('/', (req, res) => {
  console.log("got request")
  req.setEncoding('utf8');
  let numChunks = 0;
  req.on("data", (chunk: string) => {
    console.log("got chunk")
    console.log(chunk.split("\n").map((line) => `  ${line}`).join("\n"))
    numChunks++;
  });
  req.on("end", () => {
    console.log("got end")
    res.send(`got ${numChunks} chunks`)
  });
})

const port = 1234;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
