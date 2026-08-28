export function bodyScrollLock(node: HTMLElement, isLocked: boolean) {
    let scrollPosition = 0;

    const lock = () => {
        if (typeof window === 'undefined') return;
        scrollPosition = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollPosition}px`;
        document.body.style.width = '100%';
        document.documentElement.style.overscrollBehavior = 'none';
    };

    const unlock = () => {
        if (typeof window === 'undefined') return;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.documentElement.style.overscrollBehavior = '';
        window.scrollTo(0, scrollPosition);
    };

    if (isLocked) lock();

    return {
        update(newIsLocked: boolean) {
            if (newIsLocked && !isLocked) lock();
            else if (!newIsLocked && isLocked) unlock();
            isLocked = newIsLocked;
        },
        destroy() {
            if (isLocked) unlock();
        }
    };
}