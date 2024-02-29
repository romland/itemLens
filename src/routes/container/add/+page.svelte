<script lang="ts">
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";

    export let form: ActionData;



/*
model Container {
  // Name must be unique. The simplest way is to include its parent containers as prefix (e.g. 'A 001' and 'B 001').
  name        String @unique    // A or A 001 (Note: sub-containers must be denoted with space)
  
  parentId    String?
  parent      Container?  @relation("ParentRelation", fields: [parentId], references: [name])
  children    Container[] @relation("ParentRelation")

  description String            // closet with door
  location    String?           // top of desk (JR)
  photoPath   String?

  items       ItemsInContainer[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
*/


    import pageTitle from '$lib/stores';
    pageTitle.set("Add container");

</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}


<form method="post" enctype="multipart/form-data" use:enhance>
    <div class="mb-3">
        <input type="text" name="name" placeholder="Name" value="" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="location" placeholder="Location" value="" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="numtrays" placeholder="Number of trays" value="" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="file" name="photoPath" accept="image/*" class="file-input w-full">
    </div>

    <div class="mb-3">
        <textarea name="description" rows="10" placeholder="description" class="textarea textarea-bordered w-full"></textarea>
    </div>

    <button type="submit" class="btn btn-primary">Save</button>
</form>
