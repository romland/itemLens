<script lang="ts">
  let { enabled = false } = $props<{ enabled?: boolean }>();

  type Touch = {
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    pressing: boolean;
    swiping: boolean;
    fading: boolean;
  };

  let touches = $state<Touch[]>([]);

  $effect(() => {
    if (!enabled) {
      touches = [];
      return;
    }

    // --- Core Logic ---
    const handleStart = (id: string, x: number, y: number) => {
      if (!touches.find(t => t.id === id)) {
        touches.push({
          id, x, y, startX: x, startY: y,
          pressing: true, swiping: false, fading: false
        });
      }
    };

    const handleMove = (id: string, x: number, y: number) => {
      const touch = touches.find(t => t.id === id);
      if (touch) {
        touch.x = x;
        touch.y = y;

        if (!touch.swiping) {
          const distanceMoved = Math.hypot(touch.x - touch.startX, touch.y - touch.startY);
          
          // Lowered to 10px so it triggers slightly faster on mobile
          if (distanceMoved > 10) {
            touch.swiping = true;
            touch.pressing = false; 
          }
        }
      }
    };

    const handleEnd = (id: string) => {
      const touch = touches.find(t => t.id === id);
      if (touch && !touch.fading) {
        touch.pressing = false;
        touch.swiping = false;
        touch.fading = true;
        
        setTimeout(() => {
          touches = touches.filter(t => t.id !== id);
        }, 200);
      }
    };

    // --- iOS Touch Events ---
    // We track this flag so we don't accidentally double-draw dots 
    // if a device fires both touch AND mouse events.
    let isTouchDevice = false; 

    const onTouchStart = (e: TouchEvent) => {
      isTouchDevice = true;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        handleStart(`touch-${t.identifier}`, t.clientX, t.clientY);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        handleMove(`touch-${t.identifier}`, t.clientX, t.clientY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        handleEnd(`touch-${t.identifier}`);
      }
    };

    // --- Desktop Mouse Fallback ---
    let isMouseDown = false;

    const onMouseDown = (e: MouseEvent) => {
      if (isTouchDevice) return; // Ignore if using a real touchscreen
      isMouseDown = true;
      handleStart('mouse', e.clientX, e.clientY);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isMouseDown && !isTouchDevice) {
        handleMove('mouse', e.clientX, e.clientY);
      }
    };

    const onMouseUp = () => {
      if (isTouchDevice) return;
      isMouseDown = false;
      handleEnd('mouse');
    };

    // { passive: true } is the magic trick here. It tells iOS: 
    // "I'm just watching the coordinates, I won't block the scroll."
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });
</script>

{#if enabled}
  {#each touches as touch (touch.id)}
    <div
      class="demo-touch-indicator"
      class:pressing={touch.pressing}
      class:swiping={touch.swiping}
      class:fading={touch.fading}
      style="left: {touch.x}px; top: {touch.y}px;"
    ></div>
  {/each}
{/if}

<style>
  /* Base state */
  .demo-touch-indicator {
    position: fixed;
    width: 60px;
    height: 60px;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none; 
    z-index: 2147483647; 
    transition: transform 0.15s cubic-bezier(0.17, 0.67, 0.83, 0.67), 
                opacity 0.2s ease-out, 
                background 0.15s, 
                border 0.15s;
  }
  
  /* TAP STATE */
  .pressing {
    transform: translate(-50%, -50%) scale(0.6);
    background: rgba(255, 255, 255, 0.7);
    border: 2px solid rgba(0, 0, 0, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
  }

  /* SWIPE STATE */
  .swiping {
    transform: translate(-50%, -50%) scale(1.1);
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid transparent;
    box-shadow: none;
    backdrop-filter: none;
  }
  
  /* LETTING GO */
  .fading {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.3);
  }
</style>