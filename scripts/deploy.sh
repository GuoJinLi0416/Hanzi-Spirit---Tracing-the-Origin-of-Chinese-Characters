#!/bin/bash

# 自动化部署脚本：构建 Docker 镜像并部署到 Google Cloud Run
# 使用方法：./scripts/deploy.sh [PROJECT_ID] [REGION] [SERVICE_NAME]

set -e

# 默认配置（请根据你的实际情况修改）
PROJECT_ID=${1:-"your-gcp-project-id"}
REGION=${2:-"europe-west3"}
SERVICE_NAME=${3:-"hanzi-spirit"}
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 开始部署流程..."

# 1. 构建 Docker 镜像
echo "📦 正在构建 Docker 镜像..."
docker build -t $IMAGE_NAME .

# 2. 推送镜像到 Google Container Registry
echo "📤 正在推送镜像到 GCR..."
docker push $IMAGE_NAME

# 3. 部署到 Cloud Run
echo "🌐 正在部署到 Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated

echo "✅ 部署完成！你的应用现在可以在 Cloud Run 上访问了。"
