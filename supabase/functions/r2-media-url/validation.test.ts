// Run via `deno test supabase/functions/r2-media-url/validation.test.ts`.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bucketEnvForKind, contentTypeForKind, parseKind, parseOp, parsePath } from './validation.ts';

Deno.test('parsePath: valid trip/expense/photo UUIDs', () => {
  const parsed = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'expense-photo',
  );
  assertEquals(parsed, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath: case-insensitive on hex', () => {
  const parsed = parsePath(
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'expense-photo',
  );
  assertEquals(parsed?.tripId, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
});

Deno.test('parsePath: rejects shapes without three UUIDs', () => {
  assertEquals(parsePath('test/foo.jpg', 'expense-photo'), null);
  assertEquals(parsePath('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/foo.jpg', 'expense-photo'), null);
  assertEquals(parsePath('one/two/three.jpg', 'expense-photo'), null);
  assertEquals(parsePath('', 'expense-photo'), null);
});

Deno.test('parsePath: rejects path traversal and non-jpg extensions', () => {
  assertEquals(
    parsePath(
      '../../etc/passwd/cccccccc-cccc-4ccc-8ccc-cccccccccccc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
      'expense-photo',
    ),
    null,
  );
  assertEquals(
    parsePath(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png',
      'expense-photo',
    ),
    null,
  );
});

Deno.test('parseOp: accepts PUT, GET, DELETE case-insensitively', () => {
  assertEquals(parseOp('PUT'), 'PUT');
  assertEquals(parseOp('get'), 'GET');
  assertEquals(parseOp('Delete'), 'DELETE');
});

Deno.test('parseOp: rejects unknown ops and non-strings', () => {
  assertEquals(parseOp('POST'), null);
  assertEquals(parseOp(''), null);
  assertEquals(parseOp(undefined), null);
  assertEquals(parseOp(123), null);
});

Deno.test('parseKind: accepts the three known kinds', () => {
  assertEquals(parseKind('expense-photo'), 'expense-photo');
  assertEquals(parseKind('journal-photo'), 'journal-photo');
  assertEquals(parseKind('voice-clip'), 'voice-clip');
});

Deno.test('parseKind: rejects unknown values', () => {
  assertEquals(parseKind(''), null);
  assertEquals(parseKind('photo'), null);
  assertEquals(parseKind(undefined), null);
  assertEquals(parseKind(123), null);
});

Deno.test('parsePath(expense-photo): accepts three-UUID jpg path', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'expense-photo',
  );
  assertEquals(r, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath(journal-photo): accepts trip/journal/photo path', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/journal/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'journal-photo',
  );
  assertEquals(r, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath(journal-photo): rejects three-UUID shape', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'journal-photo',
  );
  assertEquals(r, null);
});

Deno.test('parsePath(voice-clip): accepts trip/clip.m4a path', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.m4a',
    'voice-clip',
  );
  assertEquals(r, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath(voice-clip): rejects .jpg extension', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'voice-clip',
  );
  assertEquals(r, null);
});

Deno.test('bucketEnvForKind: maps kinds to env var names', () => {
  assertEquals(bucketEnvForKind('expense-photo'), 'R2_BUCKET_IMAGE');
  assertEquals(bucketEnvForKind('journal-photo'), 'R2_BUCKET_IMAGE');
  assertEquals(bucketEnvForKind('voice-clip'), 'R2_BUCKET_AUDIO');
});

Deno.test('contentTypeForKind: maps to MIME types', () => {
  assertEquals(contentTypeForKind('expense-photo'), 'image/jpeg');
  assertEquals(contentTypeForKind('journal-photo'), 'image/jpeg');
  assertEquals(contentTypeForKind('voice-clip'), 'audio/mp4');
});
