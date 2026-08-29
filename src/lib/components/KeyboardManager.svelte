<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let preferences = '{}';
    
    $: keymap = (() => {
        const defaults = {
            newSingle: 'n', newCollection: 'c', settings: 's', profile: 'p', 
            editItem: 'e', setDefaultContainer: 'l', goHome: 'h',
            tab1: '1', tab2: '2', tab3: '3', tab4: '4',
            stockInc: '+', stockDec: '-'
        };
        try { 
            const prefs = JSON.parse(preferences || '{}');
            return {
                ...defaults,
                ...(prefs.shortcuts || {})
            };
        } catch { return defaults; }
    })();

    function handleKeydown(e: KeyboardEvent) {
        // Abort if the user is typing in a form field
        const activeTag = (document.activeElement as HTMLElement)?.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement as HTMLElement)?.isContentEditable) return;
        
        // Ignore standalone modifier presses
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        
        let combo = [];
        if (e.ctrlKey) combo.push('ctrl');
        if (e.altKey) combo.push('alt');
        if (e.metaKey) combo.push('meta');
        
        // Only add 'shift' if it's a standard letter. Symbols like '+' are already shifted!
        if (e.shiftKey && e.key.toLowerCase() !== e.key.toUpperCase()) {
            combo.push('shift');
        }
        combo.push(e.key.toLowerCase());
        
        const pressedCombo = combo.join('+');
        let matchedAction = null;
        
        for (const [action, shortcut] of Object.entries(keymap)) {
            if (shortcut === pressedCombo) {
                matchedAction = action;
                break;
            }
        }
        
        if (!matchedAction) return;
        
        switch (matchedAction) {
            case 'newSingle':
                e.preventDefault();
                console.log('[Keybind] Shortcut pressed: New Single');
                document.cookie = `itemlens_add_mode=single; path=/; max-age=31536000`;
                if ($page.url.pathname === '/add') {
                    window.dispatchEvent(new CustomEvent('shortcut:addMode', { detail: 'single' }));
                } else {
                    goto('/add').then(() => {
                        window.dispatchEvent(new CustomEvent('shortcut:addMode', { detail: 'single' }));
                    });
                }
                break;
            case 'newCollection':
                e.preventDefault();
                console.log('[Keybind] Shortcut pressed: New Multi-Scan');
                document.cookie = `itemlens_add_mode=collection; path=/; max-age=31536000`;
                if ($page.url.pathname === '/add') {
                    window.dispatchEvent(new CustomEvent('shortcut:addMode', { detail: 'collection' }));
                } else {
                    goto('/add').then(() => {
                        window.dispatchEvent(new CustomEvent('shortcut:addMode', { detail: 'collection' }));
                    });
                }
                break;
            case 'goHome':
                e.preventDefault();
                goto('/');
                break;
            case 'settings':
                e.preventDefault();
                goto('/settings');
                break;
            case 'profile':
                e.preventDefault();
                document.getElementById('profile-menu-btn')?.click();
                break;
            case 'editItem':
                e.preventDefault();
                // Regex checks if we are on a specific item view route (/[id]/[slug])
                if ($page.url.pathname.match(/^\/\d+\/[\w-]+$/)) {
                    goto($page.url.pathname.replace(/\/[^\/]+$/, '/edit'));
                }
                break;
            case 'setDefaultContainer':
                e.preventDefault();
                document.getElementById('ambient-container-btn')?.click();
                break;
            // Broadcast contextual tabs to ItemHub
            case 'tab1': window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'photos' })); break;
            case 'tab2': window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'location' })); break;
            case 'tab3': window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'details' })); break;
            case 'tab4': window.dispatchEvent(new CustomEvent('shortcut:tab', { detail: 'links' })); break;
            case 'stockInc': 
                e.preventDefault(); 
                window.dispatchEvent(new CustomEvent('shortcut:stockInc')); 
                break;
            case 'stockDec': 
                e.preventDefault(); 
                window.dispatchEvent(new CustomEvent('shortcut:stockDec')); 
                break;
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />