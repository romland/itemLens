<script>
    export let values = [];
    export let inputName = "foobar"
    export let columns = {
        "3": {name:"Foo",fieldName:"Bar", isImage: true},
        "4": {name:"Apa",fieldName:"Bepa"}
    };

    let refreshItem = [];
    function toggleRefreshAll(ev)
    {
        refreshItem = [];
        if(ev.target.checked) {
            for(let i = 0; i < values.length; i++) {
                const item = values[i]
                refreshItem.push(item.id);
            }
            refreshItem = refreshItem;
        }
    }

    function toggleRefresh(ev)
    {
        const itemId = parseInt(ev.target.name.split(".")[1]);
        if(refreshItem.includes(itemId)) {
            refreshItem.splice(refreshItem.indexOf(itemId), 1);
        } else {
            refreshItem.push(itemId);
        }
        refreshItem = refreshItem;
    }

    let deleteItem = [];
    function toggleDeleteAll(ev)
    {
        deleteItem = [];
        if(ev.target.checked) {
            for(let i = 0; i < values.length; i++) {
                const item = values[i]
                deleteItem.push(item.id);
            }
            deleteItem = deleteItem;
        }
    }

    function toggleDelete(ev)
    {
        const itemId = parseInt(ev.target.name.split(".")[1]);
        if(deleteItem.includes(itemId)) {
            deleteItem.splice(deleteItem.indexOf(itemId), 1);
        } else {
            deleteItem.push(itemId);
        }
        deleteItem = deleteItem;
    }

</script>

<div class="w-full">
    <input type="hidden" name="delete_{inputName}" value="{JSON.stringify(deleteItem) || '[]'}"/>
    <input type="hidden" name="refresh_{inputName}" value="{JSON.stringify(refreshItem) || '[]'}"/>
    
    <table class="table w-full">
        <thead>
            <tr>
                <th>
                    <label>
                        Delete<br/>
                        <input type="checkbox" class="checkbox" on:change={toggleDeleteAll}/>
                    </label>
                </th>
                <th>
                    <label>
                        Refresh<br/>
                        <input type="checkbox" class="checkbox" on:change={toggleRefreshAll}/>
                    </label>
                </th>
                <th>{columns["3"].name}</th>
                <th>{columns["4"].name}</th>
            </tr>
        </thead>

        <tbody>
            {#each values as item}
                <tr>
                    <td>
                        <label>
                            <input type="checkbox" class="checkbox" checked={deleteItem.includes(item.id)} on:change={toggleDelete} name="delete.{item.id}"/>
                        </label>
                    </td>
                    <td>
                        <label>
                            <input type="checkbox" class="checkbox" checked={refreshItem.includes(item.id)} on:change={toggleRefresh} name="refresh.{item.id}"/>
                        </label>
                    </td>
                    <td>
                        <div class="avatar">
                            {#if columns["3"]?.isImage}
                                <div class="mask mask-squircle w-12 h-12">
                                    <img src="{item[columns["3"].fieldName]}" alt="" />
                                </div>
                            {:else}
                                {item[columns["3"].fieldName]}
                            {/if}
                        </div>
                    </td>
                    <td>
                        {#if columns["4"].isLink}
                            <a href="{item[columns["4"].fieldName]}" target="_blank">
                                {item[columns["4"].fieldName]}
                            </a>
                        {:else}
                            {item[columns["4"].fieldName]}
                        {/if}
                    </td>
                </tr>
            {/each}
        </tbody>

    </table>
</div>