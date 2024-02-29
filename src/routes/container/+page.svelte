<script lang="ts">
    import type { PageServerData } from "./$types";

    export let data: PageServerData;
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
    pageTitle.set("Containers");
</script>

<article style="padding-bottom: 100px;" class="">

    <div class="flex justify-between items-center border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            {$pageTitle}
        </div>
        <div class="inline-flex gap-3">
            <a href="/container/add" title="Add new container" class="text-gray-500">
                <i class="bi bi-bag-plus-fill"></i>
            </a>
        </div>
    </div>

    <div class="overflow-x-auto">
        <table class="table ">
          <thead>
            <tr>
              <th>Image</th> 
              <th>Name</th> 
              <th>Trays</th> 
              <th>Description</th> 
              <th>Location</th> 
            </tr>
          </thead> 
          <tbody>

          {#each data.containers as cont}
            <tr>
              <td>
                <img class="h-20 w-20" src="{cont.photoPath}"/>
              </td> 
              <td>
                <a href="/container/{cont.name}">{cont.name}</a><br/>
              </td> 
              <td>
                {cont.children.length}
              </td> 
              <td>
                <a href="/container/{cont.name}">{cont.description}</a>
              </td>
              <td>{cont.location}</td> 
              <td>
                <a href="/container/{cont.name}/edit" title="Edit item" class="text-gray-500">
                    <i class="bi bi-pencil-square"></i>
                </a>
              </td>

            </tr>
          {/each}

          </tbody> 
        </table>
      </div>

</article>
