# Jira PM Agent

AI-powered assistant for Jira project management. Built with Next.js, Ollama, and the Jira REST API.

## Status

✅ **Functional** - Chat interface, Jira integration, and AI orchestration are working.

## Features

- 💬 Natural language chat interface for Jira queries
- 🔍 Smart search across sprints, assignees, and statuses
- 📊 Sprint comparison and productivity analysis
- 📋 Interactive issue tables with filtering, sorting, and CSV export
- ✏️ Create and update issues with confirmation workflow
- 📈 Track status changes and activity over time
- 🎨 Multiple themes with visual effects
- ⚡ Streaming responses with reasoning display
- 🔄 Smart context management for follow-up questions
- 🔐 Simple authentication with environment-based credentials

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 4
- **AI/ML**: Ollama (qwen2.5:7b or other models)
- **Integration**: Jira REST API v3
- **Styling**: JetBrains Mono font, 10 themes

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Jira Cloud account with API access
- Ollama instance (local or self-hosted)

### Installation

1. **Install dependencies**:

```bash
cd jira-pm-agent
pnpm install
```

2. **Configure environment**:

Create a `.env.local` file:

```env
# Jira Configuration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-api-token-here

# Required: Set your board ID so the AI focuses on your project
DEFAULT_BOARD_ID=123

# Authentication (defaults to admin/admin if not set)
AUTH_USERNAME=your-username
AUTH_PASSWORD=your-password

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# Optional: Basic auth for remote Ollama
# OLLAMA_AUTH_USER=ollama
# OLLAMA_AUTH_PASS=your_password
```

To get your Jira API token:

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy the token to your `.env.local`

To find your board ID:

1. Open your Jira board
2. Look at the URL: `https://your-domain.atlassian.net/jira/software/projects/PROJ/boards/123`
3. The number at the end (123) is your board ID

4. **Start development server**:

```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## AI Tools

The agent has access to these Jira tools:

### Read Tools

| Tool                | Description                                        |
| ------------------- | -------------------------------------------------- |
| `prepare_search`    | Resolve team member names to emails for filtering  |
| `get_sprint_issues` | Get issues from sprints with multi-filter support  |
| `get_issue`         | Get details of a specific issue including comments |
| `get_activity`      | Get status changes over time for tracking progress |

### Write Tools

| Tool            | Description                                             |
| --------------- | ------------------------------------------------------- |
| `manage_issue`  | Create or update a single issue                         |
| `create_issues` | Bulk create issues (uses native Jira API, 50 per batch) |
| `update_issues` | Bulk update issues (parallel with retry logic)          |

Write operations require user confirmation before execution.

### Cached Data

Sprint list, status list, and team members are cached (7-day TTL) and provided to the AI automatically, reducing API calls.

## Issue Tables

When the AI returns issue data, it's displayed in interactive tables with:

- **🔍 Search**: Filter by key or summary text
- **🏷️ Filter**: Multi-select dropdowns for Status and Assignee
- **📊 Sort**: Click to sort by Key, Status, Assignee, or Points
- **📥 CSV Export**: Download filtered results
- **📱 Responsive**: Controls collapse on mobile

For sprint comparisons, issues are displayed in side-by-side columns with synchronized controls.

## Available Scripts

| Script       | Description              |
| ------------ | ------------------------ |
| `pnpm dev`   | Start development server |
| `pnpm build` | Build for production     |
| `pnpm start` | Start production server  |
| `pnpm lint`  | Run ESLint               |

## Themes

The chat interface supports multiple themes:

- Grey (default)
- Gruvbox
- Nord
- Tokyo Night
- Catppuccin
- Matrix (with rain effect)
- Christmas (with snow effect)
- Space (with warp effect)
- Night Sky (with rotation effect)
- Synthwave (with grid effect)

## Project Structure

```
jira-pm-agent/
├── app/
│   ├── api/
│   │   ├── ask/              # Chat API endpoint with AI orchestration
│   │   ├── auth/             # Login/logout endpoints
│   │   └── jira/tools/       # Jira tools API
│   ├── components/           # React components
│   │   └── chat/             # Chat UI components
│   │       ├── IssueListCard/    # Interactive issue table
│   │       ├── SprintComparisonCard/ # Multi-sprint comparison
│   │       └── ...
│   ├── login/                # Login page
│   ├── globals.css           # Global styles & themes
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main page
├── hooks/
│   └── useChat.ts            # Chat state management
├── lib/
│   ├── constants.ts          # App constants
│   ├── types/                # TypeScript types
│   └── jira/                 # Jira integration
│       ├── client.ts         # Jira API client
│       ├── tools.ts          # Tool definitions for AI
│       ├── executor.ts       # Tool execution logic
│       ├── prompts.ts        # AI system prompt
│       ├── cache.ts          # Sprint/status/team caching
│       └── types.ts          # Jira-specific types
├── middleware.ts             # Auth middleware
├── docker-compose.yml        # Ollama setup
└── package.json
```

## Authentication

The app is protected by username/password authentication with bcrypt password hashing.

### Basic Setup (Development)

```env
AUTH_USERNAME=your-username
AUTH_PASSWORD=your-password
```

### Secure Setup (Production)

1. Generate a bcrypt hash for your password:

```bash
curl -X POST http://localhost:3000/api/auth/hash \
  -H "Content-Type: application/json" \
  -d '{"password": "your-secure-password"}'
```

2. Use the hash in your environment:

```env
AUTH_USERNAME=your-username
AUTH_PASSWORD_HASH=$2b$06$xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- `AUTH_PASSWORD_HASH` → bcrypt verification (12 rounds)
- `AUTH_PASSWORD` → plain text comparison (dev only)
- Defaults to `admin`/`admin` if not set

Session tokens are signed using the password as the secret.

## Deployment (Vercel)

1. **Deploy to Vercel**:

```bash
npm i -g vercel
vercel
```

2. **Set environment variables** in Vercel dashboard (Settings → Environment Variables):

| Variable             | Value                               |
| -------------------- | ----------------------------------- |
| `JIRA_BASE_URL`      | `https://your-domain.atlassian.net` |
| `JIRA_EMAIL`         | Your Jira email                     |
| `JIRA_API_TOKEN`     | Your Jira API token                 |
| `DEFAULT_BOARD_ID`   | Your board ID                       |
| `AUTH_USERNAME`      | Login username                      |
| `AUTH_PASSWORD_HASH` | Bcrypt hash of password             |
| `OLLAMA_BASE_URL`    | `https://ollama.your-domain.com`    |
| `OLLAMA_MODEL`       | `qwen2.5:7b` (or other model)       |
| `OLLAMA_AUTH_USER`   | Basic auth username (if needed)     |
| `OLLAMA_AUTH_PASS`   | Basic auth password (if needed)     |

3. **Redeploy** after setting environment variables.

## License

MIT
