import { useLayoutEffect, useRef } from 'react';

type Props = {
  from: DOMRect;
  onDone: () => void;
};

/**
 * 누른 창문이 화면 가득 확대되며 방으로 들어가는 전환 (약 400ms).
 * 불빛 색에서 시작해 방 배경색으로 끝나서, 끝난 뒤 방 화면이 자연스럽게 이어진다.
 */
export function WindowZoom({ from, onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDoneRef.current();
    };
    // 탭이 뒤에 있으면 브라우저가 애니메이션을 멈추므로 바로 들어간다
    if (document.hidden) {
      finish();
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const light = styles.getPropertyValue('--color-light').trim();
    const bg = styles.getPropertyValue('--color-bg').trim();

    const animation = el.animate(
      [
        {
          top: `${from.top}px`,
          left: `${from.left}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
          borderRadius: '6px',
          backgroundColor: light,
        },
        { offset: 0.6, backgroundColor: light },
        { top: '0px', left: '0px', width: '100vw', height: '100vh', borderRadius: '0px', backgroundColor: bg },
      ],
      { duration: 400, easing: 'cubic-bezier(0.3, 0, 0.1, 1)', fill: 'forwards' },
    );
    animation.onfinish = finish;
    // 애니메이션이 어떤 이유로든 끝나지 않아도 방에는 들어가게
    const fallback = window.setTimeout(finish, 1000);
    return () => {
      window.clearTimeout(fallback);
      animation.cancel();
    };
  }, [from]);

  return <div ref={ref} className="window-zoom" aria-hidden="true" />;
}
