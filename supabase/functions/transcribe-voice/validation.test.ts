// Run via `deno test supabase/functions/transcribe-voice/validation.test.ts`.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { parseRequestBody } from './validation.ts';

Deno.test('parseRequestBody: accepts valid voice_clip_id', () => {
  assertEquals(
    parseRequestBody({ voice_clip_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    { voice_clip_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
  );
});

Deno.test('parseRequestBody: case-insensitive on hex', () => {
  assertEquals(
    parseRequestBody({ voice_clip_id: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC' }),
    { voice_clip_id: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC' },
  );
});

Deno.test('parseRequestBody: rejects missing / non-UUID', () => {
  assertEquals(parseRequestBody({}), null);
  assertEquals(parseRequestBody({ voice_clip_id: 'notauuid' }), null);
  assertEquals(parseRequestBody({ voice_clip_id: 123 }), null);
  assertEquals(parseRequestBody(null), null);
  assertEquals(parseRequestBody(undefined), null);
});

Deno.test('parseRequestBody: rejects extra path traversal bytes', () => {
  assertEquals(
    parseRequestBody({
      voice_clip_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/../other',
    }),
    null,
  );
});
