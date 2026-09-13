# Database Setup & Configuration Guide

This guide covers everything you need to configure, connect, and troubleshoot PostgreSQL database connections for the workflow builder.

---

## 1. What is `DATABASE_URL`?

`DATABASE_URL` is the connection string Prisma and PostgreSQL use to connect to your database instance. It follows this standard URI format:

```
postgresql://[USERNAME]:[PASSWORD]@[HOST]:[PORT]/[DATABASE_NAME]?[PARAMETERS]
```

### Breakdown of Connection Components:
- **`USERNAME`**: Database user (e.g. `postgres` for direct Supabase, or `postgres.your-project-ref` for Supabase pooler).
- **`PASSWORD`**: Your database password (URL-encoded if containing special characters).
- **`HOST`**: Server hostname (e.g. `aws-0-us-west-1.pooler.supabase.com`, `ep-xxxxx.us-east-2.aws.neon.tech`, or `localhost`).
- **`PORT`**: Connection port (`5432` for direct PostgreSQL, `6543` for Supabase pooler).
- **`DATABASE_NAME`**: The specific database name (typically `postgres` or `workflow_db`).
- **`PARAMETERS`**: Query parameters such as `?sslmode=require` or `?schema=public`.

---

## 2. Setting Up Your Database

### Option A: Supabase (Cloud - Recommended)

1. Sign up or log in at [supabase.com](https://supabase.com).
2. Create a new project, enter a project name, and set a secure database password (**save this password**).
3. Once provisioned, open **Settings** (⚙️) → **Database**.
4. In the **Connection string** section:
   - Select the **Connection pooling** tab.
   - Set the mode to **Session** (recommended for Prisma).
   - Copy the URI connection string.

**Connection String Examples (Supabase):**

- **Connection Pooler & Direct URL (Recommended for Prisma):**
  ```env
  DATABASE_URL="postgresql://postgres.your-project-ref:YOUR_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
  DIRECT_URL="postgresql://postgres.your-project-ref:YOUR_PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
  ```
- **Direct Connection Only:**
  ```env
  DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.your-project-ref.supabase.co:5432/postgres?sslmode=require"
  ```

---

### Option B: Neon (Serverless Postgres)

1. Sign up or log in at [neon.tech](https://neon.tech).
2. Create a new project and select your preferred cloud region.
3. From the project dashboard, copy the provided connection string.

**Connection String Example (Neon):**
```env
DATABASE_URL="postgresql://your_user:YOUR_PASSWORD@ep-sample-pool-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

---

### Option C: Local PostgreSQL

If running PostgreSQL locally on your machine or inside Docker:

1. Ensure PostgreSQL is installed and running:
   ```bash
   # Create a local database
   psql -U postgres -c "CREATE DATABASE workflow_db;"
   ```
2. Configure your local `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/workflow_db?schema=public"
   ```

---

## 3. Connection Pooler vs. Direct Connection

| Feature | Connection Pooler (Port 6543) | Direct Connection (Port 5432) |
| :--- | :--- | :--- |
| **Primary Host Format** | `aws-0-[region].pooler.supabase.com` | `db.[project-ref].supabase.co` |
| **Username Format** | `postgres.[project-ref]` | `postgres` |
| **Best For** | Serverless functions, Next.js API routes | Long-running servers, schema migrations |
| **IPv4 / Network Compatibility** | High (Works across standard IPv4 networks) | Requires IPv6 or Supabase IPv4 add-on |
| **Connection Limits** | Manages thousands of pooled client connections | Limited by database compute tier |

> **Recommendation**: For Next.js and serverless deployments, use the Supabase **Connection Pooler** on port `6543` with Session mode.

---

## 4. Password URL-Encoding Rules

Database connection strings are parsed as URIs. If your database password contains special characters, they **must be percent-encoded (URL-encoded)** to prevent connection parse errors.

### Common Special Character Encodings:

| Character | URL Encoded Value | Example Plaintext | Example Encoded in URL |
| :---: | :---: | :--- | :--- |
| `@` | `%40` | `Secret@123` | `Secret%40123` |
| `#` | `%23` | `Pass#2024` | `Pass%232024` |
| `$` | `%24` | `Cash$Flow` | `Cash%24Flow` |
| `%` | `%25` | `Rate%99` | `Rate%2599` |
| `&` | `%26` | `Rock&Roll` | `Rock%26Roll` |
| `+` | `%2B` | `Plus+One` | `Plus%2BOne` |
| `=` | `%3D` | `Key=Value` | `Key%3DValue` |
| `/` | `%2F` | `Path/User` | `Path%2FUser` |
| `:` | `%3A` | `Time:12` | `Time%3A12` |
| `?` | `%3F` | `Why?Not` | `Why%3FNot` |

> **Tip**: If you prefer to avoid URL encoding altogether, choose an alphanumeric password or reset the database password in your provider's dashboard using only alphanumeric characters.

---

## 5. Applying Schema & Testing Connection

1. Copy `.env.example` to `.env` and configure `DATABASE_URL`:
   ```bash
   cp .env.example .env
   ```
2. Generate the Prisma Client and push your database schema:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
3. Verify connection status:
   - When running locally, visit `http://localhost:3000/api/db/health` to confirm the database health check passes.

---

## 6. Common Connection Errors & Troubleshooting

### 1. `P1001: Can't reach database server at db.xxxxx.supabase.co:5432`
- **Cause**: Direct connection endpoint cannot be reached (often due to IPv6 routing or network firewall).
- **Fix**: Switch to the Supabase connection pooler host (`aws-0-[region].pooler.supabase.com:6543`) with username format `postgres.[project-ref]`.

### 2. `Tenant or user not found`
- **Cause**: Username is missing the project reference when connecting through the pooler, or region prefix is incorrect.
- **Fix**: Verify your pooler username is formatted as `postgres.your-project-ref` and the hostname matches your Supabase region (e.g. `aws-0-us-west-1.pooler.supabase.com`).

### 3. `Authentication failed for user`
- **Cause**: The password was entered incorrectly or contains unencoded special characters like `@`.
- **Fix**: Ensure special characters in the password are percent-encoded (e.g., replace `@` with `%40`), or reset the password in the Supabase/Neon dashboard.

### 4. `SSL connection error` or `Connection timeout`
- **Cause**: Missing SSL requirement parameters for cloud databases.
- **Fix**: Append `?sslmode=require` to the end of your `DATABASE_URL`.
