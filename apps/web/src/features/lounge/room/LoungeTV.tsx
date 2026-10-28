import type { QueuedSong } from '../model/room';

type Props = {
  now: QueuedSong | null;
  paused: boolean;
  small?: boolean;
};

/**
 * 라운지 TV: 유튜브 플레이어는 약관상 화면에 보여야 하므로 숨기지 않는다.
 * 지금은 일시정지를 표시만 한다 (실제 제어는 IFrame Player API로 2단계에서).
 */
export function LoungeTV({ now, paused, small = false }: Props) {
  return (
    <figure className={`tv${small ? ' is-small' : ''}`}>
      <div className="tv-screen">
        {now ? (
          <iframe
            key={now.entryId}
            src={`https://www.youtube-nocookie.com/embed/${now.videoId}?rel=0`}
            title={`유튜브 플레이어: ${now.title}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <p className="tv-off">다음 곡이 없어요. 듣고 싶은 곡을 신청해보세요</p>
        )}
      </div>
      <figcaption className="tv-caption">라운지 TV{paused && ' · 일시정지'}</figcaption>
    </figure>
  );
}
