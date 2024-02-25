<script lang="ts">
    import type { ActionData } from "./$types";
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";

    export let form: ActionData;

    import pageTitle from '$lib/stores';
    pageTitle.set("Settings");
</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form method="post" use:enhance>
	<div class="mb-3">
		<input type="password" name="password" placeholder="Password"  class="input input-bordered w-full">
	</div>
	<div class="inline-flex items-center gap-3">
		<button type="submit" class="btn btn-primary">Change Password</button>
	</div>
</form>