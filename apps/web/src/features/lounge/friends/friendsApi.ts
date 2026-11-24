/*
 * 친구 API (/api/lounge/friends) 와 내 설정(/api/users/me). 로그인한 회원만.
 */
import type { FriendRequestInput, FriendsOverview, PresenceVisibility } from '@lounge/shared';
import { memberRequest } from '../../../shared/api/memberApi';

const BASE = '/api/lounge/friends';

export const friendsApi = {
  overview: () => memberRequest<FriendsOverview>('GET', BASE),
  request: (input: FriendRequestInput) =>
    memberRequest<{ result: string; message: string }>('POST', `${BASE}/requests`, input),
  accept: (userId: string) =>
    memberRequest<{ message: string }>('POST', `${BASE}/${encodeURIComponent(userId)}/accept`),
  /** 친구 끊기·보낸 요청 취소·받은 요청 거절 */
  remove: (userId: string) => memberRequest<void>('DELETE', `${BASE}/${encodeURIComponent(userId)}`),
  block: (userId: string) => memberRequest<{ message: string }>('POST', `${BASE}/${encodeURIComponent(userId)}/block`),
  unblock: (userId: string) => memberRequest<void>('DELETE', `${BASE}/${encodeURIComponent(userId)}/block`),
  me: () => memberRequest<{ friendCode: string; presenceVisibility: PresenceVisibility }>('GET', '/api/users/me'),
  setVisibility: (presenceVisibility: PresenceVisibility) =>
    memberRequest<{ friendCode: string; presenceVisibility: PresenceVisibility }>('PATCH', '/api/users/me', {
      presenceVisibility,
    }),
};
