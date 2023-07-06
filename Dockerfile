# Use the official Node.js LTS (Long Term Support) image as the base image
FROM node:lts

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the container's working directory
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code to the container's working directory
COPY . .

# Build the TypeScript project
RUN npm run buidl

# Expose the port on which the server will run
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
