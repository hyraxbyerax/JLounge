import { Router } from 'express';
import { z } from 'zod';
import type { AuthProvider } from '../../shared/auth/AuthProvider.ts';
import { currentUser, requireAuth } from '../../shared/auth/middleware.ts';
import { AppError } from '../../shared/http/errors.ts';
import type { Counter } from '../../shared/rateLimit.ts';
import type { MusicSearchProvider } from './music/search.ts';

/** 한 사람이 1분에 검색할 수 있는 횟수 (유튜브 API 사용량 보호) */
export const SEARCH_LIMIT_PER_MINUTE = 10;

const searchQuery = z.object({
  q: z.string().trim().min(1, '검색어를 입력해주세요').max(100, '검색어는 100자까지예요'),
});

type Deps = {
  auth: AuthProvider;
  musicSearch: MusicSearchProvider;
  counter: Counter;
};

/** 라운지 HTTP API (/api/lounge/*) */
export function loungeRouter({ auth, musicSearch, counter }: Deps): Router {
  const router = Router();
  router.use(requireAuth(auth));

  // GET /api/lounge/music/search?q=검색어
  router.get('/music/search', async (req, res) => {
    const parsed = searchQuery.safeParse(req.query);
    if (!parsed.success) throw new AppError('BAD_REQUEST', parsed.error.issues[0]!.message);

    const used = await counter.hit(`ytsearch:limit:${currentUser(res).userId}`, 60);
    if (used > SEARCH_LIMIT_PER_MINUTE) {
      throw new AppError('TOO_MANY_SEARCHES', '검색을 너무 자주 했어요. 1분 뒤에 다시 해주세요', 429);
    }

    const results = await musicSearch.search(parsed.data.q);
    res.json({ data: { source: musicSearch.source, results } });
  });

  return router;
}
