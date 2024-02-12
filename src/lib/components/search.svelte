<script lang="ts">
    export let q: string = '';
</script>
<!--
<div class="mb-6">
    <form method="GET" action="/search">
        <div class="form-control">
            <div class="join join-horizontal">
                <input type="text" name="q" value="{q}" class="input input-bordered w-full join-item" required>
                <button type="submit" class="btn btn-primary join-item">Search</button>
            </div>
        </div>
    </form>
</div>
-->
<form method="GET" action="/search">
    <div class="form-control items-end">
        <input type="text" name="q" value="{q}" placeholder="Search" class="input input-bordered md:w-auto w-full join-item" />
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-8 pr-2 absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
    </div>
</form>
