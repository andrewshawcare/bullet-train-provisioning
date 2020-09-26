FROM node:14

WORKDIR /src

COPY ./src/package.json ./src/package-lock.json ./
RUN npm install

COPY ./src ./
RUN npx tsc --strict entrypoint.ts

CMD ["node",  "./entrypoint.js"]