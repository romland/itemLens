<script lang="ts">
    export let date: string | number | Date | null | undefined = null;
    export let capitalize: boolean = false;

    $: parsedDate = date ? new Date(date) : null;
    
    $: exactFormat = parsedDate ? parsedDate.toLocaleDateString(undefined, { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    }) : '';

    $: relativeStr = parsedDate ? getRelativeTime(parsedDate) : 'Unknown';
    $: displayStr = capitalize ? relativeStr.charAt(0).toUpperCase() + relativeStr.slice(1) : relativeStr;

    function getRelativeTime(d: Date) {
        const diffInSeconds = Math.floor((new Date().getTime() - d.getTime()) / 1000);
        if (diffInSeconds < 60) return "just now";
        
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes === 1) return "a minute ago";
        if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours === 1) return "an hour ago";
        if (diffInHours < 24) return `${diffInHours} hours ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays === 1) return "a day ago";
        if (diffInDays < 30) return `${diffInDays} days ago`;
        
        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths === 1) return "a month ago";
        if (diffInMonths < 12) return `${diffInMonths} months ago`;
        
        const diffInYears = Math.floor(diffInDays / 365);
        if (diffInYears === 1) return "a year ago";
        return `${diffInYears} years ago`;
    }
</script>

{#if parsedDate}
    <span class="tooltip tooltip-bottom before:text-xs before:max-w-max cursor-help border-b border-dashed border-gray-400/50 transition-colors hover:text-primary" data-tip={exactFormat}>{displayStr}</span>
{:else}
    <span class="text-gray-400 italic">Unknown</span>
{/if}