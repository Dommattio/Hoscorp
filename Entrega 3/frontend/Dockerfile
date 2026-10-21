# syntax=docker/dockerfile:1
FROM nginx:alpine

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom reverse proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend source files
COPY src/ /usr/share/nginx/html/

# Expose HTTP port
EXPOSE 80

# Healthcheck to verify frontend node is physically responsive
HEALTHCHECK --interval=5s --timeout=3s --start-period=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
