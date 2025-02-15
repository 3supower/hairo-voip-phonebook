FROM node:iron-alpine3.21

ENV TZ="Australia/Sydney"

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
