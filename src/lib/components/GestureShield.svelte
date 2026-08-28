<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    export let active = true;

    const dispatch = createEventDispatcher();

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let longPressTimer: ReturnType<typeof setTimeout>;
    let passThrough = false;
    let isTouch = false; // The Ghost-Click preventer

    function handleStart(e: TouchEvent | MouseEvent) {
        if (!active) return;
        
        // If this is a touch event, flag it. If it's a mouse event right after a touch, ignore it.
        if (e.type.startsWith('touch')) isTouch = true;
        else if (isTouch) return;

        const pt = 'touches' in e ? e.touches[0] : (e as MouseEvent);
        startX = pt.clientX;
        startY = pt.clientY;
        startTime = Date.now();
        passThrough = false;

        // The Magic Trick: Drop the shield if they hold their finger still for 250ms
        longPressTimer = setTimeout(() => {
            passThrough = true;
        }, 250); 
    }

    function handleMove(e: TouchEvent | MouseEvent) {
        if (!active || passThrough) return;
        if (e.type.startsWith('mouse') && isTouch) return;

        const pt = 'touches' in e ? e.touches[0] : (e as MouseEvent);
        
        // If they start moving, it's a swipe, not a highlight attempt. Cancel the drop.
        if (Math.abs(pt.clientX - startX) > 10 || Math.abs(pt.clientY - startY) > 10) {
            clearTimeout(longPressTimer);
        }
    }

    function handleEnd(e: TouchEvent | MouseEvent) {
        clearTimeout(longPressTimer);
        if (!active) return;
        if (e.type.startsWith('mouse') && isTouch) return;

        // Lock out ghost mouse clicks for 500ms after the touch ends
        if (e.type.startsWith('touch')) {
            setTimeout(() => { isTouch = false; }, 500);
        }

        if (passThrough) {
            // Keep shield down just long enough for the native OS selection menu to pop up
            setTimeout(() => passThrough = false, 400);
            return;
        }

        const pt = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0] : (e as MouseEvent);
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        const dt = Date.now() - startTime;

        // Fast horizontal swipe detected
        if (dt < 400 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            dx > 0 ? dispatch('swipeRight') : dispatch('swipeLeft');
        } 
        // Stationary tap detected
        else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
            const width = window.innerWidth;
            if (pt.clientX < width * 0.25) dispatch('tapLeft');
            else if (pt.clientX > width * 0.75) dispatch('tapRight');
            else dispatch('tapCenter');
        }
    }

    onDestroy(() => clearTimeout(longPressTimer));
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div 
    class="absolute inset-0 z-40"
    style="pointer-events: {passThrough || !active ? 'none' : 'auto'};"
    on:touchstart|passive={handleStart}
    on:touchmove|passive={handleMove}
    on:touchend|passive={handleEnd}
    on:mousedown={handleStart}
    on:mousemove={handleMove}
    on:mouseup={handleEnd}
></div>