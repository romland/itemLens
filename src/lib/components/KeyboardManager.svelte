<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let preferences = '{}';
    
    $: keymap = (() => {
        try { 
            const prefs = JSON.parse(preferences || '{}');
            return prefs.shortcuts || {
                newSingle: 'n', newCollection: 'c', settings: 's', profile: 'p', 
                editItem: 'e', setDefaultContainer: 'l', 
                tab1: '1', tab2: '2', tab3: '3', tab4: '4'
            };
        } catch { return {}; }
    })();

    function handleKeydown(e: KeyboardEvent) {
        // Abort if the user is typing in a form field
        const activeTag = (document.activeElement as HTMLElement)?.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement as HTMLElement)?.isContentEditable) return;
        
        // Abort if modifier keys are held (we want raw single keys)
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        
        const key = e.key.toLowerCase();
        
        switch (key) {
            case keymap.newSingle:
                e.preventDefault();
                document.cookie = `itemlens_add_mode=single; path=/; max-age=31536000`;
                goto('/add');
                break;
            case keymap.newCollection:
                e.preventDefault();
                document.cookie = `itemlens_add_mode=collection; path=/; max-age=31536000`;
                goto('/add');
                break;
            case keymap.settings:
                e.preventDefault();
                goto('/settings');
                break;
            case keymap.profile:
                e.preventDefault();
                document.getElementById('profile-menu-btn')?.click();
                break;
            case keymap.editItem:
                e.preventDefault();
                // Regex checks if we are on a specific item view route (/[id]/[slug])
                if ($page.url.pathname.match(/^\/\d+\/[\w-]+$/)) {
                    goto($page.url.pathname.replace(/\/[^\/]+$/, '/edit'));
                }
                break;
            case keymap.setDefaultContainer:
                e.preventDefault();
                document.getElementById('ambient-container-btn')?.click();
                break;
            // Broadcast contextual tabs to ItemHub
            case keymap.tab1: window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'photos' })); break;
            case keymap.tab2: window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'location' })); break;
            case keymap.tab3: window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'details' })); break;
            case keymap.tab4: window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'links' })); break;
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />