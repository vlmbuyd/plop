import { hc } from 'hono/client';

import type { Api } from '../../server/app';

export const api = hc<Api>('/').api;
