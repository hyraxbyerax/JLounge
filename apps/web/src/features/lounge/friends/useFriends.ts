import type { FriendsOverview } from '@lounge/shared';
import { useCallback, useEffect, useState } from 'react';
import { connect } from '../../../shared/realtime/connection';
import { useMember } from '../../../shared/auth/useMember';
import { friendsApi } from './friendsApi';

/** 실시간 알림이 빠져도 이만큼마다 다시 불러온다 */
const REFRESH_MS = 30_000;

/**
 * 내 친구 목록과 친구들의 상태. 로그인한 회원이 아니면 null.
 * 친구 상태가 바뀌면(presence:update) 그 친구만 고치고, 요청·수락 등(friend:request·changed)이면 다시 불러온다.
 */
export function useFriends(): { overview: FriendsOverview | null; reload: () => void } {
  const member = useMember();
  const memberId = member?.userId ?? null;
  const [overview, setOverview] = useState<FriendsOverview | null>(null);

  const reload = useCallback(() => {
    if (!memberId) return;
    friendsApi.overview().then(setOverview, () => undefined);
  }, [memberId]);

  useEffect(() => {
    if (!memberId) {
      setOverview(null);
      return;
    }
    reload();
    const timer = window.setInterval(reload, REFRESH_MS);
    let detach = () => {};
    void connect().then((socket) => {
      const onPresence = ({
        userId,
        presence,
      }: {
        userId: string;
        presence: FriendsOverview['friends'][number]['presence'];
      }) =>
        setOverview((cur) =>
          cur ? { ...cur, friends: cur.friends.map((f) => (f.userId === userId ? { ...f, presence } : f)) } : cur,
        );
      socket.on('presence:update', onPresence);
      socket.on('friend:request', reload);
      socket.on('friend:changed', reload);
      detach = () => {
        socket.off('presence:update', onPresence);
        socket.off('friend:request', reload);
        socket.off('friend:changed', reload);
      };
    });
    return () => {
      window.clearInterval(timer);
      detach();
    };
  }, [memberId, reload]);

  return { overview, reload };
}
