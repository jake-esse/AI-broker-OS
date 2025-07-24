# Local Development Guide

This guide will help you set up and run the AI Broker application locally.

## Prerequisites

- Node.js 18+ installed
- Docker Desktop installed and running
- Git installed

## Step-by-Step Setup

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd AI-broker-OS/ai-broker-web
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up PostgreSQL Database

Start PostgreSQL with pgvector using Docker:
```bash
docker run --name aibroker-db \
  -e POSTGRES_PASSWORD=localdev123 \
  -e POSTGRES_DB=aibroker \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16
```

### 4. Configure Environment Variables

Create a `.env.local` file in the `ai-broker-web` directory:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
# Database
DATABASE_URL="postgresql://postgres:localdev123@localhost:5432/aibroker"

# Application URL
NEXT_PUBLIC_URL=http://localhost:3000

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common

# AI Services
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Email Service
RESEND_API_KEY=your_resend_api_key

# LLM Model Selection
LLM_MODEL=gpt-4o-mini
```

### 5. Set Up the Database Schema

Run Prisma migrations:
```bash
npx prisma db push
npx prisma generate
```

### 6. Start the Development Server
```bash
npm run dev
```

The application will be available at http://localhost:3000

### 7. Access Prisma Studio (Database GUI)
```bash
npm run prisma:studio
```

Prisma Studio will open at http://localhost:5555

## Daily Development Workflow

1. **Start Docker** (if not already running)
   - Open Docker Desktop application

2. **Start the Database**
   ```bash
   docker start aibroker-db
   ```

3. **Start the Development Server**
   ```bash
   cd ai-broker-web
   npm run dev
   ```

4. **Stop Everything When Done**
   ```bash
   # Stop the dev server with Ctrl+C
   
   # Stop the database
   docker stop aibroker-db
   ```

## OAuth Setup

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Client Secret to `.env.local`

### Microsoft OAuth
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add redirect URI: `http://localhost:3000/api/auth/callback/microsoft`
4. Create a client secret
5. Copy Application (client) ID and Client Secret to `.env.local`

## Troubleshooting

### Database Connection Issues
- Ensure Docker is running: `docker ps`
- Check if PostgreSQL is running: `docker ps | grep aibroker-db`
- Restart the database: `docker restart aibroker-db`

### Prisma Studio Blank Page
- Clear browser cache or use incognito mode
- Try a different browser
- Check browser console for errors (F12)

### Authentication Issues
- Clear cookies: Visit http://localhost:3000/api/auth/clear-cookies
- Check OAuth credentials are correctly set in `.env.local`
- Ensure redirect URIs match exactly in OAuth provider settings

### Port Conflicts
- Default ports used:
  - 3000: Next.js development server
  - 5432: PostgreSQL database
  - 5555: Prisma Studio
- Change ports in `.env.local` if needed

## Useful Commands

```bash
# View database logs
docker logs aibroker-db

# Access PostgreSQL CLI
docker exec -it aibroker-db psql -U postgres -d aibroker

# Reset database (WARNING: deletes all data)
npx prisma db push --force-reset

# Generate Prisma types
npx prisma generate

# View running containers
docker ps

# Stop all containers
docker stop $(docker ps -q)
```

## Development Tips

1. **Hot Reload**: The dev server automatically reloads when you save files
2. **Type Safety**: Run `npx prisma generate` after schema changes
3. **Database GUI**: Use Prisma Studio to view/edit data
4. **API Testing**: Use tools like Postman or the browser console
5. **Debugging**: Check browser console and terminal for errors

## Next Steps

1. Sign in with Google or Microsoft OAuth
2. Connect email accounts in Settings
3. Test email processing functionality
4. Monitor loads in the dashboard