# Migration Guide: Supabase to Prisma

## Summary
We're migrating from Supabase to local PostgreSQL with Prisma ORM for better local development experience.

## Status
✅ PostgreSQL database running locally with Docker
✅ Schema imported from Supabase
✅ Prisma schema created and client generated
✅ Environment variables configured (.env.local)
✅ Authentication service updated for Prisma
🔄 Migrating API routes and components

## Key Changes

### 1. Database Connections
**Before (Supabase):**
```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
const { data, error } = await supabase.from('users').select()
```

**After (Prisma):**
```typescript
import prisma from '@/lib/prisma'
const users = await prisma.user.findMany()
```

### 2. Authentication
**Before:**
```typescript
import { createOrUpdateUser, setSession } from '@/lib/auth/direct-auth'
```

**After:**
```typescript
import { createOrUpdateUser, setSession } from '@/lib/auth/direct-auth-prisma'
```

### 3. Common Query Patterns

#### Insert
**Supabase:**
```typescript
const { data, error } = await supabase
  .from('users')
  .insert({ email, name })
  .select()
  .single()
```

**Prisma:**
```typescript
const user = await prisma.user.create({
  data: { email, name }
})
```

#### Update
**Supabase:**
```typescript
const { data, error } = await supabase
  .from('users')
  .update({ name })
  .eq('id', userId)
```

**Prisma:**
```typescript
const user = await prisma.user.update({
  where: { id: userId },
  data: { name }
})
```

#### Upsert
**Supabase:**
```typescript
const { data, error } = await supabase
  .from('users')
  .upsert({ email, name }, { onConflict: 'email' })
```

**Prisma:**
```typescript
const user = await prisma.user.upsert({
  where: { email },
  update: { name },
  create: { email, name }
})
```

#### Delete
**Supabase:**
```typescript
const { error } = await supabase
  .from('users')
  .delete()
  .eq('id', userId)
```

**Prisma:**
```typescript
await prisma.user.delete({
  where: { id: userId }
})
```

## Files to Update
- [ ] `/app/api/auth/callback/google/route.ts` → Use Prisma
- [ ] `/app/api/auth/callback/outlook/route.ts` → Use Prisma
- [ ] `/app/api/auth/connect/[provider]/route.ts` → Use Prisma
- [ ] `/app/settings/page.tsx` → Update client to use Prisma API
- [ ] `/app/api/test/email-connections/route.ts` → Use Prisma
- [ ] `/app/api/auth/me/route.ts` → Use Prisma
- [ ] All other API routes using Supabase

## Running Locally
1. Ensure Docker is running
2. Database should be at: `postgresql://postgres:localdev123@localhost:5432/aibroker`
3. Run: `cd ai-broker-web && npm run dev:local`
4. Access Prisma Studio: `npm run prisma:studio`

## Next Steps
1. Complete migration of all API routes
2. Test OAuth flows with local database
3. Update email processing to use Prisma
4. Remove Supabase dependencies once migration is complete