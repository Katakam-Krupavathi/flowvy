# Flowvy

An intuitive visual workflow builder for AI and multimedia processing pipelines, powered by Next.js 14, React Flow, FFmpeg, and Google Gemini API.

## Features

- 🎨 Sleek, modern canvas interface with dark theme styling
- 🔐 Clerk authentication with protected routes
- 🔄 6 extensible node types: Text, Upload Image, Upload Video, LLM, Crop Image, Extract Frame
- 🌊 React Flow interactive canvas with dot grid background and minimap
- 📊 Workflow run history with node-level execution details
- ⚡ Concurrent/topological execution for multi-branch workflows
- 🔒 Type-safe connections with DAG validation (cycle prevention)
- 💾 Workflow persistence and JSON export/import
- 🚀 Durable in-process task execution engine (zero external background worker setup required)

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety throughout
- **PostgreSQL** - Database (use Supabase, Neon, or similar)
- **Prisma** - ORM for database access
- **Clerk** - Authentication
- **React Flow** - Visual workflow/node graph
- **fluent-ffmpeg / ffmpeg-static** - Image cropping and video frame extraction
- **Google Generative AI** - Gemini API for multimodal LLM processing
- **Transloadit** - File uploads and media processing
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Zod** - Schema validation

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

   Required environment variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `DIRECT_URL` - Direct PostgreSQL connection string (for Supabase pooling)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
   - `CLERK_SECRET_KEY` - Clerk secret key
   - `GOOGLE_AI_API_KEY` - Google Gemini API key
   - `NEXT_PUBLIC_TRANSLOADIT_KEY` - Transloadit key
   - `TRANSLOADIT_SECRET` - Transloadit secret

3. **Set up the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Run the verification suite:**
   ```bash
   npm test
   ```

## Getting API Keys

- **Google AI**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Clerk**: Sign up at [clerk.com](https://clerk.com)
- **Transloadit**: Sign up at [transloadit.com](https://transloadit.com)
- **PostgreSQL**: Use [Supabase](https://supabase.com) or [Neon](https://neon.tech) for a free database

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes (execution, workflows, models)
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── nodes/            # Node components (6 types)
│   ├── WorkflowCanvas.tsx # Canvas viewport & graph
│   ├── LeftSidebar.tsx    # Node palette
│   └── RightSidebar.tsx   # Run history inspector
├── lib/                   # Core utilities & task execution
│   ├── tasks/             # Media and AI execution tasks (crop, extract frame, LLM)
│   ├── db.ts              # Prisma client
│   ├── store.ts           # Zustand store
│   ├── types.ts           # TypeScript types
│   ├── utils.ts           # Graph & DAG utilities
│   └── workflow-execution.ts # Topological planner & execution engine
├── prisma/                # Prisma schema
│   └── schema.prisma
└── scripts/               # CI and verification scripts
    ├── check-secrets.js   # Automated secret scanner
    └── verify-execution.ts # Workflow execution test suite
```

## Node Types

### Text Node
Simple text input with textarea and output handle for text data.

### Upload Image Node
File upload via Transloadit or direct image URL. Accepts: jpg, jpeg, png, webp, gif. Shows image preview after upload.

### Upload Video Node
File upload via Transloadit or direct video URL. Accepts: mp4, mov, webm, m4v. Shows video player preview after upload.

### Run Any LLM Node (Multi-Provider)
- **Multi-Provider Support**: Choose between **Google Gemini**, **OpenAI**, and **Anthropic Claude** on a per-node basis
- **Supported Models**:
  - Google Gemini (`gemini-1.5-flash`, `gemini-1.5-flash-latest`, `gemini-2.0-flash`, `gemini-1.5-pro`)
  - OpenAI (`gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`, `o1-mini`)
  - Anthropic (`claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`)
- **Multimodal**: Accepts system prompts, user messages, and multiple images (base64 data URIs or remote URLs)
- **Token & Cost Tracking**: Live estimation of prompt tokens, completion tokens, and real-time execution cost ($ USD)
- **Inline Preview**: Displays responses and token usage badges directly on the canvas node

### Crop Image Node
- Accepts image input (URL or data URI)
- Configurable crop parameters (x%, y%, width%, height%)
- Executes via in-process FFmpeg filter

### Extract Frame from Video Node
- Accepts video URL input
- Configurable timestamp parameter (seconds or percentage)
- Extracts a single frame as image via FFmpeg

### HTTP Request Node (Generic API Integration)
- **Universal REST Client**: Make arbitrary `GET`, `POST`, `PUT`, `DELETE`, `PATCH` calls to external APIs and webhooks
- **Configurable Headers & Payload**: Set custom authorization headers, query parameters, and JSON payloads
- **Piped Outputs**: Returns parsed JSON response data and status codes, allowing any 3rd-party service to connect seamlessly to downstream LLM and media nodes
- **Safety & Timeout**: Built-in 15s timeout guard with `AbortController` and protocol verification

### Conditional / Branch Node (Dynamic Workflow Logic)
- **Dual Output Branches**: Dedicated `True` and `False` source handles for dynamic path execution
- **Rich Operator Suite**: Supports `equals`, `not_equals`, `contains`, `not_contains`, `greater_than`, `less_than`, `is_empty`, and `is_not_empty`
- **Smart DAG Pruning**: The execution planner dynamically evaluates upstream values and automatically skips downstream nodes on the inactive branch, enabling true cyclical and conditional pipelines

## Workflow Features

- **Drag & Drop Nodes**: Add nodes from sidebar to canvas
- **Node Connections**: Connect output handles to input handles with animated edges
- **Configurable Inputs**: All node parameters configurable via handles OR manual entry
- **Type-Safe Connections**: Enforced type validation
- **DAG Validation**: Prevents circular dependencies
- **Selective Execution**: Run single node, selected nodes, or full workflow
- **Parallel Execution**: Independent branches execute concurrently
- **Workflow Persistence**: Save/load workflows to database
- **Export/Import**: Export workflows as JSON

## Workflow History & Cost Analytics

The right sidebar provides real-time insights into your workflow runs:
- **Lifetime Analytics**: Aggregated total tokens processed and cumulative estimated expenditure ($ USD)
- **Per-Run Cost Badges**: Token consumption and USD pricing breakdown calculated using actual model pricing tiers
- **Execution Scopes**: Distinguish between full workflow, partial branch, and single-node debug runs
- **Node-Level Inspector**: Drill down into inputs, outputs, errors, token usage, and durations for each executed step
- **Automatic Stale Cleanup**: Proactive cleanup of interrupted runs older than 15 minutes

## Sample Workflow

The project includes a pre-built sample workflow demonstrating:
- All 6 node types
- Parallel execution of independent branches
- Convergence point with multiple inputs
- Input chaining across nodes

## Deployment

Deploy to Vercel or any Node.js host:

1. Push your code to GitHub
2. Import project into Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## Troubleshooting

### Gemini API Models
- The application uses `gemini-1.5-flash` by default.
- Ensure your `GOOGLE_AI_API_KEY` is active and copied directly from [Google AI Studio](https://makersuite.google.com/app/apikey) into `.env`.
- You can test your key and inspect available models by visiting `http://localhost:3000/api/test-models`.

### Database Connection
- If you encounter database connection errors (e.g. `P1001`, `Tenant or user not found`, or password decoding issues), refer to the detailed [Database Setup & Troubleshooting Guide](DATABASE_SETUP.md).

## License

MIT
