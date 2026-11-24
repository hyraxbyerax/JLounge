import { GAME_CATALOG, type GameType } from '@lounge/shared';
import { Modal } from '../../../shared/ui/Modal';

type Props = {
  onPick: (type: GameType) => void;
  onClose: () => void;
};

export function GamePickerDialog({ onPick, onClose }: Props) {
  return (
    <Modal title="게임 고르기" onClose={onClose}>
      <div className="modal-form">
        <ul className="game-pick-list">
          {GAME_CATALOG.map((g) => (
            <li key={g.type} className="game-pick">
              <span className="game-pick-text">
                <span className="game-pick-name">{g.name}</span>
                <span className="form-hint">{g.description}</span>
              </span>
              <button type="button" className="btn btn-primary" onClick={() => onPick(g.type)}>
                고르기
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
