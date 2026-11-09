import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toCliJsonSchema } from './runner';

describe('toCliJsonSchema', () => {
  it('Claude Code가 받지 않는 $schema 표기를 뺀다', () => {
    const schema = toCliJsonSchema(z.object({ reply: z.string() }));
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toMatchObject({ type: 'object', required: ['reply'] });
  });
});
