# Family Finance Manager — Multi-Agent Coordination Guide

This workspace contains the **Family Finance Manager** application, a full-stack mobile platform for family budgeting, transaction tracking, debt management, and AI-powered SMS expense parsing.

---

## 1. Project Architecture

The repository is structured into two main packages:

* **`frontend/`**: Expo SDK 58 React Native mobile app (`family-finance`).
  * Routing: Expo Router v58 file-based routes in `src/app/`
  * UI & Animation: Plus Jakarta Sans, Lucide icons, Reanimated 4, Safe Area Context
  * State & Libs: Firebase client, AsyncStorage, SecureStore, i18n, AI SMS parser (`src/lib/aiSmsParser.ts`), AI assistant (`src/lib/ask.ts`)
* **`backend/`**: Node.js & Express 5 API server.
  * Runtime: Node.js 24+, Express 5.2.1
  * Database & Auth: Firebase Admin SDK & Google Cloud Firestore
  * Security: Helmet, CORS, Rate Limiters, Express Validator
  * Routes: `/api/auth`, `/api/me`, `/api/family`, `/api/transactions`, `/api/budgets`, `/api/goals`, `/api/loans`, `/api/recurring`

---

## 2. Specialized Subagents Roster

Specialized agents are defined in `.agents/agents/`:

| Agent | File Path | Specialty |
| :--- | :--- | :--- |
| **`mobile-frontend`** | `.agents/agents/mobile-frontend.md` | Expo SDK 58, React Native UI screens, Reanimated, haptics, mobile components. |
| **`backend-api`** | `.agents/agents/backend-api.md` | Express 5 routes, controllers, Firestore atomic transactions, multi-tenant queries. |
| **`finance-security-auditor`** | `.agents/agents/finance-security-auditor.md` | Security rules, decimal math accuracy, race conditions, cross-family data leak prevention. |
| **`qa-tester`** | `.agents/agents/qa-tester.md` | TypeScript verification, API contract parity, `node:test` runner, Expo doctor. |

---

## 3. Real-World Edge Cases & Battle-Tested Rules Runbook

All agents must adhere strictly to these project-wide rules:

1. **Split Expenses Logic**:
   - Only `myShare` counts as an expense in user budgets, summaries, and trend charts.
   - The remaining share is recorded as a loan (`direction: 'lent'`).
   - Loan repayments from split expenses must **NEVER** generate income transactions. Repayments only clear debt.

2. **Timezone & Date Skew Prevention**:
   - Never parse raw `YYYY-MM-DD` with `new Date("YYYY-MM-DD")` directly; it converts to UTC midnight, resulting in a **5:30 AM** skew in India (IST) and previous-day shifts in Western timezones.
   - Use `buildTransactionDate(dateStr, timeStr)` or `fromDateInput()` (local noon).
   - If user input contains a time of day (e.g. `"12 30"`, `"4 pm"`), extract `HH:mm` and build an exact local ISO timestamp.
   - If no time is specified on a past date, preserve the current local time of day (`now.getHours(), now.getMinutes()`).

3. **Title Casing & Description Sanitization**:
   - Never display raw lowercase text for user-entered merchants or transactions.
   - Run descriptions through `formatDescription()` to ensure Title Case (e.g. `Idly`, `Coffee at Starbucks`), while preserving uppercase acronyms (`UPI`, `ATM`, `KFC`).

4. **Skeleton Loaders over Generic Spinners**:
   - Never display empty screens or single spinning wheels where structured cards belong.
   - Every list screen (`loans.tsx`, `goals.tsx`, `budgets.tsx`, `recurring.tsx`, `requests.tsx`, `family.tsx`) must show matching pulsing skeletons during loading.

5. **AI Model Fallback Chain**:
   - Maintain an active fallback pool: `gemini-3.5-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`.
   - Never rely on a single preview model that can hit 20 req/day free-tier quotas.
   - Never prompt users to enter API keys if `EXPO_PUBLIC_AI_API_KEY` is present in `.env`.

6. **Keyboard Protection & Tab Insets**:
   - Wrap forms in `KeyboardAvoidingView` so text inputs are never obscured.
   - Tab screens must declare `bottomInset={96}` or `paddingBottom: 140` to avoid being hidden behind the floating tab bar.

7. **Strict Workflow Directives**:
   - **NEVER** run `git commit` or `git push` without explicit user permission.
   - **NEVER** trigger `eas build` without explicit user permission.

---

## 4. Key Verification Commands

```powershell
# Frontend Verification
cd C:\Users\ELCOT\Finance-Manager\frontend
npm run typecheck       # tsc --noEmit
npx expo-doctor         # Dependency health check

# Backend Verification
cd C:\Users\ELCOT\Finance-Manager\backend
npm test                # Runs node --test "test/*.test.js"
npm run dev             # Starts Express server with --watch
```
