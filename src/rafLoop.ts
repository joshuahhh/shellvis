export function rafLoop(cb: () => void): () => void {
  let id: number;
  function loop() {
    cb();
    id = requestAnimationFrame(loop);
  }
  id = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(id);
}
