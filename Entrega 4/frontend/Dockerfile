# syntax=docker/dockerfile:1
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY src/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=5s --timeout=3s --start-period=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
