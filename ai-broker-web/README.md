# AI-Broker Web Application

AI-Broker is an intelligent freight brokerage automation platform built with Next.js 15, PostgreSQL, and AI agents.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker Desktop
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd AI-broker-OS/ai-broker-web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start PostgreSQL with Docker**
   ```bash
   docker run --name aibroker-db \
     -e POSTGRES_PASSWORD=localdev123 \
     -e POSTGRES_DB=aibroker \
     -p 5432:5432 \
     -d pgvector/pgvector:pg16
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

5. **Set up database**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

Visit http://localhost:3000 to see the application.

## 📚 Documentation

- [Local Development Guide](./LOCAL_DEV_GUIDE.md) - Detailed setup instructions
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment steps
- [Session Progress](./SESSION_PROGRESS.md) - Development history

## 🏗️ Tech Stack

- **Frontend**: Next.js 15 with App Router, TypeScript, Tailwind CSS
- **Backend**: PostgreSQL with pgvector, Prisma ORM
- **Authentication**: JWT-based with OAuth 2.0 (Google & Microsoft)
- **AI**: OpenAI/Anthropic for load processing
- **Email**: OAuth-based email access for Gmail/Outlook
- **Deployment**: Vercel

## 📁 Project Structure

```
ai-broker-web/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   └── (dashboard)/       # Dashboard pages
├── components/            # React components
├── lib/                   # Utility functions and services
│   ├── auth/             # Authentication utilities
│   ├── email/            # Email processing
│   └── queries/          # Data fetching hooks
├── prisma/               # Database schema and migrations
└── public/               # Static assets
```

## 🔧 Key Features

- **Multi-Channel Communication**: Email, SMS, and phone integration
- **AI-Powered Load Processing**: Automatic quote generation and carrier matching
- **OAuth Email Integration**: Direct Gmail and Outlook access
- **Real-Time Dashboard**: Live updates for loads and quotes
- **Secure Authentication**: JWT-based sessions with OAuth providers

## 🛠️ Development Commands

```bash
# Start development server
npm run dev

# Run database migrations
npx prisma migrate dev

# Open Prisma Studio
npm run prisma:studio

# Run linting
npm run lint

# Run type checking
npm run type-check

# Build for production
npm run build
```

## 🔐 Environment Variables

Create `.env.local` with the following:

```env
# Database
DATABASE_URL="postgresql://postgres:localdev123@localhost:5432/aibroker"

# Authentication
JWT_SECRET=your-secret-key

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# AI Services
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Email
RESEND_API_KEY=your-resend-key
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run all tests
npm run test:all
```

## 🚢 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production deployment instructions.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## 📝 License

[License details here]

## 🆘 Support

For issues and questions:
- Check the [documentation](./docs)
- Open an issue on GitHub
- Contact the development team