#!/bin/bash

HOST="pi@192.168.178.101"
CONTAINER="itemlens-app"

echo "📜 Tailing logs for $CONTAINER (Survives restarts. Ctrl+C to quit)..."

# The while loop ensures that if the container restarts and kicks us out, 
# we instantly re-attach to the new instance.
while true; do
    # -t forces pseudo-terminal allocation so Ctrl+C propagates through SSH cleanly
    ssh -t $HOST "docker logs $CONTAINER -f"
    sleep 1
done