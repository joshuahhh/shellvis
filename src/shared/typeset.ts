import { last, weakMapCache2 } from "./util.js";

// here, "typeset" refers to the bash command that tells you things about
// variables

export type ShellVar = {
  name: string;
  attributes: string[];
  value: string | null;
};

export function parseTypesetLine(line: string): ShellVar {
  const beforeAndAfterEq = line.split(/=(.*)/);
  const beforeEq = beforeAndAfterEq[0];
  const afterEq = beforeAndAfterEq[1] as string | undefined;
  const beforeEqParts = beforeEq.split(" ");
  let name = last(beforeEqParts)!;
  if (name[0] === "'" && last(name) === "'") {
    name = name.slice(1, name.length - 1);
  }
  return {
    name,
    attributes: beforeEqParts.slice(0, -1),
    value: afterEq === undefined ? null : afterEq,
  };
}

export function parseTypeset(output: string): Record<string, ShellVar> {
  const result: Record<string, ShellVar> = {};
  for (const line of output.split("\n")) {
    const vari = parseTypesetLine(line);
    if (vari.name === "") {
      // TODO: automerge doesn't allow this
      continue;
    }
    result[vari.name] = vari;
  }
  return result;
}

export type ShellVarChange =
  | { type: "add"; newVar: ShellVar }
  | { type: "remove"; oldVar: ShellVar }
  | { type: "changeValue"; oldVar: ShellVar; newVar: ShellVar }
  | { type: "changeAttributes"; oldVar: ShellVar; newVar: ShellVar };

export const diffShellVars = weakMapCache2(_diffShellVars);

function _diffShellVars(
  oldVars: Record<string, ShellVar>,
  newVars: Record<string, ShellVar>,
): ShellVarChange[] {
  const result: ShellVarChange[] = [];
  for (const name in oldVars) {
    if (newVars[name] === undefined) {
      result.push({ type: "remove", oldVar: oldVars[name] });
    } else {
      const oldVar = oldVars[name];
      const newVar = newVars[name];
      if (oldVar.value !== newVar.value) {
        result.push({ type: "changeValue", oldVar, newVar });
      }
      if (oldVar.attributes.join(" ") !== newVar.attributes.join(" ")) {
        result.push({ type: "changeAttributes", oldVar, newVar });
      }
    }
  }
  for (const name in newVars) {
    if (oldVars[name] === undefined) {
      result.push({ type: "add", newVar: newVars[name] });
    }
  }
  return result;
}

export function shellVarChangeVarName(change: ShellVarChange): string {
  if (change.type === "add") {
    return change.newVar.name;
  } else {
    return change.oldVar.name;
  }
}
