# Volvo Game with MongoDB Integration

A 3D driving game with MongoDB-powered highscores.

## Project Structure

This project uses a serverless architecture:

- `/src` - Vue/Three.js frontend game
- `/api` - Vercel serverless API endpoints 
- `/models` - MongoDB data models
- `/lib` - Shared utilities for database connection

## Development

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your MongoDB connection string:
   ```
   MONGODB_URI=your_connection_string
   VITE_API_URL=http://localhost:3001
   ```
4. Run the development server:
   ```
   npm run dev
   ```

## API Endpoints

- `GET /api/hiscores` - Get top 10 highscores
- `POST /api/hiscores` - Submit a new highscore (JSON body with `name` and `score`)

## Deployment

The project is deployed to Vercel, which handles both:
- Frontend (Vue/Three.js game)
- Backend (Serverless API functions)

Environment variables (set in Vercel dashboard):
- `MONGODB_URI` - Your MongoDB Atlas connection string

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
npm run build

# Runs the end-to-end tests
npm run test:e2e
# Runs the tests only on Chromium
npm run test:e2e -- --project=chromium
# Runs the tests of a specific file
npm run test:e2e -- tests/example.spec.ts
# Runs the tests in debug mode
npm run test:e2e -- --debug
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
