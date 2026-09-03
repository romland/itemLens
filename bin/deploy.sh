#!/bin/bash
set -e

HOST="pi@192.168.178.101"
DIR="~/itemlens"
CONTAINER="itemlens-app"

echo "📦 Building bundle..."
npm run bundle

echo "🚀 Transferring bundle to $HOST..."
scp itemlens-dist.tar.gz $HOST:$DIR/

echo "🔧 Executing remote commands..."
# Unquoted EOF allows local variables to be evaluated before being sent over SSH
ssh $HOST << EOF
    cd $DIR
    
    echo "🧹 Clearing FTS indices..."
    sudo sqlite3 prisma/dev.db "DROP TABLE IF EXISTS DocumentIndex; DROP TABLE IF EXISTS DocumentIndex_data; DROP TABLE IF EXISTS DocumentIndex_idx; DROP TABLE IF EXISTS DocumentIndex_content; DROP TABLE IF EXISTS DocumentIndex_docsize; DROP TABLE IF EXISTS DocumentIndex_config;"
    
    echo "📦 Extracting bundle..."
    tar xvf itemlens-dist.tar.gz
    
    echo "🔄 Restarting container..."
    docker restart $CONTAINER
EOF

echo "✅ Deployment complete!"
