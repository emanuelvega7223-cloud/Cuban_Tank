# Cuban Tank — Lead Capture Setup

Follow these steps in order. Total time: **~30 minutes**. Total cost: **~$22/mo** ($20 n8n + $1.15 Twilio number + ~$0.008 per SMS sent).

---

## Step 1 — Airtable (the database) · 5 min · free

1. Go to **<https://airtable.com>** → **Sign up** with the email Cris uses.
2. Create a new base called **`Cuban Tank Leads`**.
3. Rename the first table to **`Leads`** and set up these columns (exact names, exact types):

   | Column name   | Field type      | Notes                                       |
   |---------------|-----------------|---------------------------------------------|
   | First Name    | Single line text |                                            |
   | Last Name     | Single line text |                                            |
   | Email         | Email           |                                             |
   | Phone         | Phone number    |                                             |
   | Reference     | Single line text | Auto-filled (CT-2026-…)                     |
   | Submitted At  | Date            | ✔ "Include time field" + "Use the same time zone for all collaborators" |
   | Status        | Single select   | Options: `New`, `Contacted`, `Booked`, `Declined` |

4. Click your account avatar (top right) → **Developer hub** → **Personal access tokens** → **Create new token**:
   - Name: `n8n integration`
   - Scopes: `data.records:read` and `data.records:write`
   - Access: select the `Cuban Tank Leads` base
   - Copy the token (starts with `pat...`). **Save it somewhere safe — Airtable only shows it once.**

5. Get the base ID:
   - Open <https://airtable.com/api> → click on **Cuban Tank Leads**.
   - The URL will contain `appXXXXXXXXXXXXXX` — that's your **Base ID**. Save it.

---

## Step 2 — Twilio (SMS sender) · 10 min · $1.15/mo + $0.008/SMS

1. Go to **<https://www.twilio.com/try-twilio>** → sign up (real name, real phone — they verify).
2. Once in the console, click **Phone Numbers → Manage → Buy a number**:
   - Country: United States
   - Capabilities: ☑ SMS
   - Buy a number (~$1.15/mo). **Save the number** — you'll paste it into n8n.
3. From the **Console Dashboard**, copy:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click "Show" to reveal)

   Save both — you'll paste them into n8n.

> ⚠️ **Trial limitation:** During the free trial Twilio only delivers SMS to *verified* numbers (the one you signed up with). To send to any client, upgrade the account ($20 credit minimum).

---

## Step 3 — n8n (the workflow runner) · 10 min · $20/mo

1. Go to **<https://app.n8n.cloud/register>** → sign up. 14-day free trial.
2. Once in: click **Workflows** (left sidebar) → top-right `⋯` menu → **Import from File** → choose `n8n-workflow.json` from this project folder. You'll see a 5-node workflow on the canvas.
3. Click the **Twilio — SMS to client** node:
   - Under **Credential to connect with**, click **Create new** → paste your Twilio **Account SID** and **Auth Token** from Step 2 → save.
   - Click **Variables** (bottom-left sidebar in n8n) → add a variable `TWILIO_FROM_NUMBER` with your Twilio number in E.164 format, e.g. `+13055551234`.
4. Click the **Airtable — Append lead** node:
   - Under **Credential to connect with**, click **Create new** → Authentication: **Personal Access Token** → paste the `pat...` token from Step 1 → save.
   - For **Base**, click "From list" and pick `Cuban Tank Leads`. For **Table**, pick `Leads`.
5. Top-right corner: click **Active** toggle to turn the workflow on.
6. Click the **Webhook — /apply** node → copy the **Production URL**. It looks like:
   `https://yourname.app.n8n.cloud/webhook/cubantank-apply`

---

## Step 4 — Paste the URL into the site · 1 min

1. Open `index.html`.
2. Search for `N8N_WEBHOOK_URL`.
3. Paste the URL between the quotes:
   ```js
   const N8N_WEBHOOK_URL = 'https://yourname.app.n8n.cloud/webhook/cubantank-apply';
   ```
4. Save the file.
5. Commit + push:
   ```bash
   cd /Users/josevega/Desktop/cubanktank
   git add index.html
   git commit -m "wire n8n webhook URL"
   git push
   ```

---

## Step 5 — Test it · 2 min

1. Open `index.html` in a browser.
2. Click **Apply for Coaching** → fill the modal with real info (your own email + phone for the test).
3. Submit.
4. Within 5 seconds you should:
   - See the "You're Locked In." success screen.
   - Get an SMS on the phone you typed.
   - See a new row in the Airtable base.

If something fails, in n8n click **Executions** in the sidebar — every webhook hit shows up there with the full payload + which node errored.

---

## Optional: notify yourself when a lead comes in

In n8n, drag a second **Twilio** node after the Webhook → set **To** to your own phone number → message body: `New lead: {{ $json.firstName }} {{ $json.lastName }} · {{ $json.phone }}`. Connect it to the existing flow.

---

## Where things are

| What | Where |
|---|---|
| Form on the site | `index.html` → search `applyModalForm` |
| Webhook URL slot | `index.html` → search `N8N_WEBHOOK_URL` |
| n8n workflow JSON | `n8n-workflow.json` (this folder) |
| Lead database | Airtable base `Cuban Tank Leads` → `Leads` table |
| SMS log | Twilio Console → Monitor → Logs → Messaging |
| Workflow executions | n8n → Executions tab |
