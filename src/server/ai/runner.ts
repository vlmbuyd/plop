import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { z } from 'zod';

export type ModelTier = 'fast' | 'smart';

export interface AiRequest<T> {
  system: string;

  prompt: string;

  schema: z.ZodType<T>;

  tier: ModelTier;
}

export interface AiRunner {
  run<T>(request: AiRequest<T>): Promise<T>;
}

/** 화면에 그대로 보여 줄 수 있는 실패 이유를 담는다. */
export class AiError extends Error {}

const MODELS: Record<ModelTier, string> = {
  fast: process.env.PLOP_AI_FAST_MODEL ?? 'haiku',
  smart: process.env.PLOP_AI_SMART_MODEL ?? 'sonnet',
};

const TIMEOUT_MS = 90_000;
const MAX_CONCURRENT = 2;

/**
 * 이 컴퓨터에 설치되고 로그인된 Claude Code를 `claude -p`로 실행한다.
 * 도구, 설정, MCP를 모두 끄고 JSON 스키마에 맞는 답만 받는다.
 */
export function createClaudeRunner(bin = process.env.PLOP_CLAUDE_BIN ?? 'claude'): AiRunner {
  let running = 0;
  const waiting: (() => void)[] = [];

  async function acquire() {
    if (running < MAX_CONCURRENT) {
      running++;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
  }

  function release() {
    running--;
    waiting.shift()?.();
  }

  return {
    async run<T>({ system, prompt, schema, tier }: AiRequest<T>) {
      await acquire();
      try {
        const output = await spawnClaude(bin, [
          '-p',
          '--model',
          MODELS[tier],
          '--output-format',
          'json',
          '--no-session-persistence',
          '--tools',
          '',
          '--setting-sources',
          '',
          '--strict-mcp-config',
          '--system-prompt',
          system,
          '--json-schema',
          JSON.stringify(z.toJSONSchema(schema)),
        ], prompt);

        let parsed: { is_error?: boolean; result?: string; structured_output?: unknown };
        try {
          parsed = JSON.parse(output);
        } catch {
          throw new AiError('AI 응답을 읽지 못했습니다.');
        }
        if (parsed.is_error) throw new AiError(`AI가 오류를 돌려줬습니다: ${String(parsed.result ?? '').slice(0, 200)}`);

        const result = schema.safeParse(parsed.structured_output);
        if (!result.success) throw new AiError('AI 응답 형식이 맞지 않습니다.');
        return result.data;
      } finally {
        release();
      }
    },
  };
}

function spawnClaude(bin: string, args: string[], stdin: string) {
  return new Promise<string>((resolve, reject) => {
    // 저장소의 CLAUDE.md 같은 설정을 읽지 않도록 임시 폴더에서 실행한다.
    const child = spawn(bin, args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new AiError('AI 응답이 너무 오래 걸려 멈췄습니다.'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new AiError(
          error.code === 'ENOENT' ? 'Claude Code를 찾지 못했습니다. 터미널에서 claude가 실행되는지 확인해 주세요.' : error.message,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout);
      const hint = /log ?in|auth/i.test(stderr + stdout) ? ' 터미널에서 claude에 로그인되어 있는지 확인해 주세요.' : '';
      reject(new AiError(`Claude Code 실행이 실패했습니다(코드 ${code}).${hint}`));
    });

    child.stdin.end(stdin);
  });
}
