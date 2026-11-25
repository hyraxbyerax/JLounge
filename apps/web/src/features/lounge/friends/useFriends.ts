/*
 * 내 친구 목록과 친구들의 상태·안 읽은 메시지 수 (화면 전체가 한 벌을 같이 쓴다).
 * - 친구 상태가 바뀌면(presence:update) 그 친구만 고치고, 요청·수락 등(friend:request·changed)이면 다시 불러온다
 * - 1:1 메시지가 오면(dm:message) 보낸 친구의 안 읽은 수를 늘린다 (대화를 열고 있으면 clearUnread 로 0)
 * - 실시간 알림이 빠져도 30초마다 다시 불러온다
 * 쓰는 화면이 하나도 없으면 멈추고, 로그인한 회원이 바뀌면 처음부터 다시 불러온다.
 */
import type { DirectMessage, FriendsOverview } from '@lounge/shared';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMember } from '../../../shared/auth/useMember';
import { connect } from '../../../shared/realtime/connection';
import { friendsApi } from './friendsApi';

const REFRESH_MS = 30_000;

type Presence = FriendsOverview['friends'][number]['presence'];

let overview: FriendsOverview | null = null;
let activeId: string | null = null;
let users = 0;
let stopActive: (() => void) | null = null;
const listeners = new Set<() => void>();

function set(next: FriendsOverview | null) {
  overview = next;
  listeners.forEach((l) => l());
}

const updateFriends = (change: (f: FriendsOverview['friends'][number]) => FriendsOverview['friends'][number]) => {
  if (overview) set({ ...overview, friends: overview.friends.map(change) });
};

function reload() {
  const id = activeId;
  if (!id) return;
  friendsApi.overview().then(
    (next) => activeId === id && set(next),
    () => undefined,
  );
}

function start(memberId: string) {
  activeId = memberId;
  reload();
  const timer = window.setInterval(reload, REFRESH_MS);
  let detach = () => {};
  let stopped = false;
  void connect().then((socket) => {
    if (stopped) return;
    const onPresence = ({ userId, presence }: { userId: string; presence: Presence }) =>
      updateFriends((f) => (f.userId === userId ? { ...f, presence } : f));
    const onMessage = (message: DirectMessage) => {
      if (message.to === memberId)
        updateFriends((f) => (f.userId === message.from ? { ...f, unread: f.unread + 1 } : f));
    };
    socket.on('presence:update', onPresence);
    socket.on('friend:request', reload);
    socket.on('friend:changed', reload);
    socket.on('dm:message', onMessage);
    detach = () => {
      socket.off('presence:update', onPresence);
      socket.off('friend:request', reload);
      socket.off('friend:changed', reload);
      socket.off('dm:message', onMessage);
    };
  });
  stopActive = () => {
    stopped = true;
    window.clearInterval(timer);
    detach();
  };
}

function stop() {
  stopActive?.();
  stopActive = null;
  activeId = null;
  set(null);
}

function use(memberId: string | null) {
  users++;
  if (memberId !== activeId) {
    stop();
    if (memberId) start(memberId);
  }
  return () => {
    users--;
    // 다른 화면으로 넘어가며 잠깐 0이 되는 경우가 있어 한 박자 늦게 확인한다
    window.setTimeout(() => users === 0 && stop(), 0);
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useFriends(): {
  overview: FriendsOverview | null;
  reload: () => void;
  clearUnread: (userId: string) => void;
} {
  const memberId = useMember()?.userId ?? null;
  const current = useSyncExternalStore(subscribe, () => overview);
  useEffect(() => use(memberId), [memberId]);
  const clearUnread = useCallback(
    (userId: string) => updateFriends((f) => (f.userId === userId ? { ...f, unread: 0 } : f)),
    [],
  );
  return { overview: memberId ? current : null, reload, clearUnread };
}
