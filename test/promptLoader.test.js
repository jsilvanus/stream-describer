import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PromptLoader } from '../src/promptLoader.js';

test('loads content from file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pl-'));
  const file = path.join(dir, 'prompt.md');
  await writeFile(file, 'hello prompt');
  const loader = new PromptLoader(file);
  await loader.load();
  assert.equal(loader.get(), 'hello prompt');
  await rm(dir, { recursive: true, force: true });
});

test('reload replaces with inline content without touching disk', async () => {
  const loader = new PromptLoader('/nonexistent/path.md');
  await loader.reload({ systemPromptContent: 'inline content' });
  assert.equal(loader.get(), 'inline content');
});

test('reload with new path loads from that file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pl-'));
  const file = path.join(dir, 'new-prompt.md');
  await writeFile(file, 'new content');
  const loader = new PromptLoader('/nonexistent/path.md');
  await loader.reload({ systemPromptPath: file });
  assert.equal(loader.get(), 'new content');
  await rm(dir, { recursive: true, force: true });
});
