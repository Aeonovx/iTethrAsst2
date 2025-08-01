#!/bin/bash
set -e

echo "🚀 Starting iTethr Bot FastAPI Server on Railway..."

# Create necessary directories if they don't exist
mkdir -p ./data ./logs

# The PORT environment variable is set by Railway.
# We run the main FastAPI app using uvicorn.
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
