import { ME, type QueuedSong } from '../model/room';
import { HOST_COMMANDS } from '../model/roomState';

type Props = {
  queue: QueuedSong[];
  onCancel: (entryId: string) => void;
};

export function QueueList({ queue, onCancel }: Props) {
  if (queue.length === 0) {
    return <p className="queue-empty">다음 곡이 없어요. 듣고 싶은 곡을 신청해보세요</p>;
  }
  return (
    <ol className="queue-list">
      {queue.map((song, i) => (
        <li key={song.entryId} className="queue-item">
          <span className="queue-no">{i + 1}</span>
          <span className="queue-text">
            <span className="queue-title">{song.title}</span>
            <span className="queue-by">{song.requesterNickname}</span>
          </span>
          {song.requesterId === ME.id && (
            <button type="button" className="btn-text" onClick={() => onCancel(song.entryId)}>
              취소
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

export function CommandHelp() {
  return (
    <div className="command-help">
      <p className="command-help-title">방장 명령어 (채팅창에 입력)</p>
      <dl>
        {HOST_COMMANDS.map((c) => (
          <div key={c.name} className="command-row">
            <dt>
              <code>{c.usage}</code>
            </dt>
            <dd>{c.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
