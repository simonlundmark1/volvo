# Deploying to Vercel

This guide explains how to deploy both the frontend and backend to Vercel.

## Backend Deployment

1. Navigate to the backend directory:
```
cd backend
```

2. Deploy with Vercel CLI (first time will require authentication):
```
vercel
```

3. Answer the prompts:
   - Set up and deploy: `yes`
   - Choose your account (personal or team)
   - Link to existing project: `no`
   - Project name: `volvo-game-backend` (or any name you prefer)
   - In which directory is your code located: `./` (current directory)
   - Want to override settings: `no`

4. Vercel will deploy your backend and provide a URL (save this URL!)

5. Set up environment variables in Vercel dashboard:
   - Go to your project in Vercel dashboard
   - Navigate to "Settings" -> "Environment Variables"
   - Add your MongoDB connection string as `MONGODB_URI`

## Frontend Deployment

1. Update your `.env.production` file with the backend URL:
```
VITE_API_URL=https://your-backend-url.vercel.app
```

2. Navigate to the root directory of your project:
```
cd ..
```

3. Deploy with Vercel CLI:
```
vercel
```

4. Answer the prompts similarly to the backend deployment.

5. Your frontend will be deployed and connected to your backend API!

## Updating Your Deployment

When you make changes:

1. For backend updates:
```
cd backend
vercel
```

2. For frontend updates:
```
vercel
```

## Troubleshooting

- If you encounter CORS errors, ensure your backend allows requests from your frontend domain
- Check Vercel logs for any deployment or runtime errors
- Verify environment variables are correctly set in Vercel dashboard 