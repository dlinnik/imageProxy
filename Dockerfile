FROM node:20-alpine

# Установка зависимостей
WORKDIR /app
COPY package*.json ./
RUN npm install

# Копирование кода
COPY index.js ./

# Запуск
EXPOSE 2920
CMD ["node", "index.js"]
