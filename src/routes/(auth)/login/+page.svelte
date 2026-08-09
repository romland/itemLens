<script lang="ts">
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";

    export let form: ActionData;

	let isLoggingIn = false;

    import pageTitle from '$lib/stores';
    pageTitle.set("Log in");
</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form method="post" use:enhance={() => {
    isLoggingIn = true;
    return async ({ update }) => {
        await update();
        isLoggingIn = false;
    };
}}>
	<div class="mb-3">
		<input type="text" name="username" placeholder="Username" class="input input-bordered w-full">
	</div>
	<div class="mb-3">
		<input type="password" name="password" placeholder="Password"  class="input input-bordered w-full">
	</div>
	<div class="inline-flex items-center gap-3">
		<button type="submit" class="btn btn-primary" disabled={isLoggingIn}>
			{#if isLoggingIn}<span class="loading loading-spinner loading-sm"></span>{/if}
			Sign In
		</button>
		<a href="/register">Register</a>
	</div>
</form>