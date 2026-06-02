# Build and serve this Markline docs site as a Node server (full features,
# including the API playground proxy). For a static deploy, use `markline export`
# and host the `out/` directory instead.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx markline build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npx", "markline", "start"]
