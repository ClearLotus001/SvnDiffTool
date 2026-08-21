import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FILE_EQUALITY_CHUNK_BYTES } from '../electron/main/constants';
import {
  haveSameLocalFileAndBytes,
  haveSameLocalFileContents,
} from '../electron/main/svnOperations';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'versora-file-eq-'));
}

test('haveSameLocalFileContents compares large files in streaming chunks', async () => {
  const tempDir = createTempDir();

  try {
    const leftPath = path.join(tempDir, 'left.bin');
    const rightPath = path.join(tempDir, 'right.bin');
    const bytes = Buffer.alloc(FILE_EQUALITY_CHUNK_BYTES * 2 + 17, 0x5a);
    bytes[bytes.length - 1] = 0x7f;

    fs.writeFileSync(leftPath, bytes);
    fs.writeFileSync(rightPath, bytes);

    assert.equal(await haveSameLocalFileContents(leftPath, rightPath), true);

    const differentBytes = Buffer.from(bytes);
    const middleIndex = FILE_EQUALITY_CHUNK_BYTES;
    differentBytes[middleIndex] = (differentBytes[middleIndex] ?? 0) ^ 0xff;
    fs.writeFileSync(rightPath, differentBytes);

    assert.equal(await haveSameLocalFileContents(leftPath, rightPath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('haveSameLocalFileAndBytes compares a local file against in-memory bytes without full file reads', async () => {
  const tempDir = createTempDir();

  try {
    const filePath = path.join(tempDir, 'sample.bin');
    const bytes = Buffer.alloc(FILE_EQUALITY_CHUNK_BYTES + 33, 0x23);
    bytes[FILE_EQUALITY_CHUNK_BYTES] = 0x42;
    fs.writeFileSync(filePath, bytes);

    assert.equal(await haveSameLocalFileAndBytes(filePath, Uint8Array.from(bytes)), true);

    const differentBytes = Uint8Array.from(bytes);
    const tailIndex = differentBytes.length - 2;
    differentBytes[tailIndex] = (differentBytes[tailIndex] ?? 0) ^ 0xff;
    assert.equal(await haveSameLocalFileAndBytes(filePath, differentBytes), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
