export type ShellVariable = {
  name: string,
  attributes: string[],
  value: string,
}

export function parseTypesetLine(line: string): ShellVariable {
  const [beforeEq, afterEq] = line.split(/=(.*)/);
  const beforeEqParts = beforeEq.split(" ");
  let name = beforeEqParts[beforeEqParts.length - 1];
  if (name[0] === "'" && name[name.length - 1] === "'") {
    name = name.slice(1, name.length - 1);
  }
  return {
    name,
    attributes: beforeEqParts.slice(0, beforeEqParts.length - 1),
    value: afterEq,
  };
}
