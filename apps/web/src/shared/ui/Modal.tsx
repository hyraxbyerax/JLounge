import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 검색 결과처럼 내용이 많을 때 넓게 */
  wide?: boolean;
};

/** 네이티브 <dialog> 기반 대화상자. Esc로 닫히고 포커스가 안에 머문다. */
export function Modal({ title, onClose, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className={`modal${wide ? ' is-wide' : ''}`} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className="modal-title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
