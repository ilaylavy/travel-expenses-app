// Run via `deno test supabase/functions/r2-photo-url/validation.test.ts`.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseOp, parsePath } from './validation.ts';

Deno.test('parsePath: valid trip/expense/photo UUIDs', () => {
  const parsed = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
  );
  assertEquals(parsed, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expenseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    photoId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath: case-insensitive on hex', () => {
  const parsed = parsePath(
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
  );
  assertEquals(parsed?.tripId, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
});

Deno.test('parsePath: rejects shapes without three UUIDs', () => {
  assertEquals(parsePath('test/foo.jpg'), null);
  assertEquals(parsePath('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/foo.jpg'), null);
  assertEquals(parsePath('one/two/three.jpg'), null);
  assertEquals(parsePath(''), null);
});

Deno.test('parsePath: rejects path traversal and non-jpg extensions', () => {
  assertEquals(
    parsePath(
      '../../etc/passwd/cccccccc-cccc-4ccc-8ccc-cccccccccccc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    ),
    null,
  );
  assertEquals(
    parsePath(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png',
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
