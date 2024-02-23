<script>
    export let containers = [];
</script>

    <table class="table">
        <tbody>
            {#each containers as container}
                <tr>
                    <th>
                        <label>
                            <input name="locations" value="1" type="checkbox" class="checkbox" />
                        </label>
                    </th>
                    <td>
                        <div class="flex items-center gap-3">
                            <div class="avatar">
                                <div class="mask mask-square w-12 h-12">
                                    <img src="{container.photoPath}" alt="Container" class="hover:scale-125 transition duration-500 cursor-pointer"/>
                                </div>
                            </div>
                            <div>
                                <div class="font-bold">{container.name}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        {#if container.children.length > 0}
                            <select class="select select-bordered w-full max-w-xs" multiple>
                                <option disabled selected>Tray</option>
                                {#each container.children as child}
                                    <option>{child.name}</option>
                                {/each}
                            </select>
                        {/if}
                    </td>
                    <th>
                        <label>
                            {container.location}<br/>
                        </label>
                    </th>
                    <th>
                        <label>
                            {container.description}<br/>
                        </label>
                    </th>
                </tr>
            {/each}
        </tbody>
    </table>
