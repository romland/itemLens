<script lang="ts">
    export let openClass: string = "dropdown-open";
    
    function handleClick(e: MouseEvent) {
        // Automatically close the dropdown if a link inside it was clicked
        if ((e.target as HTMLElement).closest('a')) {
            const parent = (e.currentTarget as HTMLElement).closest('.dropdown');
            if (parent) parent.classList.remove(openClass);
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
    class="dropdown-content mt-2 z-[999] w-[calc(100vw-2rem)] sm:w-[28rem] md:right-auto md:left-1/2 md:-ml-[14rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-base-100/95 backdrop-blur-2xl ring-1 ring-base-content/10 rounded-2xl p-2 flex flex-col gap-1" 
    on:click={handleClick}
>
    <slot />
</div>