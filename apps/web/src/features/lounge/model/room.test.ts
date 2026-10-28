import { describe, expect, it } from 'vitest';
import { joinMembers, leaveMembers, transferHost, type Member } from './room';

const member = (id: string): Member => ({ id, nickname: id, isHost: false, isFriend: false });
const hostOf = (members: Member[] | null) => members?.filter((m) => m.isHost).map((m) => m.id);

function roomOf(...ids: string[]): Member[] {
  return ids.reduce<Member[]>((ms, id) => joinMembers(ms, member(id)), []);
}

describe('참가자', () => {
  it('처음 들어온 사람이 방장이고, 나머지는 들어온 순서대로 뒤에 선다', () => {
    const ms = roomOf('a', 'b', 'c');
    expect(ms.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(hostOf(ms)).toEqual(['a']);
  });

  it('방장이 나가면 가장 오래 있던 사람이 방장이 된다', () => {
    const left = leaveMembers(roomOf('a', 'b', 'c'), 'a');
    expect(left?.map((m) => m.id)).toEqual(['b', 'c']);
    expect(hostOf(left)).toEqual(['b']);
  });

  it('방장이 아닌 사람이 나가면 방장은 그대로다', () => {
    expect(hostOf(leaveMembers(roomOf('a', 'b', 'c'), 'b'))).toEqual(['a']);
  });

  it('마지막 사람이 나가면 방이 없어진다', () => {
    expect(leaveMembers(roomOf('a'), 'a')).toBeNull();
  });

  it('다시 들어오면 맨 뒤에 서고 방장이 아니다', () => {
    const back = joinMembers(leaveMembers(roomOf('a', 'b'), 'a')!, member('a'));
    expect(back.map((m) => m.id)).toEqual(['b', 'a']);
    expect(hostOf(back)).toEqual(['b']);
  });

  it('방장을 넘길 수 있고, 방에 없는 사람에게는 못 넘긴다', () => {
    expect(hostOf(transferHost(roomOf('a', 'b'), 'b'))).toEqual(['b']);
    expect(hostOf(transferHost(roomOf('a', 'b'), 'x'))).toEqual(['a']);
  });
});
