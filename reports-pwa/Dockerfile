# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (includes devDependencies needed for build)
RUN npm ci

# Copy source code
COPY . .

# Accept build arguments for environment variables
ARG VITE_GOOGLE_SHEETS_API_KEY
ARG VITE_GOOGLE_SHEETS_SPREADSHEET_ID
ARG VITE_GOOGLE_SHEETS_RANGE

# Set them as environment variables for the build
ENV VITE_GOOGLE_SHEETS_API_KEY=$VITE_GOOGLE_SHEETS_API_KEY
ENV VITE_GOOGLE_SHEETS_SPREADSHEET_ID=$VITE_GOOGLE_SHEETS_SPREADSHEET_ID
ENV VITE_GOOGLE_SHEETS_RANGE=$VITE_GOOGLE_SHEETS_RANGE

# Build the PWA (Vite will inject these variables)
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
