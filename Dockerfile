# Use Python 3.11 slim as the base image
FROM python:3.11-slim

# Set environment variables for a non-interactive install and unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Make the start script executable
RUN chmod +x start.sh

# Expose the port the app runs on (Railway will map this)
EXPOSE 8000

# Set the command to run the application
CMD ["./start.sh"]
