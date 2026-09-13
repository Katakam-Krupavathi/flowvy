# Setup Guide

## Prerequisites

1. Node.js 18+ installed
2. PostgreSQL database (use Supabase, Neon, or local PostgreSQL)
3. Accounts for:
   - Clerk (for authentication)
   - Google AI Studio (for Gemini API)
   - Transloadit (for file uploads)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory (or copy `.env.example`):

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/workflow_db?schema=public"
DIRECT_URL="postgresql://user:password@localhost:5432/workflow_db?schema=public"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# Google Gemini API
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Transloadit
NEXT_PUBLIC_TRANSLOADIT_KEY=your_transloadit_key
TRANSLOADIT_SECRET=your_transloadit_secret
```

### 3. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 4. Get API Keys

#### Google AI Studio
1. Go to https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key to `GOOGLE_AI_API_KEY`

#### Clerk
1. Go to https://clerk.com
2. Create a new application
3. Copy the publishable key and secret key to your `.env`

#### Transloadit
1. Go to https://transloadit.com
2. Sign up and get your credentials
3. Copy to `NEXT_PUBLIC_TRANSLOADIT_KEY` and `TRANSLOADIT_SECRET`

### 5. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### 6. Run Test Suite

```bash
npm test
```

## Project Structure

```
├── app/                      # Next.js app directory
│   ├── api/                 # API routes
│   │   ├── workflows/      # Workflow CRUD
│   │   ├── execute/        # Execution endpoints
│   │   └── transloadit/    # File upload
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── components/              # React components
│   ├── nodes/              # Node components (6 types)
│   ├── WorkflowCanvas.tsx  # Main canvas
│   ├── LeftSidebar.tsx     # Node palette
│   ├── RightSidebar.tsx    # History panel
│   └── WorkflowToolbar.tsx # Toolbar (save/load/export)
├── lib/                     # Utilities & Execution Engine
│   ├── tasks/              # In-process task executors (crop, extract frame, LLM)
│   ├── db.ts               # Prisma client
│   ├── store.ts            # Zustand store
│   ├── types.ts            # TypeScript types
│   ├── utils.ts            # Utility functions
│   ├── workflow-execution.ts # Execution engine & stale run recovery
│   ├── workflow-persistence.ts # Save/load/export
│   └── sample-workflow.ts  # Sample workflow generator
├── prisma/                  # Database
│   └── schema.prisma       # Prisma schema
└── scripts/                 # Tests & secret scanners
    ├── check-secrets.js    # CI credential leak scanner
    └── verify-execution.ts # Workflow test suite
```

## Features Implemented

✅ Sleek, modern Flowvy UI  
✅ Clerk authentication with protected routes  
✅ 6 node types fully functional  
✅ React Flow canvas with dot grid  
✅ Left sidebar with node buttons  
✅ Right sidebar with workflow history  
✅ Node connections with type validation  
✅ DAG validation (prevents cycles)  
✅ Workflow persistence (save/load)  
✅ Export/import as JSON  
✅ Sample workflow generator  
✅ Parallel/topological execution  
✅ Node-level execution history  
✅ In-process FFmpeg and Gemini LLM processing  
✅ Stale run recovery  
