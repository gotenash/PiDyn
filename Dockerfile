FROM node:20-slim

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install system dependencies
# - python3 + curl: required for downloading and executing yt-dlp
# - ffmpeg: required for processing audio/video and YouTube downloads
# - poppler-utils: for pdftocairo (converting PDF to PNG slides)
# - libreoffice: for converting PPTX to PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    curl \
    ffmpeg \
    poppler-utils \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

# Download and install the latest yt-dlp binary (Debian packages are often outdated)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package metadata first to take advantage of Docker layer caching
COPY server/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application files
COPY server/ .

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
