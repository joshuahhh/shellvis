import fsP from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { Sandbox, afterRun, beforeRun, isMountPoint, makeSandbox, mkTmpDir, removeSandbox } from '../src/server/sandbox.js';
import { DeltaLogEntry } from '../src/shared/execution.js';


describe('isMountPoint', () => {
  it('works on root', async () => {
    expect(await isMountPoint('/')).toBe(true);
  });

  it('works on something that isn\'t a mount point', async () => {
    expect(await isMountPoint('/usr')).toBe(false);
  });

  it('works on something that is a mount point', async () => {
    expect(await isMountPoint('/dev')).toBe(true);
  });
});

describe('sandbox', () => {
  async function setUpSandbox() {
    const rootDir = await mkTmpDir('root-');
    const sandbox = await makeSandbox(rootDir);
    onTestFinished(() => removeSandbox(sandbox));
    return { rootDir, sandbox };
  }

  async function runInSandbox(sandbox: Sandbox, f: () => Promise<void>): Promise<DeltaLogEntry[]> {
    await beforeRun(sandbox);
    await f();
    return await afterRun(sandbox);
  }

  it('works with no changes', async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, 'original-file'), 'hello');

    for (let i = 0; i < 2; i++) {
      const deltaLog = await runInSandbox(sandbox, async () => {
        const originalFileContents = await fsP.readFile(path.join(sandbox.sandboxUnionDir, 'original-file'), 'utf8');
        expect(originalFileContents).toBe('hello');
      });
      expect(deltaLog).toEqual([]);
    }
  });

  it('works writing new files', async () => {
    const { sandbox } = await setUpSandbox();

    const deltaLog1 = await runInSandbox(sandbox, async () => {
      await fsP.writeFile(path.join(sandbox.deltaUnionDir, 'new-file'), 'hello');
    });
    expect(deltaLog1).toEqual([{ event: 'newFile', path: 'new-file' }]);

    await runInSandbox(sandbox, async () => {
      const newFileContents = await fsP.readFile(path.join(sandbox.sandboxUnionDir, 'new-file'), 'utf8');
      expect(newFileContents).toBe('hello');
    });
  });

  it('works deleting files', async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, 'original-file'), 'hello');

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(path.join(sandbox.deltaUnionDir, 'original-file'));
    });
    expect(deltaLog).toEqual([{ event: 'deletedFile', path: 'original-file' }]);

    await runInSandbox(sandbox, async () => {
      expect(await fsP.stat(path.join(sandbox.sandboxUnionDir, 'original-file')).catch(() => null)).toBe(null);
    });
  });

  it('works modifying files', async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.writeFile(path.join(rootDir, 'original-file'), 'hello');

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.writeFile(path.join(sandbox.deltaUnionDir, 'original-file'), 'goodbye');
    });
    expect(deltaLog).toEqual([{ event: 'modifiedFile', path: 'original-file' }]);

    await runInSandbox(sandbox, async () => {
      const originalFileContents = await fsP.readFile(path.join(sandbox.sandboxUnionDir, 'original-file'), 'utf8');
      expect(originalFileContents).toBe('goodbye');
    });
  });

  it('works creating new directories', async () => {
    const { sandbox } = await setUpSandbox();

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.mkdir(path.join(sandbox.deltaUnionDir, 'new-dir'));
    });
    expect(deltaLog).toEqual([{ event: 'newDir', path: 'new-dir' }]);

    await runInSandbox(sandbox, async () => {
      expect((await fsP.stat(path.join(sandbox.sandboxUnionDir, 'new-dir'))).isDirectory()).toBe(true);
    });
  });

  it('works deleting directories', async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.mkdir(path.join(rootDir, 'original-dir'));

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(path.join(sandbox.deltaUnionDir, 'original-dir'), { recursive: true });
    });
    expect(deltaLog).toEqual([{ event: 'deletedDir', path: 'original-dir' }]);

    await runInSandbox(sandbox, async () => {
      expect(await fsP.stat(path.join(sandbox.sandboxUnionDir, 'original-dir')).catch(() => null)).toBe(null);
    });
  });

  it('works replacing directories with files', async () => {
    const { sandbox, rootDir } = await setUpSandbox();
    await fsP.mkdir(path.join(rootDir, 'original-dir-or-file'));

    const deltaLog = await runInSandbox(sandbox, async () => {
      await fsP.rm(path.join(sandbox.deltaUnionDir, 'original-dir-or-file'), { recursive: true });
      await fsP.writeFile(path.join(sandbox.deltaUnionDir, 'original-dir-or-file'), 'goodbye');
    });
    expect(deltaLog).toEqual([{ event: 'dirReplacedWithFile', path: 'original-dir-or-file' }]);

    await runInSandbox(sandbox, async () => {
      const originalFileContents = await fsP.readFile(path.join(sandbox.sandboxUnionDir, 'original-dir-or-file'), 'utf8');
      expect(originalFileContents).toBe('goodbye');
    });
  });
});
