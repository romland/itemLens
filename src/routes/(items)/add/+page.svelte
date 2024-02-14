<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import Title from "$lib/components/Title.svelte";

    export let form: ActionData;

    var videoTrack, videoTrackSettings;
    const USE_VIDEO_STREAM_CAMERA = false;
    let cameraUsed = false;
    let landscape = false;

    if (typeof window !== 'undefined' && USE_VIDEO_STREAM_CAMERA) {
        navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
            video: {
                minAspectRatio: 1.333,
                // minFrameRate: 30,
                width: 1920,
                // heigth: 720,
                facingMode: 'environment'
            }
        }).then(localMediaStream => {
            if ('srcObject' in eltCameraStream) {
                eltCameraStream.srcObject = localMediaStream;
            } else {
                eltCameraStream.src = window.URL.createObjectURL(localMediaStream);
            }

            eltCameraStream.setAttribute('autoplay', '');
            eltCameraStream.setAttribute('muted', '');
            eltCameraStream.setAttribute('playsinline', '')

            let videoTracks = localMediaStream.getVideoTracks();
            if (videoTracks.length > 0) {
                videoTrack = videoTracks[0];
            }

            videoTrackSettings = videoTrack.getSettings();


            eltCameraStream.play();
        }).catch(err => {
            console.error(`User-media not available`, err);
        });
    }

    function takePhoto()
    {
        if(!eltCameraStream || !eltCameraStream.srcObject || !videoTrack) {
            console.log("No camera stream");
            return;
        }

        cameraUsed = true;

        const orientation = getScreenOrientation();
        // eltCanvas.width = videoTrackSettings.width;
        // eltCanvas.height = videoTrackSettings.height;
        
        eltCanvas.width = orientation === "landscape" ? videoTrackSettings.width : videoTrackSettings.height;
        eltCanvas.height = orientation === "landscape" ? videoTrackSettings.height : videoTrackSettings.width;

        let ctxt = eltCanvas.getContext('2d');
        ctxt.drawImage(eltCameraStream, 0, 0, 
            // videoTrackSettings.width,
            // videoTrackSettings.height
            orientation === "landscape" ? videoTrackSettings.width : videoTrackSettings.height, 
            orientation === "landscape" ? videoTrackSettings.height : videoTrackSettings.width
        );

        // TODO:
        // There are better ways to do this, but I need the eltPreviewCanvas element to become
        // visible before I work with the element (cameraUsed must have become true).
        setTimeout(() => {
            eltPreviewCanvas.getContext('2d').drawImage(eltCameraStream, 0, 0, videoTrackSettings.width * 0.25, videoTrackSettings.height * 0.25);
        }, 50);
    }


    const onSubmit: SubmitFunction = async (data) => {
        // take the data of the canvas and throw it in formData for submission
        if(cameraUsed) {
            const blob = await new Promise(resolve => eltCanvas.toBlob(resolve));
            data.formData.set("file", blob, "item.png");
        }

        // Debug
        data.formData.set("content", JSON.stringify(videoTrackSettings));

        return async (options) => {
            // after the form submits...
            console.log("saved:", options);
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }

function getScreenOrientation()
{
  if (window.orientation === undefined) {
    // If the window.orientation is not supported, use media queries
    if (window.matchMedia("(orientation: portrait)").matches) {
      return 'portrait';
    } else {
      return 'landscape';
    }
  }
  
  if (window.orientation === 0) {
    return 'portrait';
  } else if (window.orientation === 90 || window.orientation === -90) {
    return 'landscape';
  } else if (window.orientation === 180) {
    return 'portrait upside-down';
  }
}

</script>

<svelte:head>
    <Title>Add New Item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

{#if USE_VIDEO_STREAM_CAMERA}
    <button on:click={()=>takePhoto()} class="btn btn-primary">Take pic</button>
    <video  on:click={()=>takePhoto()} id="eltCameraStream"/>
    Orientation: <span id="o9n"></span>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <div class="mb-3">
        <input type="text" name="title" value="Default name" placeholder="Title" class="input input-bordered w-full">
    </div>
    {#if !cameraUsed}
        <div class="mb-3">
            <!--input id="eltFileInput" type="file" name="file" accept="image/*" class="file-input w-full"-->
            <input id="eltFileInput" type="file" name="file" accept="image/*" capture="environment" class="file-input w-full">
        </div>
    {:else}
        <canvas id="eltPreviewCanvas" style="width:{eltCanvas.width * 0.25}px; height:{eltCanvas.height * 0.25}px;" />
    {/if}
    <div class="mb-3">
        <textarea name="content" rows="5" placeholder="Content" class="textarea textarea-bordered w-full"></textarea>
    </div>
    <div class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>

    <button type="submit" class="btn btn-primary">Save</button>

</form>

{#if USE_VIDEO_STREAM_CAMERA}
    <canvas id="eltCanvas" style="opacity: 0; width: 10px; height: 10px;"/>
{/if}
